"""Full objective history, lossless batching, atomic persistence and operation credits."""
from __future__ import annotations

import asyncio
import json
import os
from datetime import date, timedelta
from unittest.mock import patch

import test_objective_study_analysis as fixture
from sqlmodel import Session, select
from models.database import (ChildProfile, CodingReviewItem, Lesson, LessonItem, LessonQuestion, Objective, ProgrammingFlashcard,
                             ProgrammingQuestion, ProgrammingSubject, ProgrammingTopic,
                             StudyLogEntry, StudyQuestion, UsageRecord, User)
from services import objective_analysis_service as service

require = fixture.require


def collection_tests(child_id, foreign_id, ids):
    with Session(fixture.main.engine) as db:
        child = db.get(ChildProfile, child_id)
        options = service.study_options(db, child, {"coding": True, "diverse": True})
        discipline_key = f"discipline:{ids['discipline']}"
        limits = db.get(ProgrammingTopic, ids["limits"])
        integrals = db.exec(select(ProgrammingTopic).where(ProgrammingTopic.subject_id == limits.subject_id,
                                                          ProgrammingTopic.title == "Integrais")).one()
        automatic = db.exec(select(StudyLogEntry).where(StudyLogEntry.child_id == child_id,
                                                        StudyLogEntry.source == "topic")).one()
        automatic.summary = "a" * 5000 + "AUTOMATIC_SUMMARY_TAIL"
        db.add(automatic)
        db.add(StudyLogEntry(child_id=child_id, studied_on=date.today(), title="Outro tópico automático",
                            discipline="Matemática", subject="Cálculo", subject_id=limits.subject_id,
                            source="topic", source_id=integrals.id, summary="UNSELECTED_AUTOMATIC_TOPIC"))
        for n in range(90):
            db.add(StudyLogEntry(child_id=child_id, studied_on=date(2000, 1, 1) + timedelta(days=n),
                                title=f"Antigo {n}", discipline="Matemática", subject="Cálculo",
                                subject_id=limits.subject_id, content=("x" * 5000 + "OLDEST_TEXT_TAIL") if n == 0 else f"NOTE_{n}"))
            db.add(ProgrammingQuestion(child_id=child_id, subject_id=limits.subject_id, topic_id=limits.id,
                                       question=f"OLD_QUESTION_{n}", question_key=f"old-{n}", options=["A", "B"],
                                       correct_option="A", explanation=f"EXPLANATION_{n}", last_selected_option="B",
                                       attempt_count=2, correct_count=1, error_count=1))
            card = ProgrammingFlashcard(child_id=child_id, subject_id=limits.subject_id, topic_id=limits.id,
                                        front=f"OLD_REVIEW_{n}", back="Resposta",
                                        code_example="x" * 5000 + "REVIEW_CODE_TAIL" if n == 0 else None)
            db.add(card); db.flush()
            db.add(CodingReviewItem(child_id=child_id, flashcard_id=card.id, attempt_count=1,
                                   error_count=1, last_rating="again"))
        # Foreign counters must not leak through a selected owned topic id.
        db.add(ProgrammingQuestion(child_id=foreign_id, subject_id=limits.subject_id, topic_id=limits.id,
                                   question="FOREIGN_COUNTER", question_key="foreign-counter", options=["A", "B"],
                                   correct_option="A", explanation="private", attempt_count=1))
        db.commit()
        subset = service.resolve_scope(dict(discipline_key=discipline_key,
                                           target_keys=[f"topic:{limits.id}"]), options)
        context = service.collect_evidence(db, child, subset)
        text = json.dumps(context, ensure_ascii=False)
        for marker in ["OLDEST_TEXT_TAIL", "OLD_QUESTION_0", "OLD_REVIEW_0", "AUTOMATIC_SUMMARY_TAIL", "EXPLANATION_0", "REVIEW_CODE_TAIL"]:
            require(marker in text, f"complete history retains old records and full fields: {marker}")
        for marker in ["UNSELECTED_AUTOMATIC_TOPIC", "FORA_HISTORIA", "FORA_LOG_PERFIL", "FOREIGN_COUNTER"]:
            require(marker not in text, f"full history excludes other scope/tenant: {marker}")
        require(context["learning_count"] == 183, "subset counts every topic, question and review once")
        require(not context["context_truncated"] and context["sampling"] == "complete", "complete history is not called sampled")
        require(len(set(context["evidence_refs"])) == context["learning_count"], "raw evidence refs remain unique")
        require(all(not record["learning"] for record in context["records"] if record["kind"] == "general_subject_context"),
                "subject notes remain contextual for a selected subset")
        full = service.resolve_scope(dict(discipline_key=discipline_key, target_keys=[
            f"topic:{limits.id}", f"topic:{ids['derivatives']}", f"topic:{integrals.id}"]), options)
        complete_subject = service.collect_evidence(db, child, full)
        require(complete_subject["learning_count"] == 275, "complete selected subject counts all its 91 content notes once")
        require(any(record["kind"] == "subject_study" and record["learning"] for record in complete_subject["records"]),
                "all subject curriculum selected makes general notes evidence of subject study")
        twin = ProgrammingSubject(child_id=child_id, name="Cálculo", track="general", discipline_id=ids["discipline"])
        db.add(twin); db.flush()
        db.add(ProgrammingTopic(subject_id=twin.id, title="Currículo separado"))
        ambiguous = StudyLogEntry(child_id=child_id, studied_on=date.today(), title="Nota ambígua",
                                  discipline="Matemática", subject="Cálculo", content="AMBIGUOUS_GENERAL_NOTE")
        db.add(ambiguous); db.commit()
        ambiguous_context = service.collect_evidence(db, child, full)
        ambiguous_record = next(record for record in ambiguous_context["records"] if record["ref"] == f"log:{ambiguous.id}")
        require(not ambiguous_record["learning"], "name-only notes with another equally named curriculum remain contextual")


