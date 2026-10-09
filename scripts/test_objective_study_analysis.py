"""Objective diagnosis: profile isolation, evidence fidelity and safe persistence."""
from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import threading
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TMP = Path(tempfile.mkdtemp(prefix="objective-analysis-"))
os.environ.update(DATABASE_URL=f"sqlite:///{(TMP / 'test.sqlite').as_posix()}", APP_ENV="test",
                  SESSION_SECRET="test-objective-analysis-secret", TTS_PROVIDER="none",
                  AUDIO_CACHE_DIR=str(TMP / "audio"), GEMINI_API_KEY="", AUTH_RATE_LIMIT="500", AI_RATE_LIMIT="500",
                  ACTIVITY_TIMEZONE="UTC", AI_ENCRYPTION_KEY="test-objective-analysis-encryption-key")
os.environ.pop("ADMIN_EMAIL", None)
sys.path.insert(0, str(ROOT / "apps" / "api"))
sys.path.insert(0, str(ROOT / "scripts"))
import httpx
from sqlmodel import Session, select
from sqlalchemy import event
import main
from starlette.requests import Request
from account_approval_support import approve_all_accounts, enable_all_modules
from models.database import (ChildProfile, CodingReviewItem, Lesson, LessonItem, Objective, ProgrammingFlashcard,
                             ProgrammingQuestion, ProgrammingSubject, ProgrammingTopic, StudyDiscipline,
                             StudyLogEntry, StudyQuestion, TopicStatus, User)


def require(ok, message):
    if not ok:
        raise AssertionError(message)


def answer(**changes):
    body = dict(progress_percent=62, confidence="medium", summary="Falta praticar derivadas compostas.",
                studied=["Limites"], gaps=["Regra da cadeia"], next_steps=["Resolver cinco exercícios"])
    body.update(changes)
    return json.dumps(body)


class Provider:
    def __init__(self):
        self.calls = []
        self.raw = answer()
        self.during = None
        self.error = None

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        if self.during:
            self.during()
        if self.error:
            raise self.error
        config = kwargs.get("ai_config")
        if config and config.on_success:
            config.on_success()
        return self.raw


async def login(client, email, cpf):
    response = await client.post("/api/auth/register", json=dict(first_name="Ana", last_name="Estudo", email=email, cpf=cpf, password="Senha@Forte123"))
    require(response.status_code in (200, 201), response.text)
    approve_all_accounts(main)
    enable_all_modules(main)
    response = await client.post("/api/auth/login", json=dict(email=email, password="Senha@Forte123"))
    require(response.status_code == 200, response.text)
    with Session(main.engine) as db:
        user = db.exec(select(User).where(User.email == email)).one()
        child = db.exec(select(ChildProfile).where(ChildProfile.user_id == user.id)).first()
        child_id = child.id
    return {"Authorization": f"Bearer {response.json()['token']}"}, child_id


