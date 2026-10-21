"""The discipline picker must resume actual curriculum use across devices."""
import asyncio
from datetime import datetime
from urllib.parse import parse_qs, urlparse

from test_study_resume import (
    main, httpx, Session, child_id_for, register_and_login, require,
)
from models.database import ChildProfile, ProgrammingSubject, StudyDiscipline, User


async def run():
    main.on_startup()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://testserver") as client:
        headers = await register_and_login(client, email="last-discipline@example.com", cpf="52998224725")
        other_headers = await register_and_login(client, email="other-discipline@example.com", cpf="11144477735")
        child_id = child_id_for("last-discipline@example.com")
        other_child_id = child_id_for("other-discipline@example.com")
        empty = await client.get("/api/study/resume?scope=curriculum", headers=headers)
        require(empty.json()["has_resume"] is False, "no study history must keep the ordinary picker available")

        with Session(main.engine) as session:
            discipline = StudyDiscipline(child_id=child_id, name="Zoologia")
            session.add(discipline)
            session.commit()
            session.refresh(discipline)
            discipline_id = discipline.id
            session.add(ProgrammingSubject(child_id=child_id, name="Animais", track="general", discipline_id=discipline_id, last_used_at=datetime(2026, 10, 19)))
            session.add(ProgrammingSubject(child_id=other_child_id, name="Outro aluno", last_used_at=datetime(2026, 10, 25)))
            session.commit()

        async def current(headers=headers):
            response = await client.get("/api/study/resume?scope=curriculum", headers=headers)
            require(response.status_code == 200, response.text)
            return response.json()

        resumed = await current()
        params = parse_qs(urlparse(resumed["href"]).query)
        require(params.get("discipline_id") == [str(discipline_id)], "must restore the last studied discipline even without a bookmark")
        require(params.get("tab") == ["diverse"], resumed)
        normal = await client.get("/api/study/resume", headers=headers)
        require(normal.json()["has_resume"] is False, "curriculum lookup must not create a bookmark")

        await client.put("/api/study/resume", headers=headers, json={"kind": "language_review"})
        require((await current())["href"] == resumed["href"], "later language study must not erase the last curriculum discipline")
        normal = await client.get("/api/study/resume", headers=headers)
        require(normal.json()["kind"] == "language_review", "scoped lookup must not overwrite global resume")

        with Session(main.engine) as session:
            programming = ProgrammingSubject(child_id=child_id, name="Python", last_used_at=datetime(2026, 10, 21))
            session.add(programming)
            session.commit()
        require("tab=coding" in (await current())["href"], "programming is also a resumable discipline")
        with Session(main.engine) as session:
            user = session.get(User, session.get(ChildProfile, child_id).user_id)
            user.enabled_modules = {**(user.enabled_modules or {}), "coding": False}
            session.add(user)
            session.commit()
        require((await current())["href"] == resumed["href"], "disabled programming must fall back to the last accessible discipline")
        require((await current(other_headers))["label"] == "Outro aluno", "each learner keeps their own history")
    print("last study discipline checks passed")


if __name__ == "__main__":
    asyncio.run(run())