def lesson_collection_tests(child_id, foreign_id):
    with Session(fixture.main.engine) as db:
        child = db.get(ChildProfile, child_id)
        lesson = db.exec(select(Lesson).where(Lesson.child_id == child_id, Lesson.theme == "Entrevista")).one()
        lesson.content = dict(text="x" * 5000 + "FULL_LESSON_TAIL"); db.add(lesson)
        for n in range(90):
            db.add(LessonItem(lesson_id=lesson.id, word_en=f"FULL_WORD_{n}", word_pt="palavra",
                              example_sentence_en="Example", example_sentence_pt="Exemplo"))
            db.add(StudyQuestion(child_id=child_id, area="english", subject_name="Inglês", topic_key=f"grammar:{lesson.id}",
                                 topic_title=lesson.title, question=f"OLD_LANGUAGE_QUESTION_{n}", question_key=f"language-{n}",
                                 options=["A", "B"], correct_option="A", explanation=f"LANGUAGE_EXPLANATION_{n}",
                                 last_selected_option="B", attempt_count=1, error_count=1))
            db.add(LessonQuestion(child_id=child_id, lesson_id=lesson.id, target_language="English", question_type="vocab",
                                  front=f"OLD_LANGUAGE_REVIEW_{n}", front_key=f"review-{n}", back="Answer", attempt_count=1,
                                  error_count=1, supporting_example="REVIEW_EXAMPLE"))
        db.add(StudyQuestion(child_id=foreign_id, area="english", subject_name="Inglês", topic_key=f"grammar:{lesson.id}",
                             topic_title=lesson.title, question="FOREIGN_LANGUAGE_QUESTION", question_key="foreign-language",
                             options=["A", "B"], correct_option="A", explanation="private", attempt_count=1))
        db.commit()
        options = service.study_options(db, child, {"coding": True, "diverse": True})
        english = next(group for group in options if group["name"] == "Inglês")
        target = next(target for target in english["targets"] if target["subject"] == "Entrevista")
        scope = service.resolve_scope(dict(discipline_key=english["key"], target_keys=[target["key"]]), options)
        context = service.collect_evidence(db, child, scope)
        text = json.dumps(context, ensure_ascii=False)
        for marker in ["FULL_LESSON_TAIL", "FULL_WORD_89", "OLD_LANGUAGE_QUESTION_0", "OLD_LANGUAGE_REVIEW_0", "LANGUAGE_EXPLANATION_0", "REVIEW_EXAMPLE"]:
            require(marker in text, f"complete language material and history retains {marker}")
        for marker in ["FOREIGN_LANGUAGE_QUESTION", "FORA_LESSON", "FORA_STUDYQUESTION"]:
            require(marker not in text, f"language collection excludes {marker}")
        require(context["learning_count"] == 183 and not context["context_truncated"], "complete lesson counts all learning records")


