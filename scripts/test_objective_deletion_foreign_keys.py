"""Deletion must respect the same foreign keys enforced by production Postgres."""
from __future__ import annotations

import argparse
import asyncio

import httpx
from sqlalchemy import event
from sqlmodel import Session

from test_study_plan import ACCOUNT_A, main, require, sign_in


def enforce_foreign_keys(connection, _record) -> None:
    connection.execute("PRAGMA foreign_keys=ON")


async def create_plan(client, headers, title):
    response = await client.post(
        "/api/objectives/plans",
        headers=headers,
        json={
            "goal": title,
            "draft": {
                "title": title,
                "diagnosis": "Revisar duas prioridades",
                "priorities": [
                    {"title": "Primeira", "items": [{"title": "Ler", "weight": 1}, {"title": "Praticar", "weight": 3}]},
                    {"title": "Segunda", "items": [{"title": "Revisar"}]},
                ],
            },
        },
    )
    require(response.status_code == 201, f"create plan failed: {response.text}")
    plan = response.json()
    completed = await client.put(
        f"/api/objectives/items/{plan['objectives'][0]['items'][0]['id']}",
        headers=headers,
        json={"done": True},
    )
    require(completed.status_code == 200, f"marking item failed: {completed.text}")
    archived = await client.put(
        f"/api/objectives/{plan['objectives'][1]['id']}",
        headers=headers,
        json={"status": "archived"},
    )
    require(archived.status_code == 200, f"archiving priority failed: {archived.text}")
    return plan


async def check_plan_deletion(client, headers):
    untouched = await create_plan(client, headers, "Outro plano")
    kept = await create_plan(client, headers, "Preservar progresso")
    kept_item_id = kept["objectives"][0]["items"][0]["id"]
    with Session(main.engine) as session:
        completed_at = session.get(main.ObjectiveItem, kept_item_id).completed_at
    response = await client.delete(f"/api/objectives/plans/{kept['id']}", headers=headers)
    require(response.status_code == 204, f"keeping objectives must return 204: {response.text}")
    with Session(main.engine) as session:
        require(session.get(main.StudyPlan, kept["id"]) is None, "the kept plan must be removed")
        for objective in kept["objectives"]:
            stored = session.get(main.Objective, objective["id"])
            require(stored is not None and stored.plan_id is None and stored.plan_order is None, "all priorities must become standalone, including archived ones")
            for item in objective["items"]:
                require(session.get(main.ObjectiveItem, item["id"]) is not None, "keeping objectives must keep every item")
        completed = session.get(main.ObjectiveItem, kept_item_id)
        require(completed.done and completed.completed_at == completed_at, "keeping objectives must preserve completed work")
        require(session.get(main.Objective, kept["objectives"][1]["id"]).status == "archived", "keeping objectives must preserve their status")

    dropped = await create_plan(client, headers, "Excluir tudo")
    response = await client.delete(
        f"/api/objectives/plans/{dropped['id']}?delete_objectives=true", headers=headers,
    )
    require(response.status_code == 204, f"deleting priorities with foreign keys must return 204: {response.text}")
    with Session(main.engine) as session:
        require(session.get(main.StudyPlan, dropped["id"]) is None, "the deleted plan must be removed")
        for objective in dropped["objectives"]:
            require(session.get(main.Objective, objective["id"]) is None, "every deleted priority must be removed")
            for item in objective["items"]:
                require(session.get(main.ObjectiveItem, item["id"]) is None, "every deleted item must be removed")
        require(session.get(main.StudyPlan, untouched["id"]) is not None, "another plan must remain")
        for objective in untouched["objectives"]:
            require(session.get(main.Objective, objective["id"]).plan_id == untouched["id"], "another plan's priorities must remain linked")
            for item in objective["items"]:
                require(session.get(main.ObjectiveItem, item["id"]) is not None, "another plan's items must remain")
        require(session.get(main.ObjectiveItem, kept_item_id).done, "deleting another plan must preserve standalone progress")


async def check_objective_deletion(client, headers):
    created = await client.post("/api/objectives", headers=headers, json={"title": "Objetivo avulso"})
    require(created.status_code == 201, f"create objective failed: {created.text}")
    objective_id = created.json()["id"]
    added = await client.post(f"/api/objectives/{objective_id}/items", headers=headers, json={"title": "Estudar"})
    require(added.status_code == 201, f"add item failed: {added.text}")
    item_id = added.json()["items"][0]["id"]
    response = await client.delete(f"/api/objectives/{objective_id}", headers=headers)
    require(response.status_code == 204, f"deleting an objective with foreign keys must return 204: {response.text}")
    with Session(main.engine) as session:
        require(session.get(main.Objective, objective_id) is None, "the objective must be removed")
        require(session.get(main.ObjectiveItem, item_id) is None, "the objective's items must be removed")


async def run(case):
    main.on_startup()
    event.listen(main.engine, "connect", enforce_foreign_keys)
    main.engine.dispose()
    with main.engine.connect() as connection:
        require(connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1, "the regression must enforce foreign keys")
    transport = httpx.ASGITransport(app=main.app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        headers = await sign_in(client, ACCOUNT_A)
        if case in {"plan", "all"}:
            await check_plan_deletion(client, headers)
        if case in {"objective", "all"}:
            await check_objective_deletion(client, headers)
    print(f"Objective deletion foreign key checks passed ({case}).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=("plan", "objective", "all"), default="all")
    asyncio.run(run(parser.parse_args().case))
