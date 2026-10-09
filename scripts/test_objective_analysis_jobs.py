"""Durable complete-history analysis: bounded steps, claims and operation billing."""
from __future__ import annotations

import asyncio
import copy
import json
import logging
import os
import threading
from datetime import date, datetime, timedelta
from unittest.mock import patch

import test_objective_study_analysis as fixture
from sqlmodel import Session, select
from sqlalchemy import event
from models.database import ChildProfile, Objective, ProgrammingTopic, StudyLogEntry, UsageRecord, User
from services import objective_analysis_service as analysis
try:
    from services import objective_analysis_job_service as jobs
except ImportError:
    jobs = None

for logger_name in ("main", "httpx", "services.email_service"):
    logging.getLogger(logger_name).setLevel(logging.ERROR)


def require(ok, message):
    fixture.require(ok, message)


def pure_tests():
    require(jobs is not None, "durable analysis steps must exist instead of one capped operation")
    originals = [dict(ref=f"log:{n}", kind="study_log", learning=True,
                      text=f"BEGIN_{n}" + "x" * 20000 + f"TAIL_{n}") for n in range(60)]
    context = dict(records=originals, evidence_refs=[item["ref"] for item in originals],
                   learning_count=60, context_truncated=False, sampling="complete")
    stages, received = [], []
    # A provider's cumulative elapsed time is deliberately irrelevant to a job.
    elapsed = 0
    with patch.object(analysis.time, "monotonic", lambda: elapsed):
        workflow = jobs.new_workflow(title="Aprender", description=None, scope=dict(discipline="Teste", targets=[]),
                                     context=context, base_language="Portuguese", age_group="adult")
        for _ in range(150):
            system, prompt = jobs.step_prompts(workflow)
            body = json.loads(prompt)
            stages.append(body["stage"])
            require(len(prompt) <= analysis.MAX_CONTEXT_CHARS, "every actual prompt is bounded")
            if body["stage"] == "batch":
                received.extend(body["evidence"]["records"])
            elapsed += 25
            raw = fixture.answer() if body["stage"] == "final" else json.dumps(dict(summary="x" * 5900))
            before = copy.deepcopy(workflow)
            workflow, result = jobs.checkpoint(workflow, raw)
            require(before != workflow and workflow["completed_steps"] == len(stages), "a valid response advances one checkpoint")
            if result is not None:
                break
        else:
            raise AssertionError("hierarchical consolidation must terminate")
    require(len(stages) > 12 and elapsed > 50, "job completes beyond former operation caps")
    require("consolidate" in stages and stages[-1] == "final", "hierarchy incorporates every batch before final")
    require(received == originals, "all sixty complete records reach a provider without sampling")
    require(workflow["completed_steps"] == workflow["total_steps"], "completed progress is exact")
    require(result["progress_percent"] == 62, "validated final diagnosis is returned")
    initial = jobs.new_workflow(title="Teste", description=None, scope=dict(discipline="Teste", targets=[]),
                               context=context, base_language="Portuguese", age_group="adult")
    before = copy.deepcopy(initial)
    try:
        jobs.checkpoint(initial, "{}")
    except ValueError:
        pass
    else:
        raise AssertionError("invalid summary must fail")
    require(initial == before, "invalid output cannot advance private state")
    verbose_scope = dict(discipline_key="discipline:1", discipline="d" * 100, available=True,
                         targets=[dict(key=f"topic:{n}", topic_id=n, title="t" * 200, subject="s" * 100,
                                       subject_id=1, available=True) for n in range(60)])
    verbose = jobs.new_workflow(title="t" * 120, description="d" * 500, scope=verbose_scope,
                                context=context, base_language="Portuguese", age_group="adult")
    require(verbose["inputs"]["scope"] == verbose_scope, "full evaluated scope remains available for publication")
    require(isinstance(verbose.get("summary_chars"), int) and verbose["summary_chars"] * 2 + 512 < verbose["record_budget"],
            "adaptive summary ceiling must guarantee multiple summaries fit a reduction group")
    before = copy.deepcopy(verbose)
    try:
        jobs.checkpoint(verbose, json.dumps(dict(summary="x" * verbose["summary_chars"])))
    except ValueError:
        pass
    else:
        raise AssertionError("encoded summary above its adaptive ceiling must be rejected")
    require(verbose == before, "an oversized adaptive summary cannot modify the current checkpoint")
    received = []
    for _ in range(500):
        _, prompt = jobs.step_prompts(verbose)
        body = json.loads(prompt)
        require(len(prompt) <= analysis.MAX_CONTEXT_CHARS, "verbose sixty-topic scope still produces bounded prompts")
        if body["stage"] == "batch":
            received.extend(body["evidence"]["records"])
        raw = fixture.answer() if body["stage"] == "final" else json.dumps(dict(summary="x" * (verbose["summary_chars"] - 2)))
        verbose, result = jobs.checkpoint(verbose, raw)
        if result is not None:
            break
    else:
        raise AssertionError("a valid verbose sixty-topic scope must finish hierarchical reduction")
    intact, fragments = {}, {}
    for record in received:
        if "record_json_fragment" in record:
            fragments.setdefault(record["ref"], []).append(record)
        else:
            intact[record["ref"]] = record
    for record in originals:
        pieces = fragments.get(record["ref"])
        restored = json.loads("".join(piece["record_json_fragment"] for piece in sorted(pieces, key=lambda item: item["fragment_index"]))) if pieces else intact[record["ref"]]
        require(restored == record, "verbose scope retains full evidence through lossless fragmentation")