def pure_batch_tests():
    original = [dict(ref=f"log:{n}", kind="study_log", learning=True, title=f"Estudo {n}",
                     subject="Cálculo", source="manual", date="2026-10-09",
                     text=(f"START_{n}" + '\\"\n' * 2000 + f"END_{n}")) for n in range(8)]
    original[0]["text"] += "z" * 60000 + "OVERSIZED_TEXT_TAIL"
    context = dict(records=original, evidence_refs=[record["ref"] for record in original], learning_count=8,
                   sampling="complete", context_truncated=False)
    batches = service.history_batches(context)
    require(len(batches) > 1, "large histories use multiple provider batches")
    require(any("record_json_fragment" in record for batch in batches for record in batch), "oversized records are fragmented")
    require(all(len(json.dumps(batch, ensure_ascii=False)) <= service.MAX_CONTEXT_CHARS for batch in batches), "each batch is bounded")
    parts = {}
    intact = {}
    for batch in batches:
        for record in batch:
            if "record_json_fragment" in record:
                origin = original[int(record["ref"].split(":")[1])]
                require(all(record.get(key) == origin[key] for key in ("title", "subject", "source", "date")),
                        "each independent fragment retains the record's study identity")
                parts.setdefault(record["ref"], []).append(record)
            else:
                intact[record["ref"]] = record
    for record in original:
        if record["ref"] in parts:
            fragments = sorted(parts[record["ref"]], key=lambda item: item["fragment_index"])
            reconstructed = json.loads("".join(item["record_json_fragment"] for item in fragments))
        else:
            reconstructed = intact[record["ref"]]
        require(reconstructed == record, "fragmentation retains every character and complete original metadata")
    scope = dict(discipline="Teste", targets=[])
    system, _ = service.build_analysis_prompts(title="Aprender", description=None, scope=scope,
                                              context=context, base_language="Portuguese", age_group="7-9")
    require("measurable completion criteria" in system and "ordered action plan" in system,
            "the final diagnosis requests an ordered concrete plan with completion criteria")

    calls = []
    def provider(**kwargs):
        calls.append(kwargs)
        stage = json.loads(kwargs["prompt"]).get("stage")
        return fixture.answer() if stage == "final" else json.dumps(dict(summary="Retain evidence " + "x" * 5900))

    kwargs = dict(title="Aprender", description=None, scope=scope, base_language="Portuguese", age_group="7-9",
                  generate=provider, ai_config=None, timeout_seconds=45)
    service.analyze_history(context=dict(context, records=[original[0]], learning_count=1), **kwargs)
    batch_prompts = [json.loads(call["prompt"]) for call in calls if json.loads(call["prompt"])["stage"] == "batch"]
    require(len(batch_prompts) > 1 and all(
        all(record.get(key) == original[0][key] for key in ("title", "subject", "source", "date"))
        for prompt in batch_prompts for record in prompt["evidence"]["records"]),
        "every independent provider batch retains oversized study provenance")
    calls.clear()
    # Eight almost-full batches force an intermediate reduction of large summaries.
    hierarchical = dict(context, records=[dict(ref=f"log:{n}", learning=True, kind="study_log", text="a" * 23000) for n in range(8)])
    result = service.analyze_history(context=hierarchical, **kwargs)
    require(result["progress_percent"] == 62, "hierarchical consolidation returns the exact final diagnosis schema")
    require(any(json.loads(call["prompt"]).get("stage") == "consolidate" for call in calls), "large summaries use hierarchical consolidation")
    require(all(len(call["prompt"]) <= service.MAX_CONTEXT_CHARS for call in calls), "every actual provider prompt is bounded")
    calls.clear()
    with patch.object(service, "MAX_ANALYSIS_CALLS", 2):
        try:
            service.analyze_history(context=hierarchical, **kwargs)
        except RuntimeError as exc:
            require("histórico" in str(exc) and "tente" in str(exc).lower(), "budget overflow is actionable")
        else:
            raise AssertionError("oversized operation must fail instead of sampling")
    require(not calls, "obvious work overflow is forecast before the first provider call")
    calls.clear()
    with patch.object(service.time, "monotonic", side_effect=[0, 100]):
        try:
            service.analyze_history(context=context, **kwargs)
        except RuntimeError:
            pass
        else:
            raise AssertionError("time budget must fail instead of persisting incomplete history")
    require(not calls, "expired operation does not enter a provider call")