def seed(child_id, foreign_id):
    with Session(main.engine) as db:
        math = StudyDiscipline(child_id=child_id, name="Matemática")
        history = StudyDiscipline(child_id=child_id, name="História")
        foreign = StudyDiscipline(child_id=foreign_id, name="Matemática privada")
        db.add_all([math, history, foreign]); db.flush()
        calc = ProgrammingSubject(child_id=child_id, name="Cálculo", track="general", discipline_id=math.id)
        statistics = ProgrammingSubject(child_id=child_id, name="Estatística", track="general", discipline_id=math.id)
        statistics_sibling = ProgrammingSubject(child_id=child_id, name="Estatística atual", track="general", discipline_id=math.id)
        hist = ProgrammingSubject(child_id=child_id, name="História", track="general", discipline_id=history.id)
        other = ProgrammingSubject(child_id=foreign_id, name="Segredo", track="general", discipline_id=foreign.id)
        db.add_all([calc, statistics, statistics_sibling, hist, other]); db.flush()
        limits = ProgrammingTopic(subject_id=calc.id, title="Limites", status=TopicStatus.studied, notes="LIMITES_ESTUDADOS", summary="Resumo de limites", ai_content={"content": "MATERIAL_LIMITE_" + "x" * 6000})
        derivatives = ProgrammingTopic(subject_id=calc.id, title="Derivadas", ai_content={"content": "MATERIAL_DERIVADAS"})
        integrals = ProgrammingTopic(subject_id=calc.id, title="Integrais", status=TopicStatus.mastered, notes="FORA_INTEGRAIS")
        dates = ProgrammingTopic(subject_id=hist.id, title="Datas", status=TopicStatus.mastered, notes="FORA_HISTORIA")
        secret = ProgrammingTopic(subject_id=other.id, title="Segredo", notes="FORA_PERFIL")
        db.add_all([limits, derivatives, integrals, dates, secret]); db.flush()
        db.add(StudyLogEntry(child_id=child_id, studied_on=date.today(), title="Limites automático", discipline="Matemática", subject="Cálculo", subject_id=calc.id, source="topic", source_id=limits.id, summary="LOG_LIMITE", review_count=1, last_review_score=80))
        db.add(StudyLogEntry(child_id=child_id, studied_on=date.today(), title="Anotação geral", discipline="Matemática", subject="Cálculo", subject_id=calc.id, content="NOTA_GERAL_CALCULO"))
        db.add(StudyLogEntry(child_id=child_id, studied_on=date.today(), title="Distribuições", discipline="Matemática", subject="Estatística", subject_id=statistics.id, content="ESTATISTICA_ESTUDADA"))
        db.add(StudyLogEntry(child_id=child_id, studied_on=date.today(), title="Outra distribuição", discipline="Matemática", subject="Estatística atual", subject_id=statistics_sibling.id, content="FORA_OUTRA_ESTATISTICA"))
        db.add(StudyLogEntry(child_id=child_id, studied_on=date.today(), title="Fora", discipline="História", subject="História", content="FORA_LOG_HISTORIA"))
        db.add(StudyLogEntry(child_id=foreign_id, studied_on=date.today(), title="Segredo", discipline="Matemática", subject="Cálculo", content="FORA_LOG_PERFIL"))
        db.add(StudyLogEntry(child_id=child_id, studied_on=date.today(), title="Conversação", discipline="Inglês", subject="Entrevista", content="PRATICA_ENTREVISTA", review_count=1, last_review_score=65))
        lesson = Lesson(child_id=child_id, title="Entrevista em inglês", theme="Entrevista", objective="LESSON_ENTREVISTA", is_completed=True)
        excluded_lesson = Lesson(child_id=child_id, title="Férias", theme="Viagem", objective="FORA_LESSON", is_completed=True)
        db.add_all([lesson, excluded_lesson]); db.flush()
        db.add(LessonItem(lesson_id=lesson.id, word_en="LESSON_WORD", word_pt="trabalho", example_sentence_en="I work", example_sentence_pt="Eu trabalho"))
        for record, marker in [(lesson, "STUDYQUESTION_ENTREVISTA"), (excluded_lesson, "FORA_STUDYQUESTION")]:
            db.add(StudyLogEntry(child_id=child_id, studied_on=date.today(), title=record.title, discipline="Inglês", subject=record.theme, source="lesson", source_id=record.id))
            db.add(StudyQuestion(child_id=child_id, area="english", subject_name="Inglês", topic_key=str(record.id), topic_title=record.title, question=marker, question_key=marker, options=["A","B"], correct_option="A", explanation="Exp", attempt_count=4, correct_count=3, error_count=1))
        db.add(StudyLogEntry(child_id=child_id, studied_on=date.today(), title="Astronomia", discipline="Astronomia", subject="Estrelas", content="ESTRELAS_ESTUDADAS"))
        db.add(ProgrammingQuestion(child_id=child_id, subject_id=calc.id, topic_id=limits.id, question="QUESTAO_LIMITE", question_key="q1", correct_option="A", explanation="exp", options=["A", "B"], attempt_count=3, correct_count=2, error_count=1))
        card = ProgrammingFlashcard(child_id=child_id, subject_id=calc.id, topic_id=limits.id, front="FLASHCARD_LIMITE", back="Resposta")
        db.add(card); db.flush()
        db.add(CodingReviewItem(child_id=child_id, flashcard_id=card.id, attempt_count=2, correct_count=1, error_count=1, last_reviewed=datetime.utcnow()))
        db.commit()
        return dict(discipline=math.id, history=history.id, limits=limits.id, derivatives=derivatives.id, secret=secret.id, dates=dates.id, statistics=statistics.id, statistics_sibling=statistics_sibling.id)


