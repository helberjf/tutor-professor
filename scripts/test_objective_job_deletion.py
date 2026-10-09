"""Erasure settles an unanswered reservation before removing its receipt."""
from __future__ import annotations

import asyncio
import os
import threading
from sqlalchemy import event
from sqlmodel import Session

import test_objective_analysis_jobs as jobs_test

fixture, Provider, require = jobs_test.fixture, jobs_test.Provider, jobs_test.require


async def deletion_tests():
    event.listen(fixture.main.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
    fixture.main.create_db_and_tables()
    os.environ["GEMINI_API_KEY"] = "platform-test-key"
    async with fixture.httpx.AsyncClient(transport=fixture.httpx.ASGITransport(app=fixture.main.app), base_url="http://testserver") as client:
        headers, child_id = await fixture.login(client, "deletion-a@example.com", "52998224725")
        _, foreign_id = await fixture.login(client, "deletion-b@example.com", "39053344705")
        ids = fixture.seed(child_id, foreign_id)
        await client.put("/api/ai/settings", headers=headers, json=dict(provider="gemini", use_global_key=True))

        def accounting(credits=None):
            with Session(fixture.main.engine) as db:
                user = db.get(fixture.User, db.get(fixture.ChildProfile, child_id).user_id)
                if credits is not None:
                    user.ai_credits = credits; user.ai_daily_credit_limit = 0
                    user.ai_credits_reset_date = fixture.main.activity_today()
                    db.add(user); db.commit()
                return user.ai_credits, user.ai_credits_used

        scope = dict(discipline_key=f"discipline:{ids['discipline']}", target_keys=[f"topic:{ids['limits']}"])
        for plan_deletion in (False, True):
            if plan_deletion:
                response = await client.post("/api/objectives/plans", headers=headers, json=dict(goal="Delete with reservation",
                    draft=dict(title="Delete plan", diagnosis="Practice", priorities=[dict(title="Delete priority", items=[dict(title="Read")])])))
                require(response.status_code == 201, response.text)
                plan = response.json()
                oid = plan["objectives"][0]["id"]
                await client.put(f"/api/objectives/{oid}", headers=headers, json=dict(study_scope=scope))
                delete_url = f"/api/objectives/plans/{plan['id']}?delete_objectives=true"
            else:
                response = await client.post("/api/objectives", headers=headers, json=dict(title="Delete during call", study_scope=scope))
                require(response.status_code == 201, response.text)
                oid = response.json()["id"]
                delete_url = f"/api/objectives/{oid}"
            job_url = f"/api/objectives/{oid}/analysis-job"
            response = await client.post(job_url, headers=headers)
            require(response.status_code == 200, response.text)
            job = response.json()
            fake = Provider(); fake.fail = True
            fixture.main.phrase_generation_service.generate_json_text = fake
            entered, release = threading.Event(), threading.Event()
            def block():
                entered.set()
                require(release.wait(10), "deletion race releases the provider")
            fake.during = block
            before = accounting(1)
            provider_request = asyncio.create_task(client.post(f"{job_url}/{job['job_id']}/step", headers=headers))
            require(await asyncio.to_thread(entered.wait, 10), "first call reserves credit before provider")
            require(accounting() == (0, before[1]), "the sole credit is reserved but unanswered")
            deleted = await client.delete(delete_url, headers=headers)
            require(deleted.status_code == 204, deleted.text)
            release.set()
            failed = await provider_request
            require(failed.status_code == 502, failed.text)
            require(accounting() == before, "deletion refunds the unanswered reservation atomically before erasing its receipt")
            with Session(fixture.main.engine) as db:
                require(db.get(fixture.Objective, oid) is None, "late worker cannot resurrect deleted objective")


if __name__ == "__main__":
    asyncio.run(deletion_tests())
    print("PASS direct/plan erasure refunds in-flight unanswered job reservations with foreign keys enforced")