class BatchedProvider:
    def __init__(self):
        self.calls = []
        self.fail_at = None
        self.invalid_at = None
        self.fail_stage = None
        self.summary = "Estudo de distribuições: exposição e erros; praticar com critério de acerto."
        self.during = None

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        index = len(self.calls)
        if self.during:
            self.during(index)
        stage = json.loads(kwargs["prompt"]).get("stage")
        if index == self.fail_at or stage == self.fail_stage:
            raise RuntimeError("failed provider batch")
        config = kwargs.get("ai_config")
        if config and config.on_success:
            config.on_success()
        if index == self.invalid_at:
            return "{}"
        if stage in {"batch", "consolidate"}:
            return json.dumps(dict(summary=self.summary))
        return fixture.answer()


async def http_tests():
    fixture.main.on_startup()
    fake = BatchedProvider()
    fixture.main.phrase_generation_service.generate_json_text = fake
    async with fixture.httpx.AsyncClient(transport=fixture.httpx.ASGITransport(app=fixture.main.app), base_url="http://testserver") as client:
        headers, child_id = await fixture.login(client, "full-a@example.com", "52998224725")
        _, foreign_id = await fixture.login(client, "full-b@example.com", "39053344705")
        ids = fixture.seed(child_id, foreign_id)
        collection_tests(child_id, foreign_id, ids)
        lesson_collection_tests(child_id, foreign_id)
        with Session(fixture.main.engine) as db:
            for n in range(90):
                db.add(StudyLogEntry(child_id=child_id, studied_on=date(2001, 1, 1) + timedelta(days=n),
                                    title=f"Distribuição {n}", discipline="Matemática", subject="Estatística",
                                    subject_id=ids["statistics"], content=f"ALL_STATISTICS_{n}" + "x" * 800))
            db.commit()
        response = await client.put("/api/ai/settings", headers=headers, json=dict(provider="openai", api_key="test-key", model="gpt-test"))
        require(response.status_code == 200, response.text)
        response = await client.post("/api/objectives", headers=headers, json=dict(title="Interpretar distribuições", study_scope=dict(
            discipline_key=f"discipline:{ids['discipline']}", target_keys=[f"subject:{ids['statistics']}"])))
        require(response.status_code == 201, response.text)
        oid = response.json()["id"]

        def usage():
            with Session(fixture.main.engine) as db:
                return len(db.exec(select(UsageRecord)).all())

        before = usage()
        response = await client.post(f"/api/objectives/{oid}/analyze", headers=headers)
        require(response.status_code == 200, response.text)
        saved = response.json()["study_analysis"]
        require(len(fake.calls) > 1 and usage() == before + 1, "own-key batches record one operation usage")
        require(saved["evidence_count"] == 91 and len(set(saved["evidence_refs"])) == 91 and not saved["context_truncated"],
                "saved diagnosis keeps exact full raw evidence coverage")
        prompts = " ".join(call["prompt"] for call in fake.calls)
        require("ALL_STATISTICS_0" in prompts and "ALL_STATISTICS_89" in prompts, "oldest and latest history reach the provider")
        fake.calls.clear(); fake.fail_at = 2
        response = await client.post(f"/api/objectives/{oid}/analyze", headers=headers)
        require(response.status_code == 502 and usage() == before + 2, "successful first batch followed by failure consumes one operation")
        current = (await client.get("/api/objectives", headers=headers)).json()
        require(next(item for item in current if item["id"] == oid)["study_analysis"] == saved, "failed batch preserves previous diagnosis")

        # Completeness depends on the current subject curriculum, including
        # unselected topics added while the provider is reading the history.
        with Session(fixture.main.engine) as db:
            subject_id = db.get(ProgrammingTopic, ids["limits"]).subject_id
            topic_keys = [f"topic:{topic.id}" for topic in db.exec(select(ProgrammingTopic).where(
                ProgrammingTopic.subject_id == subject_id)).all()]
        response = await client.post("/api/objectives", headers=headers, json=dict(title="Todo o cálculo", study_scope=dict(
            discipline_key=f"discipline:{ids['discipline']}", target_keys=topic_keys)))
        full_oid = response.json()["id"]
        fake.calls.clear(); fake.fail_at = None
        def add_curriculum_topic(index):
            if index == 2:
                with Session(fixture.main.engine) as db:
                    db.add(ProgrammingTopic(subject_id=subject_id, title="Novo tópico durante a análise")); db.commit()
        fake.during = add_curriculum_topic
        response = await client.post(f"/api/objectives/{full_oid}/analyze", headers=headers)
        fake.during = None
        require(response.status_code == 409, "changing full-subject completeness during a batch invalidates persistence")
        with Session(fixture.main.engine) as db:
            require(db.get(Objective, full_oid).study_analysis is None, "concurrent curriculum expansion cannot save obsolete full-subject evidence")

        os.environ["GEMINI_API_KEY"] = "platform-test-key"
        await client.put("/api/ai/settings", headers=headers, json=dict(provider="gemini", use_global_key=True))
        def balance(credits=None):
            with Session(fixture.main.engine) as db:
                user = db.get(User, db.get(ChildProfile, child_id).user_id)
                if credits is not None:
                    user.ai_credits = credits; user.ai_daily_credit_limit = 0; user.ai_credits_reset_date = fixture.main.activity_today()
                    db.add(user); db.commit()
                return user.ai_credits, user.ai_credits_used
        _, used = balance(1)
        fake.calls.clear(); fake.fail_at = 1
        require((await client.post(f"/api/objectives/{oid}/analyze", headers=headers)).status_code == 502, "first batch failure is controlled")
        require(balance() == (1, used), "no provider answer refunds credit without usage")
        fake.calls.clear(); fake.fail_at = 2
        require((await client.post(f"/api/objectives/{oid}/analyze", headers=headers)).status_code == 502, "later batch failure is controlled")
        require(balance() == (0, used + 1), "later failure keeps one credit charged without duplicate usage")
        balance(1); fake.calls.clear(); fake.fail_at = None; fake.invalid_at = 2
        require((await client.post(f"/api/objectives/{oid}/analyze", headers=headers)).status_code == 502, "malformed batch summary is controlled")
        require(balance() == (0, used + 2), "malformed answered batch consumes only one operation")
        balance(1); fake.calls.clear(); fake.invalid_at = None
        response = await client.post(f"/api/objectives/{oid}/analyze", headers=headers)
        require(response.status_code == 200 and balance() == (0, used + 3), "all successful batches charge exactly one credit")
        saved = response.json()["study_analysis"]
        balance(1); fake.calls.clear(); fake.fail_stage = "consolidate"; fake.summary = "x" * 5900
        with patch.object(service, "MAX_CONTEXT_CHARS", 18000):
            response = await client.post(f"/api/objectives/{oid}/analyze", headers=headers)
        require(response.status_code == 502 and any(json.loads(call["prompt"])["stage"] == "consolidate" for call in fake.calls),
                "consolidation provider failure is controlled")
        require(balance() == (0, used + 4), "consolidation failure keeps exactly one operation charged")
        current = (await client.get("/api/objectives", headers=headers)).json()
        require(next(item for item in current if item["id"] == oid)["study_analysis"] == saved,
                "failed consolidation preserves the prior full diagnosis")
        balance(1); fake.calls.clear(); fake.fail_stage = None
        with patch.object(service, "MAX_ANALYSIS_CALLS", 2):
            response = await client.post(f"/api/objectives/{oid}/analyze", headers=headers)
        require(response.status_code == 502 and "selecione menos" in response.text and not fake.calls,
                "operation overflow returns actionable error before calling the provider")
        require(balance() == (1, used + 4), "forecast overflow refunds reservation without spending usage")


if __name__ == "__main__":
    asyncio.run(http_tests())
    pure_batch_tests()
    print("PASS full objective history + lossless batches + one-operation credits")