async def http_tests():
    main.on_startup()
    fake = Provider()
    main.phrase_generation_service.generate_json_text = fake
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://testserver") as client:
        headers, child_id = await login(client, "objective-a@example.com", "52998224725")
        foreign, foreign_id = await login(client, "objective-b@example.com", "39053344705")
        ids = seed(child_id, foreign_id)
        response = await client.get("/api/objectives/study-options", headers=headers)
        require(response.status_code == 200, f"study options must exist: {response.status_code} {response.text}")
        options = response.json()
        require(options["ai_available"] is False and options["ai_unavailable_reason"] == "no_config", "AI availability is explicit")
        require("Segredo" not in response.text and "privada" not in response.text, "options isolate profiles")
        fresh_options = (await client.get("/api/objectives/study-options", headers=foreign)).json()
        require(all(t["key"] != "log-subject:" for g in fresh_options["disciplines"] for t in g["targets"]), "empty history does not create a fake target")
        group = next(g for g in options["disciplines"] if g["key"] == f"discipline:{ids['discipline']}")
        keys = [f"topic:{ids['limits']}", f"topic:{ids['derivatives']}"]
        require(all(k in [t["key"] for t in group["targets"]] for k in keys), "unstudied curriculum topics remain selectable")
        scope = dict(discipline_key=group["key"], target_keys=keys)
        with Session(main.engine) as db:
            user = db.get(User, db.get(ChildProfile, child_id).user_id)
            user.enabled_modules = {"coding": False, "diverse": False}; db.add(user); db.commit()
        gated = (await client.get("/api/objectives/study-options", headers=headers)).json()
        require(all(t["topic_id"] is None for g in gated["disciplines"] for t in g["targets"]), "disabled curriculum modules do not offer their topics")
        enable_all_modules(main)
        response = await client.post("/api/objectives", headers=headers, json=dict(title="Resolver derivadas", study_scope=scope, items=[dict(title="Exercícios", area="free")]))
        require(response.status_code == 201, response.text)
        objective = response.json(); oid = objective["id"]
        require(len(objective["study_scope"]["targets"]) == 2 and objective["study_analysis"] is None, "multi-topic scope persists")
        for bad_key in [f"topic:{ids['secret']}", f"topic:{ids['dates']}"]:
            rejected = await client.put(f"/api/objectives/{oid}", headers=headers, json=dict(study_scope=dict(discipline_key=group["key"], target_keys=[bad_key])))
            require(rejected.status_code == 422, "foreign and cross-discipline target keys are rejected")
        updated = await client.put(f"/api/objectives/{oid}", headers=headers, json=dict(icon_emoji="🎯"))
        require(updated.json()["study_scope"] == objective["study_scope"], "omitting scope preserves it")
        disabled = await client.post(f"/api/objectives/{oid}/analyze", headers=headers)
        require(disabled.status_code == 403 and not fake.calls, "no AI key refuses analysis without provider call")
        denied = await client.post(f"/api/objectives/{oid}/analyze", headers=foreign)
        require(denied.status_code == 404, "analysis hides foreign objectives")
        configured = await client.put("/api/ai/settings", headers=headers, json=dict(provider="openai", api_key="test-key", model="gpt-test"))
        require(configured.status_code == 200, configured.text)
        statistics_target = next(t for t in group["targets"] if t["subject_id"] == ids["statistics"])
        require(statistics_target["key"] == f"subject:{ids['statistics']}", "owned log subjects use stable subject IDs as target keys")
        statistics_objective = await client.post("/api/objectives", headers=headers,
            json=dict(title="Interpretar distribuições", study_scope=dict(discipline_key=group["key"], target_keys=[statistics_target["key"]])))
        require(statistics_objective.status_code == 201, statistics_objective.text)
        statistics_oid = statistics_objective.json()["id"]
        with Session(main.engine) as db:
            subject = db.get(ProgrammingSubject, ids["statistics"])
            subject.name = "Estatística atual"; db.add(subject)
            # Earlier saved scopes used the label key even for owned subjects.
            legacy_objective = db.get(Objective, statistics_oid)
            legacy_scope = json.loads(json.dumps(legacy_objective.study_scope))
            legacy_scope["targets"][0]["key"] = "log-subject:estatistica"
            legacy_objective.study_scope = legacy_scope; db.add(legacy_objective); db.commit()
        collision_options = (await client.get("/api/objectives/study-options", headers=headers)).json()
        collision_group = next(g for g in collision_options["disciplines"] if g["key"] == group["key"])
        require({t["subject_id"] for t in collision_group["targets"] if t["topic_id"] is None} == {ids["statistics"], ids["statistics_sibling"]}, "equally named owned subjects remain independently selectable")
        require({t["key"] for t in collision_group["targets"] if t["topic_id"] is None} == {f"subject:{ids['statistics']}", f"subject:{ids['statistics_sibling']}"}, "duplicate labels do not change stable subject keys")
        statistics_read = next(o for o in (await client.get("/api/objectives", headers=headers)).json() if o["id"] == statistics_oid)
        require(statistics_read["study_scope"]["available"] and statistics_read["study_scope"]["targets"][0]["subject"] == "Estatística atual", "a selected owned log subject without topics survives a curriculum name change by subject ID")
        require(statistics_read["study_scope"]["targets"][0]["key"] == f"subject:{ids['statistics']}", "legacy owned label keys resolve to the current stable subject key")
        statistics_analysis = await client.post(f"/api/objectives/{statistics_oid}/analyze", headers=headers)
        require(statistics_analysis.status_code == 200, statistics_analysis.text)
        require(statistics_analysis.json()["study_analysis"]["evidence_count"] == 1 and statistics_analysis.json()["study_analysis"]["progress_percent"] == 62, "renamed selected subject retains direct learning evidence by subject ID")
        require("ESTATISTICA_ESTUDADA" in fake.calls[-1]["prompt"] and "LIMITES_ESTUDADOS" not in fake.calls[-1]["prompt"] and "FORA_OUTRA_ESTATISTICA" not in fake.calls[-1]["prompt"], "owned subject diagnosis excludes equally named subjects after renaming")
        with Session(main.engine) as db:
            db.add(ProgrammingTopic(subject_id=ids["statistics_sibling"], title="Outro currículo", ai_content={"content": "FORA_OUTRO_CURRICULO"})); db.commit()
        mixed_options = (await client.get("/api/objectives/study-options", headers=headers)).json()
        mixed_group = next(g for g in mixed_options["disciplines"] if g["key"] == group["key"])
        require(any(t["key"] == f"subject:{ids['statistics']}" for t in mixed_group["targets"]), "another equally named subject's curriculum cannot hide an owned log target")
        require(not any(t["key"] == f"subject:{ids['statistics_sibling']}" for t in mixed_group["targets"]), "curriculum suppresses only its own subject-level log target")
        analyzed = await client.post(f"/api/objectives/{oid}/analyze", headers=headers)
        require(analyzed.status_code == 200, analyzed.text)
        result = analyzed.json(); saved = result["study_analysis"]
        require(saved["progress_percent"] == 62 and saved["remaining_percent"] == 38 and not saved["stale"], str(saved))
        require(result["progress_percent"] == 0 and result["achieved_at"] is None and not result["items"][0]["done"], "AI never checks tasks or awards achievement")
        prompt = fake.calls[-1]["prompt"]
        for present in ["Resolver derivadas", "LIMITES_ESTUDADOS", "MATERIAL_DERIVADAS", "NOTA_GERAL_CALCULO", "QUESTAO_LIMITE", "FLASHCARD_LIMITE", "LOG_LIMITE"]:
            require(present in prompt, f"scoped context includes {present}")
        for absent in ["FORA_INTEGRAIS", "FORA_HISTORIA", "FORA_PERFIL", "FORA_LOG_HISTORIA", "FORA_LOG_PERFIL"]:
            require(absent not in prompt, f"scoped context excludes {absent}")
        require(f"log:" not in " ".join(saved["evidence_refs"]), "automatic topic log is not counted separately")
        require(saved["evidence_count"] == 3, f"topic, question and flashcard are three learning evidence records: {saved}")
        with Session(main.engine) as db:
            discipline = db.get(StudyDiscipline, ids["discipline"])
            discipline.name = "Matemática aplicada"; db.add(discipline)
            topic = db.get(ProgrammingTopic, ids["limits"])
            subject = db.get(ProgrammingSubject, topic.subject_id)
            subject.name = "Cálculo aplicado"; db.add(subject); db.commit()
        renamed_read = (await client.get("/api/objectives", headers=headers)).json()
        require(next(o for o in renamed_read if o["id"] == oid)["study_analysis"]["stale"], "changed curriculum labels make the evaluated scope stale")
        renamed_options = (await client.get("/api/objectives/study-options", headers=headers)).json()
        require(all(g["key"] != "log:matematica" for g in renamed_options["disciplines"]), "curriculum-linked logs use the discipline ID after a rename")
        renamed = await client.post(f"/api/objectives/{oid}/analyze", headers=headers)
        require(renamed.status_code == 200, renamed.text)
        require("LOG_LIMITE" in fake.calls[-1]["prompt"] and "NOTA_GERAL_CALCULO" in fake.calls[-1]["prompt"], "curriculum IDs preserve automatic reviews and general context after label renames")
        saved = renamed.json()["study_analysis"]
        fake.raw = answer(progress_percent="62")
        invalid = await client.post(f"/api/objectives/{oid}/analyze", headers=headers)
        require(invalid.status_code == 502, "string estimates are refused")
        current = (await client.get("/api/objectives", headers=headers)).json()
        require(next(o for o in current if o["id"] == oid)["study_analysis"] == saved, "invalid AI response preserves previous analysis")
        fake.raw = answer(); fake.error = RuntimeError("provider failed")
        require((await client.post(f"/api/objectives/{oid}/analyze", headers=headers)).status_code == 502, "provider errors are controlled")
        fake.error = None
        changed = await client.put(f"/api/objectives/{oid}", headers=headers, json=dict(title="Resolver derivadas compostas"))
        require(changed.json()["study_analysis"]["stale"], "editing the objective makes analysis stale")
        def edit_during_call():
            with Session(main.engine) as db:
                record = db.get(Objective, oid); record.description = "Mudou durante a chamada"; db.add(record); db.commit()
        fake.during = edit_during_call
        require((await client.post(f"/api/objectives/{oid}/analyze", headers=headers)).status_code == 409, "concurrent edit refuses outdated response and permits independent DB write")
        fake.during = None
        def scope_edit_during_call():
            with Session(main.engine) as db:
                record = db.get(Objective, oid)
                record.study_scope = dict(record.study_scope, targets=record.study_scope["targets"][:1])
                db.add(record); db.commit()
        fake.during = scope_edit_during_call
        require((await client.post(f"/api/objectives/{oid}/analyze", headers=headers)).status_code == 409, "concurrent scope changes refuse outdated analysis")
        fake.during = None
        await client.put(f"/api/objectives/{oid}", headers=headers, json=dict(study_scope=scope))
        # Force a title edit into the final check/write window. SQLite must
        # serialize that edit after the diagnosis commit, just as a row lock
        # does on PostgreSQL, rather than persisting an outdated evaluation.
        write_window = threading.Event(); editor_attempting = threading.Event(); editor_done = threading.Event()
        edited_before_write = []
        def window_editor():
            require(write_window.wait(10), "analysis write window reached")
            with Session(main.engine) as db:
                record = db.get(Objective, oid); record.title = "Editado após a análise"
                db.add(record); editor_attempting.set(); db.commit()
            editor_done.set()
        def at_analysis_update(connection, cursor, statement, parameters, context, executemany):
            if statement.startswith("UPDATE objective SET") and "study_analysis" in statement:
                write_window.set()
                require(editor_attempting.wait(10), "editor attempted its concurrent commit")
                edited_before_write.append(editor_done.wait(0.2))
        editor = threading.Thread(target=window_editor, daemon=True)
        event.listen(main.engine, "before_cursor_execute", at_analysis_update)
        editor.start()
        try:
            serialized = await client.post(f"/api/objectives/{oid}/analyze", headers=headers)
        finally:
            event.remove(main.engine, "before_cursor_execute", at_analysis_update)
        require(serialized.status_code == 200, serialized.text)
        require(await asyncio.to_thread(editor_done.wait, 10), "editor eventually commits after analysis")
        require(edited_before_write == [False], "SQLite must protect the final signature check and diagnosis write from intervening edits")
        empty = await client.post("/api/objectives", headers=headers, json=dict(title="Derivadas sem estudo", study_scope=dict(discipline_key=group["key"], target_keys=[keys[1]])))
        empty_id = empty.json()["id"]
        no_history = await client.post(f"/api/objectives/{empty_id}/analyze", headers=headers)
        require(no_history.status_code == 200, no_history.text)
        result = no_history.json()["study_analysis"]
        require(result["progress_percent"] is None and result["remaining_percent"] is None and result["confidence"] == "low", "available generated material plus general notes do not prove topic learning")
        english = next(g for g in options["disciplines"] if g["name"] == "Inglês")
        et = next(t for t in english["targets"] if t["subject"] == "Entrevista")
        lang = await client.post("/api/objectives", headers=headers, json=dict(title="Passar na entrevista", study_scope=dict(discipline_key=english["key"], target_keys=[et["key"]])))
        require((await client.post(f"/api/objectives/{lang.json()['id']}/analyze", headers=headers)).status_code == 200, "language log targets work")
        require("PRATICA_ENTREVISTA" in fake.calls[-1]["prompt"] and "LIMITES_ESTUDADOS" not in fake.calls[-1]["prompt"], "language context is isolated")
        require("LESSON_ENTREVISTA" in fake.calls[-1]["prompt"] and "LESSON_WORD" in fake.calls[-1]["prompt"] and "STUDYQUESTION_ENTREVISTA" in fake.calls[-1]["prompt"], "language lesson origins and exact linked question attempts are evidence")
        require("FORA_LESSON" not in fake.calls[-1]["prompt"] and "FORA_STUDYQUESTION" not in fake.calls[-1]["prompt"], "other language subjects do not contribute")
        astronomy = next(g for g in options["disciplines"] if g["name"] == "Astronomia")
        astro = await client.post("/api/objectives", headers=headers, json=dict(title="Conhecer estrelas", study_scope=dict(discipline_key=astronomy["key"], target_keys=[astronomy["targets"][0]["key"]])))
        aid = astro.json()["id"]
        require((await client.post("/api/study-log/disciplines/rename", headers=headers, json=dict(from_name="Astronomia", to_name="Cosmologia"))).status_code == 200, "discipline rename works")
        require((await client.post("/api/study-log/subjects/rename", headers=headers, json=dict(discipline="Cosmologia", from_name="Estrelas", to_name="Astros"))).status_code == 200, "subject rename works")
        require((await client.post(f"/api/objectives/{aid}/analyze", headers=headers)).status_code == 200, "renaming log-only discipline and subject preserves scope validity")
        doomed = await client.post("/api/objectives", headers=headers, json=dict(title="Concorrência", study_scope=scope))
        doomed_id = doomed.json()["id"]
        def delete_during_call():
            with Session(main.engine) as db:
                db.delete(db.get(Objective, doomed_id)); db.commit()
        fake.during = delete_during_call
        require((await client.post(f"/api/objectives/{doomed_id}/analyze", headers=headers)).status_code == 404, "concurrent deletion cannot store orphaned analysis")
        fake.during = None
        with Session(main.engine) as db:
            topic = db.get(ProgrammingTopic, ids["derivatives"]); topic.title = "Derivadas atuais"; db.add(topic); db.commit()
        current = (await client.get("/api/objectives", headers=headers)).json()
        require(next(o for o in current if o["id"] == empty_id)["study_scope"]["targets"][0]["title"] == "Derivadas atuais", "stable IDs read current labels")
        with Session(main.engine) as db:
            db.delete(db.get(ProgrammingTopic, ids["derivatives"])); db.commit()
        current = (await client.get("/api/objectives", headers=headers)).json()
        require(not next(o for o in current if o["id"] == empty_id)["study_scope"]["available"], "deleted target keeps readable label and becomes unavailable")
        require(next(o for o in current if o["id"] == empty_id)["study_analysis"]["stale"], "unavailable scope makes previous analysis stale")
        require((await client.post(f"/api/objectives/{empty_id}/analyze", headers=headers)).status_code == 422, "deleted targets cannot be analyzed")
        cleared = await client.put(f"/api/objectives/{oid}", headers=headers, json=dict(study_scope=None))
        require(cleared.json()["study_scope"] is None and cleared.json()["study_analysis"]["stale"], "explicit null clears scope and keeps stale previous analysis")
        os.environ["GEMINI_API_KEY"] = "platform-test-key"
        require((await client.put("/api/ai/settings", headers=headers, json=dict(provider="gemini", use_global_key=True))).status_code == 200, "platform key configuration")
        with Session(main.engine) as db:
            user = db.get(User, db.get(ChildProfile, child_id).user_id)
            user.ai_credits = 0; user.ai_daily_credit_limit = 0; user.ai_credits_reset_date = main.activity_today()
            db.add(user); db.commit()
        calls = len(fake.calls)
        require((await client.post(f"/api/objectives/{aid}/analyze", headers=headers)).status_code == 402 and len(fake.calls) == calls, "credit exhaustion blocks provider calls")
        credit_options = (await client.get("/api/objectives/study-options", headers=headers)).json()
        require(not credit_options["ai_available"] and credit_options["ai_unavailable_reason"] == "no_credits", "options expose credit availability")
        with Session(main.engine) as db:
            user = db.get(User, db.get(ChildProfile, child_id).user_id); user.ai_credits = 1; db.add(user); db.commit()
        require((await client.post(f"/api/objectives/{aid}/analyze", headers=headers)).status_code == 200, "metered successful analysis")
        with Session(main.engine) as db:
            user = db.get(User, db.get(ChildProfile, child_id).user_id)
            require(user.ai_credits == 0, "successful provider callback consumes exactly one credit")
        with Session(main.engine) as db:
            user = db.get(User, db.get(ChildProfile, child_id).user_id)
            user.ai_credits = 1; used_before = user.ai_credits_used; db.add(user); db.commit()
        entered = threading.Event(); second_entered = threading.Event(); release = threading.Event()
        admission_lock = threading.Lock(); arrivals = 0
        def blocking_provider():
            nonlocal arrivals
            with admission_lock:
                arrivals += 1
                (entered if arrivals == 1 else second_entered).set()
            require(release.wait(10), "concurrent provider test timed out")
        fake.during = blocking_provider
        calls_before = len(fake.calls)
        first = asyncio.create_task(client.post(f"/api/objectives/{aid}/analyze", headers=headers))
        require(await asyncio.to_thread(entered.wait, 10), "first generation reached provider")
        second = asyncio.create_task(client.post(f"/api/objectives/{aid}/analyze", headers=headers))
        provider_wait = asyncio.create_task(asyncio.to_thread(second_entered.wait, 10))
        await asyncio.wait({second, provider_wait}, timeout=10, return_when=asyncio.FIRST_COMPLETED)
        release.set()
        responses = await asyncio.gather(first, second)
        second_entered.set()
        await provider_wait
        fake.during = None
        require(sorted(r.status_code for r in responses) == [200, 402], "one remaining platform credit admits exactly one simultaneous request")
        require(len(fake.calls) - calls_before == 1, "only the admitted request reaches the provider")
        with Session(main.engine) as db:
            user = db.get(User, db.get(ChildProfile, child_id).user_id)
            require(user.ai_credits == 0 and user.ai_credits_used == used_before + 1, "atomic admission and callback count one charged generation")
            user.ai_credits = 1; db.add(user); db.commit()
        fake.error = RuntimeError("failed before a provider answer")
        require((await client.post(f"/api/objectives/{aid}/analyze", headers=headers)).status_code == 502, "failed metered provider call is controlled")
        fake.error = None
        with Session(main.engine) as db:
            user = db.get(User, db.get(ChildProfile, child_id).user_id)
            require(user.ai_credits == 1 and user.ai_credits_used == used_before + 1, "a pre-answer failure refunds the reserved credit without usage")
        def reset_allowance_during_call():
            with Session(main.engine) as db:
                user = db.get(User, db.get(ChildProfile, child_id).user_id)
                from datetime import timedelta
                user.ai_credits_reset_date = main.activity_today() + timedelta(days=1)
                user.ai_credits = 7; user.ai_credits_used_today = 0; db.add(user); db.commit()
        fake.during = reset_allowance_during_call; fake.error = RuntimeError("failure after allowance reset")
        require((await client.post(f"/api/objectives/{aid}/analyze", headers=headers)).status_code == 502, "failed call after allowance reset")
        fake.during = None; fake.error = None
        with Session(main.engine) as db:
            user = db.get(User, db.get(ChildProfile, child_id).user_id)
            require(user.ai_credits == 7, "a failed old-day reservation must not add a credit to the refreshed allowance")