class Provider:
    def __init__(self):
        self.calls = []
        self.fail = False
        self.invalid = False
        self.during = None

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        require(kwargs["timeout_seconds"] == 45, "each provider request is capped at 45 seconds")
        if self.during:
            self.during()
        if self.fail:
            raise RuntimeError("provider unavailable")
        if kwargs["ai_config"].on_success:
            kwargs["ai_config"].on_success()
        if self.invalid:
            return "{}"
        stage = json.loads(kwargs["prompt"])["stage"]
        return fixture.answer() if stage == "final" else json.dumps(dict(summary="All batch evidence retained"))


async def http_tests():
    # Workflow HTTP tests need the current schema; migration compatibility is
    # exercised separately without replaying all historical migrations here.
    event.listen(fixture.main.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
    fixture.main.create_db_and_tables()
    fake = Provider()
    fixture.main.phrase_generation_service.generate_json_text = fake
    async with fixture.httpx.AsyncClient(transport=fixture.httpx.ASGITransport(app=fixture.main.app), base_url="http://testserver") as client:
        headers, child_id = await fixture.login(client, "job-a@example.com", "52998224725")
        foreign, foreign_id = await fixture.login(client, "job-b@example.com", "39053344705")
        ids = fixture.seed(child_id, foreign_id)
        await client.put("/api/ai/settings", headers=headers, json=dict(provider="openai", api_key="private-test-key", model="gpt-test"))
        with Session(fixture.main.engine) as db:
            for n in range(60):
                db.add(StudyLogEntry(child_id=child_id, studied_on=date(2001, 1, 1) + timedelta(days=n),
                                    title=f"Distribution {n}", discipline="Matemática", subject="Estatística",
                                    subject_id=ids["statistics"], content=f"JOB_EVIDENCE_{n}" + "x" * 20000 + f"TAIL_{n}"))
            db.commit()
        created = await client.post("/api/objectives", headers=headers, json=dict(title="Complete history", study_scope=dict(
            discipline_key=f"discipline:{ids['discipline']}", target_keys=[f"subject:{ids['statistics']}"])))
        require(created.status_code == 201, created.text)
        oid = created.json()["id"]
        start_url = f"/api/objectives/{oid}/analysis-job"

        def accounting(credits=None):
            with Session(fixture.main.engine) as db:
                user = db.get(User, db.get(ChildProfile, child_id).user_id)
                if credits is not None:
                    user.ai_credits = credits; user.ai_daily_credit_limit = 0
                    user.ai_credits_reset_date = fixture.main.activity_today()
                    db.add(user); db.commit()
                usage = db.exec(select(UsageRecord).where(UsageRecord.user_id == user.id)).all()
                return user.ai_credits, user.ai_credits_used, len(usage)

        async def start():
            response = await client.post(start_url, headers=headers)
            require(response.status_code == 200, response.text)
            body = response.json()
            require(set(body) == {"job_id", "status", "completed_steps", "total_steps", "objective"}, "public job envelope has no private data")
            return body

        async def step(job, expected=200, check_calls=True):
            before = len(fake.calls)
            response = await client.post(f"{start_url}/{job['job_id']}/step", headers=headers)
            require(response.status_code == expected, response.text)
            if check_calls:
                require(len(fake.calls) - before <= 1, "an HTTP step performs at most one provider call")
            return response.json()

        before = accounting()
        require(type(fixture.main.rate_limiter).__name__ == "SlidingWindowRateLimiter", "SQLite admission uses the real in-memory limiter without a second write connection")
        previous_rule = fixture.main.AI_RATE_RULE
        fixture.main.rate_limiter.reset()
        fixture.main.AI_RATE_RULE = fixture.main.RateLimitRule(name="ai", limit=1, window_seconds=3600)
        job = await start()
        require(job["status"] == "pending" and job["completed_steps"] == 0 and job["total_steps"] > 12, "large history is admitted without provider-cap rejection")
        require(job["objective"] is None and not fake.calls, "starting only snapshots work")
        pending_objective = next(item for item in (await client.get("/api/objectives", headers=headers)).json() if item["id"] == oid)
        require(pending_objective.get("study_analysis_pending") is True, "objective list exposes only a safe pending flag for resume")
        require((await client.post(start_url, headers=foreign)).status_code == 404, "foreign profile cannot start another objective")
        require((await client.post(f"{start_url}/{job['job_id']}/step", headers=foreign)).status_code == 404, "foreign profile cannot step another objective")
        job = await step(job)
        require(job["completed_steps"] == 1 and job["objective"] is None, "partial step cannot publish diagnosis")
        require((await start())["job_id"] == job["job_id"], "start resumes a matching incomplete snapshot")
        fake.fail = True
        await step(job, 502)
        fake.fail = False; fake.invalid = True
        await step(job, 502)
        fake.invalid = False
        require((await start())["completed_steps"] == 1, "provider failure and invalid answer preserve the checkpoint")
        while job["status"] != "complete":
            job = await step(job)
        require(job["objective"]["study_analysis"]["evidence_count"] == 61, "final evidence count covers all original history")
        require(accounting()[2] == before[2] + 1, "own-key usage is once per job despite many steps and retries")
        saved = job["objective"]["study_analysis"]
        require(job["objective"].get("study_analysis_pending") is False, "completed analysis clears pending resume flag")
        calls = len(fake.calls)
        require((await step(job))["objective"]["study_analysis"] == saved and len(fake.calls) == calls, "lost final response retry returns the published result without another call")
        listing = (await client.get("/api/objectives", headers=headers)).text
        require("analysis_workflow" not in listing and "private-test-key" not in listing, "private snapshot and secrets never enter objective schema")
        exported = await client.get("/api/account/export", headers=headers)
        require(exported.status_code == 200 and "analysis_workflow" not in exported.text, "account export keeps workflow state private")
        fixture.main.AI_RATE_RULE = previous_rule

        # A completed job starts a fresh analysis. Unanswered failures refund;
        # answered retries retain the same reservation even at zero balance.
        os.environ["GEMINI_API_KEY"] = "platform-test-key"
        await client.put("/api/ai/settings", headers=headers, json=dict(provider="gemini", use_global_key=True))
        before = accounting(1)
        job = await start()
        fake.fail = True
        await step(job, 502)
        require(accounting() == before, "unanswered provider failure refunds its credit without usage")
        fake.fail = False
        job = await step(job)
        require(accounting() == (0, before[1] + 1, before[2] + 1), "first answer consumes precisely one metered operation")
        require((await start())["job_id"] == job["job_id"], "last reserved credit does not block resume")
        no_credit_options = (await client.get("/api/objectives/study-options", headers=headers)).json()
        pending_objective = next(item for item in (await client.get("/api/objectives", headers=headers)).json() if item["id"] == oid)
        require(no_credit_options["ai_unavailable_reason"] == "no_credits" and pending_objective["study_analysis_pending"],
                "a last-credit admitted job remains visibly resumable")
        fake.invalid = True
        await step(job, 502)
        fake.invalid = False
        require(accounting() == (0, before[1] + 1, before[2] + 1), "invalid later answer does not charge again")
        job = await step(job)
        with Session(fixture.main.engine) as db:
            state = db.get(Objective, oid).analysis_workflow
            require("platform-test-key" not in json.dumps(state) and "private-test-key" not in json.dumps(state), "durable state stores no API keys")
        current = next(item for item in (await client.get("/api/objectives", headers=headers)).json() if item["id"] == oid)
        require(current["study_analysis"] == saved, "all incomplete workflows preserve previous published diagnosis")

        # An overlapping step returns its live claim without calling twice.
        entered, release = threading.Event(), threading.Event()
        def block():
            entered.set()
            require(release.wait(10), "concurrency test releases provider")
        fake.during = block
        pending = asyncio.create_task(step(job))
        require(await asyncio.to_thread(entered.wait, 10), "first request enters provider")
        calls = len(fake.calls)
        running = await step(job)
        require(running["status"] == "running" and running["completed_steps"] == job["completed_steps"] and len(fake.calls) == calls,
                "active claim prevents simultaneous provider calls")
        release.set(); job = await pending; fake.during = None
        require(accounting() == (0, before[1] + 1, before[2] + 1), "concurrent requests never double charge")

        # Changed objective inputs are checked before an external call.
        await client.put(f"/api/objectives/{oid}", headers=headers, json=dict(title="Changed objective"))
        calls = len(fake.calls)
        await step(job, 409)
        require(len(fake.calls) == calls, "stale inputs reject before calling provider")
        accounting(1)
        job = await start()
        require(job["completed_steps"] == 0, "changed inputs receive a fresh snapshot")
        # Settings edits during an in-flight answer invalidate the worker.
        def change_settings():
            with Session(fixture.main.engine) as db:
                record = fixture.main.get_user_ai_settings_record(db.get(ChildProfile, child_id).user_id, db)
                record.model = "changed-during-call"; record.updated_at = datetime.utcnow()
                db.add(record); db.commit()
        fake.during = change_settings
        await step(job, 409)
        fake.during = None
        with Session(fixture.main.engine) as db:
            objective = db.get(Objective, oid)
            require(objective.analysis_workflow["completed_steps"] == 0, "changed provider settings cannot checkpoint")
            require(objective.study_analysis is not None, "settings race preserves prior analysis")

        # An expired worker cannot checkpoint after another request takes its
        # lease, nor release that replacement's checkpoint or charge again.
        accounting(1)
        job = await start()
        entered, release = threading.Event(), threading.Event()
        def block_stale():
            entered.set()
            require(release.wait(10), "stale worker is eventually released")
        fake.during = block_stale
        stale_request = asyncio.create_task(step(job, 409, check_calls=False))
        require(await asyncio.to_thread(entered.wait, 10), "stale worker entered its provider")
        with Session(fixture.main.engine) as db:
            objective = db.get(Objective, oid)
            workflow = copy.deepcopy(objective.analysis_workflow)
            workflow["claim"]["expires_at"] = (datetime.utcnow() - timedelta(seconds=1)).isoformat()
            objective.analysis_workflow = workflow; db.add(objective); db.commit()
        fake.during = None
        before = accounting()
        replacement = await step(job)
        after = accounting()
        require(replacement["completed_steps"] == 1 and after == (0, before[1] + 1, before[2] + 1),
                "replacement reuses expired reservation and records exactly one answer")
        release.set(); await stale_request
        require(accounting() == after and (await start())["completed_steps"] == 1,
                "late worker cannot release checkpoint or double-charge its replacement")

        # Reopening after changed study data starts a new complete snapshot.
        with Session(fixture.main.engine) as db:
            db.add(StudyLogEntry(child_id=child_id, studied_on=date.today(), title="New evidence", discipline="Matemática",
                                subject="Estatística", subject_id=ids["statistics"], content="NEW_SNAPSHOT_EVIDENCE"))
            db.commit()
        changed_history = await start()
        require(changed_history["job_id"] != replacement["job_id"] and changed_history["completed_steps"] == 0,
                "changed history invalidates the start/resume evidence fingerprint")
        await step(replacement, 404)

        # Topology changes during a provider call are rejected before saving.
        accounting(1)
        def change_curriculum():
            with Session(fixture.main.engine) as db:
                db.add(ProgrammingTopic(subject_id=ids["statistics"], title="New curriculum topic")); db.commit()
        fake.during = change_curriculum
        await step(changed_history, 409)
        fake.during = None
        with Session(fixture.main.engine) as db:
            objective = db.get(Objective, oid)
            require(objective.analysis_workflow["completed_steps"] == 0, "curriculum race cannot persist an obsolete checkpoint")
            require(objective.study_analysis is not None, "curriculum race preserves prior diagnosis")

        # Foreign keys remain enforced, and a stored workflow introduces no
        # child/account/plan dependencies that can prevent objective deletion.
        deleted = await client.delete(f"/api/objectives/{oid}", headers=headers)
        require(deleted.status_code == 204, deleted.text)
        require((await client.post(f"{start_url}/{changed_history['job_id']}/step", headers=headers)).status_code == 404,
                "a deleted objective cannot be resurrected by its job")

        created = await client.post("/api/objectives", headers=headers, json=dict(title="Small final diagnosis", study_scope=dict(
            discipline_key=f"discipline:{ids['discipline']}", target_keys=[f"topic:{ids['derivatives']}"])))
        oid = created.json()["id"]
        start_url = f"/api/objectives/{oid}/analysis-job"
        before = accounting(1)
        job = await start()
        require(job["total_steps"] == 1, "small histories use one final provider call")
        fake.invalid = True
        await step(job, 502)
        fake.invalid = False
        after = accounting()
        require(after == (0, before[1] + 1, before[2] + 1), "invalid answered final output is counted once")
        with Session(fixture.main.engine) as db:
            objective = db.get(Objective, oid)
            require(objective.study_analysis is None and objective.analysis_workflow["completed_steps"] == 0,
                    "invalid final assessment cannot publish or advance")
        require((await start())["job_id"] == job["job_id"], "invalid final answer is resumable without another credit")
        completed = await step(job)
        require(completed["status"] == "complete" and accounting() == after, "retry validates final without double charge")
        require(completed["objective"]["study_analysis"]["progress_percent"] is None,
                "empty learning history retains insufficient-evidence behavior")
        unadmitted = await start()
        calls = len(fake.calls)
        await step(unadmitted, 402)
        require(len(fake.calls) == calls and accounting() == after, "fresh job with no credit cannot call the platform provider")

        # Switching billing sources requires a fresh job; own keys work without
        # platform allowance and can never reuse a metered source's callbacks.
        await client.put("/api/ai/settings", headers=headers, json=dict(provider="openai", api_key="replacement-own-key", model="gpt-test"))
        await step(unadmitted, 409)
        own_job = await start()
        require(own_job["job_id"] != unadmitted["job_id"], "provider/billing source switch starts a fresh snapshot")
        own_completed = await step(own_job)
        require(own_completed["status"] == "complete" and accounting() == (0, after[1], after[2] + 1),
                "own-key job works at zero allowance and only records own usage")


if __name__ == "__main__":
    pure_tests()
    asyncio.run(http_tests())
    print("PASS resumable objective jobs: full history, bounded steps, retries, claims, billing and signatures")