def pure_tests():
    from services.objective_analysis_service import bounded_context, build_analysis_prompts, parse_analysis_response
    for raw in [answer(progress_percent=True), answer(progress_percent=-1), answer(progress_percent=101), answer(confidence="certain"), answer(confidence={"bad": True}), answer(gaps="text"), answer(summary=""), "{}"]:
        try:
            parse_analysis_response(raw, learning_count=2)
        except ValueError:
            continue
        raise AssertionError(f"Invalid structured response accepted: {raw}")
    parsed = parse_analysis_response("```json\n" + answer() + "\n```", learning_count=2)
    require(parsed["remaining_percent"] == 38, "remaining is derived from validated progress")
    parsed = parse_analysis_response(answer(), learning_count=0)
    require(parsed["progress_percent"] is None and parsed["confidence"] == "low", "no learning evidence overrides model estimate")
    context = bounded_context([dict(ref=f"log:{n}", learning=True, text="x" * 5000) for n in range(200)])
    require(context["context_truncated"] and len(json.dumps(context)) < 35000, "long context is sampled and bounded")
    system, prompt = build_analysis_prompts(title="Meu objetivo", description=None, scope=dict(discipline="Teste", targets=[]), context=context, base_language="Portuguese", age_group="7-9")
    require("child" in system and "Portuguese" in system and "context_truncated" in prompt, "prompt includes audience, language and sampling limitations")
    mixed = bounded_context([dict(ref=f"topic:{n}", learning=False, text="m" * 5000) for n in range(30)] + [dict(ref="question:999", learning=True, text="Correct answer")])
    require(mixed["context_truncated"] and mixed["learning_count"] == 1 and "question:999" in mixed["evidence_refs"], "sampling prioritizes actual learning over generated material")
    request = Request({"type": "http", "method": "POST", "path": "/api/objectives/12/analyze", "headers": []})
    require(main._is_ai_request(request), "objective analysis must use the existing AI rate limiter")


if __name__ == "__main__":
    if "--pure" not in sys.argv:
        asyncio.run(http_tests())
    pure_tests()
    print("PASS objective study scope and diagnosis HTTP + pure checks")
