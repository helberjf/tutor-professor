"""Exam simulado mode: blueprint sampling, grading, and the attempt lifecycle."""
from __future__ import annotations

import os
import random
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
MODELS = API / "models" / "database.py"
SCHEMAS = API / "schemas" / "schemas.py"
MAIN = API / "main.py"
MIGRATION = API / "alembic" / "versions" / "0011_exam_simulado.py"

os.environ.setdefault("APP_ENV", "test")
sys.path.insert(0, str(API))

from services.exam_service import (  # noqa: E402
    DEFAULT_PASSING_PERCENT,
    build_domain_breakdown,
    grade_answer,
    has_passed,
    normalize_domains,
    sample_by_blueprint,
    score_percent,
    validate_exam_question_batch,
)

AWS_DOMAINS = [
    {"name": "Development with AWS Services", "weight": 0.32},
    {"name": "Security", "weight": 0.26},
    {"name": "Deployment", "weight": 0.24},
    {"name": "Troubleshooting and Optimization", "weight": 0.18},
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


class FakeQuestion:
    def __init__(self, identifier: int, domain: str) -> None:
        self.id = identifier
        self.domain = domain


def build_pool(per_domain: int) -> list[FakeQuestion]:
    pool: list[FakeQuestion] = []
    identifier = 1
    for domain in AWS_DOMAINS:
        for _ in range(per_domain):
            pool.append(FakeQuestion(identifier, domain["name"]))
            identifier += 1
    return pool


def share(drawn: list[FakeQuestion], domain: str) -> float:
    return sum(1 for question in drawn if question.domain == domain) / len(drawn)


# ── Grading ───────────────────────────────────────────────────────────────────

def test_grading_is_all_or_nothing_and_order_free() -> None:
    require(grade_answer(["A", "C"], ["C", "A"]), "order of the selected options must not matter")
    require(grade_answer(["A"], ["A"]), "a single correct answer must count")
    require(not grade_answer(["A"], ["A", "C"]), "a partial selection must not count")
    require(not grade_answer(["A", "B", "C"], ["A", "C"]), "an extra selection must not count")
    require(not grade_answer([], ["A"]), "an empty answer must not count")
    require(not grade_answer(["A"], []), "a question without a key must never grade as correct")
    require(
        grade_answer([" A ", "c"], ["a", "C"]),
        "whitespace and casing must not decide a grade",
    )
    require(
        not grade_answer(["A", "A"], ["A", "C"]),
        "repeating one option must not stand in for a second answer",
    )


def test_score_is_a_percentage_against_the_72_cut() -> None:
    require(DEFAULT_PASSING_PERCENT == 72, "the AWS associate cut is 72%")
    require(score_percent(52, 65) == 80, "52 of 65 is 80%")
    require(score_percent(0, 65) == 0, "a blank sitting scores zero")
    require(score_percent(65, 65) == 100, "a perfect sitting scores 100")
    require(score_percent(0, 0) == 0, "an empty sitting must not divide by zero")
    require(has_passed(score_percent(47, 65)), "47 of 65 is 72% and passes")
    require(not has_passed(score_percent(46, 65)), "46 of 65 is 71% and fails")


def test_domain_breakdown_counts_every_domain_drawn() -> None:
    questions = build_pool(2)  # ids 1-2 Development, 3-4 Security, 5-6 Deployment, 7-8 Troubleshooting
    correct_ids = {questions[0].id}  # one Development hit, nothing in Security
    breakdown = build_domain_breakdown(questions, correct_ids)
    require(set(breakdown) == {domain["name"] for domain in AWS_DOMAINS}, "every drawn domain must appear")
    development = breakdown["Development with AWS Services"]
    require(development["total"] == 2, "the breakdown must count what was drawn")
    require(development["correct"] == 1, "the breakdown must count what was right")
    require(breakdown["Security"]["correct"] == 0, "a domain with no hits must report zero, not vanish")


# ── Blueprint sampling ────────────────────────────────────────────────────────

def test_sampling_follows_the_blueprint() -> None:
    pool = build_pool(40)
    drawn = sample_by_blueprint(pool, AWS_DOMAINS, 65, rng=random.Random(7))
    require(len(drawn) == 65, f"the sitting must have 65 questions, got {len(drawn)}")
    require(len({question.id for question in drawn}) == 65, "a question must never be drawn twice")
    for domain in AWS_DOMAINS:
        actual = share(drawn, domain["name"])
        require(
            abs(actual - domain["weight"]) <= 0.05,
            f"{domain['name']} drew {actual:.0%}, blueprint asks {domain['weight']:.0%}",
        )


def test_sampling_degrades_visibly_when_the_pool_is_thin() -> None:
    pool = build_pool(3)  # 12 questions for a 65 question blueprint
    drawn = sample_by_blueprint(pool, AWS_DOMAINS, 65, rng=random.Random(7))
    require(len(drawn) == len(pool), "a thin pool must yield what it has, not silently repeat")
    require(len({question.id for question in drawn}) == len(pool), "no duplicates when padding")


def test_sampling_fills_from_other_domains_when_one_is_short() -> None:
    pool = [FakeQuestion(index, "Security") for index in range(1, 61)]
    pool += [FakeQuestion(index, "Deployment") for index in range(61, 81)]
    drawn = sample_by_blueprint(pool, AWS_DOMAINS, 65, rng=random.Random(3))
    require(len(drawn) == 65, "a full sitting must still be assembled from the domains that do exist")
    require(len({question.id for question in drawn}) == 65, "filling must not duplicate questions")


def test_sampling_is_shuffled_not_grouped_by_domain() -> None:
    pool = build_pool(40)
    drawn = sample_by_blueprint(pool, AWS_DOMAINS, 65, rng=random.Random(11))
    runs = sum(1 for index in range(1, len(drawn)) if drawn[index].domain != drawn[index - 1].domain)
    require(runs > 10, "questions must be interleaved, not served one domain at a time")


def test_normalize_domains_rejects_a_broken_blueprint() -> None:
    normalized = normalize_domains(AWS_DOMAINS)
    require(len(normalized) == 4, "a valid blueprint must survive normalization")
    for broken, label in (
        ([{"name": "", "weight": 1.0}], "a nameless domain"),
        ([{"name": "Security", "weight": 0}], "a zero weight"),
        ([{"name": "Security", "weight": -0.5}, {"name": "X", "weight": 1.5}], "a negative weight"),
        ([{"name": "Security", "weight": 0.5}, {"name": "Security", "weight": 0.5}], "a duplicate"),
    ):
        try:
            normalize_domains(broken)
        except ValueError:
            continue
        raise AssertionError(f"{label} must be rejected")


# ── General simulado: no per-domain blueprint ─────────────────────────────────

def test_a_general_simulado_needs_no_blueprint() -> None:
    require(normalize_domains([]) == [], "an empty blueprint means a general simulado")
    require(normalize_domains(None) == [], "a missing blueprint means a general simulado")

    pool = build_pool(10)
    drawn = sample_by_blueprint(pool, [], 20, rng=random.Random(5))
    require(len(drawn) == 20, "a general simulado still draws the requested number")
    require(len({question.id for question in drawn}) == 20, "no repeats without a blueprint either")

    everything = sample_by_blueprint(pool, [], 999, rng=random.Random(5))
    require(len(everything) == len(pool), "asking for more than the pool yields the pool")


def test_general_questions_accept_any_domain_label() -> None:
    validated = validate_exam_question_batch(
        [valid_exam_question("Pergunta geral", domain="Qualquer assunto")],
        domains=[],
        existing_questions=[],
    )
    require(validated[0].domain == "Qualquer assunto", "a free label must survive without a blueprint")

    unlabelled = validate_exam_question_batch(
        [valid_exam_question("Outra pergunta", domain="")],
        domains=[],
        existing_questions=[],
    )
    require(unlabelled[0].domain == "Geral", "an unlabelled question falls back to Geral")

    # A blueprint, when present, still constrains the domain.
    try:
        validate_exam_question_batch(
            [valid_exam_question("Terceira", domain="Astrologia")],
            domains=AWS_DOMAINS,
            existing_questions=[],
        )
    except ValueError:
        return
    raise AssertionError("with a blueprint, an unknown domain must still be rejected")


# ── Question validation ───────────────────────────────────────────────────────

def valid_exam_question(prompt: str, **overrides) -> dict:
    payload = {
        "domain": "Security",
        "question": prompt,
        "options": [
            "Usar uma role do IAM com permissao minima",
            "Gravar as chaves de acesso no codigo",
            "Tornar o bucket publico para leitura",
            "Compartilhar as chaves entre contas",
        ],
        "correct_options": ["Usar uma role do IAM com permissao minima"],
        "response_type": "single",
        "explanation": "Roles entregam credenciais temporarias e rotacionadas, sem segredo no codigo.",
    }
    payload.update(overrides)
    return payload


def test_validation_accepts_single_and_multiple_response() -> None:
    single = validate_exam_question_batch(
        [valid_exam_question("Como conceder acesso a uma funcao Lambda?")],
        domains=AWS_DOMAINS,
        existing_questions=[],
    )
    require(len(single) == 1, "a valid single-response question must validate")
    require(single[0].response_type == "single", "response type must survive validation")

    multiple = validate_exam_question_batch(
        [
            valid_exam_question(
                "Quais DUAS acoes reduzem cold start?",
                options=[
                    "Configurar provisioned concurrency",
                    "Reduzir o tamanho do pacote de deploy",
                    "Aumentar o timeout da funcao",
                    "Habilitar versionamento no S3",
                    "Trocar a regiao da funcao",
                ],
                correct_options=[
                    "Configurar provisioned concurrency",
                    "Reduzir o tamanho do pacote de deploy",
                ],
                response_type="multiple",
            )
        ],
        domains=AWS_DOMAINS,
        existing_questions=[],
    )
    require(len(multiple) == 1, "the exam format must support choose-two questions")
    require(len(multiple[0].correct_options) == 2, "both correct options must survive")


def test_validation_rejects_broken_exam_questions() -> None:
    cases = [
        ("an unknown domain", valid_exam_question("Q1", domain="Astrologia")),
        ("a correct option absent from the options", valid_exam_question("Q2", correct_options=["Outra coisa"])),
        ("no correct option at all", valid_exam_question("Q3", correct_options=[])),
        (
            "single response with two correct answers",
            valid_exam_question("Q4", correct_options=[
                "Usar uma role do IAM com permissao minima",
                "Gravar as chaves de acesso no codigo",
            ]),
        ),
        (
            "multiple response with one correct answer",
            valid_exam_question("Q5", response_type="multiple"),
        ),
        ("fewer than four options", valid_exam_question("Q6", options=["Uma", "Duas", "Tres"])),
        (
            "label-only options",
            valid_exam_question(
                "Q7",
                options=["A", "B", "C", "D"],
                correct_options=["A"],
            ),
        ),
        (
            "duplicate options",
            valid_exam_question(
                "Q8",
                options=["Igual", "Igual", "Outra", "Mais uma"],
                correct_options=["Igual"],
            ),
        ),
        ("an empty explanation", valid_exam_question("Q9", explanation="   ")),
    ]
    for label, payload in cases:
        try:
            validate_exam_question_batch([payload], domains=AWS_DOMAINS, existing_questions=[])
        except ValueError:
            continue
        raise AssertionError(f"{label} must be rejected")


def test_validation_refuses_repeats() -> None:
    prompt = "Como conceder acesso a uma funcao Lambda?"
    try:
        validate_exam_question_batch(
            [valid_exam_question(prompt)], domains=AWS_DOMAINS, existing_questions=[prompt]
        )
    except ValueError:
        pass
    else:
        raise AssertionError("a question already in the pool must be rejected")

    try:
        validate_exam_question_batch(
            [valid_exam_question(prompt), valid_exam_question(prompt.lower())],
            domains=AWS_DOMAINS,
            existing_questions=[],
        )
    except ValueError:
        pass
    else:
        raise AssertionError("a repeat inside one batch must be rejected")


# ── Source contracts ──────────────────────────────────────────────────────────

def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_backend_contract() -> None:
    models = read(MODELS)
    for expected in (
        "class Exam(SQLModel, table=True)",
        "class ExamQuestion(SQLModel, table=True)",
        "class ExamAttempt(SQLModel, table=True)",
        "class ExamAttemptAnswer(SQLModel, table=True)",
        "passing_percent: int",
        "correct_options: list[str]",
        "score_percent: Optional[int]",
    ):
        require(expected in models, f"missing exam model contract: {expected}")

    schemas = read(SCHEMAS)
    for expected in (
        "class ExamSchema",
        "class ExamQuestionSchema",
        "class ExamAttemptSchema",
        "class ExamAttemptQuestionSchema",
        "class ExamAttemptResultSchema",
    ):
        require(expected in schemas, f"missing exam schema: {expected}")
    attempt_question = schemas[schemas.index("class ExamAttemptQuestionSchema") :][:600]
    require(
        "correct_options" not in attempt_question,
        "the answer key must never be sent to the client while a sitting is open",
    )

    main = read(MAIN)
    for expected in (
        '@app.get("/api/exams"',
        '@app.post("/api/exams/{exam_id}/attempts"',
        '@app.post("/api/exams/attempts/{attempt_id}/answers"',
        '@app.post("/api/exams/attempts/{attempt_id}/finish"',
        '@app.get("/api/exams/{exam_id}/attempts"',
    ):
        require(expected in main, f"missing exam route: {expected}")
    require(
        "def list_subject_questions" not in main,
        "the subject-wide pool must be gone: it is what conflated the two modes",
    )

    migration = read(MIGRATION)
    require('revision: str = "0011"' in migration, "the exam migration must declare its revision")
    require(
        'down_revision: Union[str, None] = "0010"' in migration,
        "the exam migration must chain after 0010, not fork a second alembic head",
    )
    for table in ("exam", "examquestion", "examattempt", "examattemptanswer"):
        require(f'"{table}"' in migration, f"migration must create {table}")


# ── Moving the seeded topics into the exam mode ───────────────────────────────

def _migration_session():
    from sqlmodel import Session, SQLModel, create_engine

    import models.database  # noqa: F401
    from models.database import ChildProfile, User

    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    session = Session(engine)
    user = User(
        first_name="Test",
        last_name="Parent",
        email="parent@example.test",
        cpf_hash="cpf-hash",
        password_hash="hash",
    )
    session.add(user)
    session.flush()
    session.add(ChildProfile(user_id=user.id, name="Henrique", age_group="10-12"))
    session.commit()
    return session


def test_seeded_topics_become_exams() -> None:
    sys.path.insert(0, str(ROOT / "scripts"))
    import dva_c02_question_bank as question_bank
    import migrate_dva_c02_to_exam as migrator
    import seed_dva_c02_questions as seeder
    from sqlmodel import select
    from models.database import Exam, ExamQuestion, ProgrammingQuestion, ProgrammingTopic

    session = _migration_session()
    try:
        seeder.seed(
            session,
            email="parent@example.test",
            child_name="Henrique",
            subject_name="Simulado DVA-C02 - Estilo proximo da prova",
        )
        session.commit()

        result = migrator.migrate(session, email="parent@example.test", child_name="Henrique")
        session.commit()

        require(result.exams_created == 3, f"each seeded topic must become an exam, got {result.exams_created}")
        require(
            result.questions_moved == len(question_bank.all_questions()),
            f"every question must move, got {result.questions_moved}",
        )
        require(result.topics_removed == 3, "the seeded topics must not linger in the questions mode")

        exams = session.exec(select(Exam)).all()
        require(len(exams) == 3, "three exams must exist after the move")
        for exam in exams:
            require(exam.passing_percent == 72, "the pass mark must be the AWS associate cut")
            require(exam.question_count == 21, "each seeded simulado holds 21 questions")
            require(exam.duration_minutes == 42, "21 questions at the AWS pace is 42 minutes")
            require(len(exam.domains or []) == 4, "the blueprint must carry all four domains")
            pool = session.exec(select(ExamQuestion).where(ExamQuestion.exam_id == exam.id)).all()
            require(len(pool) == 21, f"{exam.name} must own its 21 questions")
            for question in pool:
                require(
                    question.domain in set(question_bank.DOMAIN_WEIGHTS),
                    f"a moved question kept an unknown domain: {question.domain}",
                )
                require(len(question.correct_options) == 1, "moved questions are single-response")
                require(
                    question.correct_options[0] in list(question.options),
                    "the moved answer key must be one of the moved options",
                )
                require(bool(question.explanation.strip()), "the explanation must survive the move")

        require(
            not session.exec(select(ProgrammingTopic)).all(),
            "no seeded topic may remain",
        )
        require(
            not session.exec(select(ProgrammingQuestion)).all(),
            "the moved questions must not stay in the questions mode as well",
        )
    finally:
        session.close()


def test_migration_is_idempotent() -> None:
    sys.path.insert(0, str(ROOT / "scripts"))
    import migrate_dva_c02_to_exam as migrator
    import seed_dva_c02_questions as seeder
    from sqlmodel import select
    from models.database import Exam, ExamQuestion

    session = _migration_session()
    try:
        seeder.seed(
            session,
            email="parent@example.test",
            child_name="Henrique",
            subject_name="Simulado DVA-C02 - Estilo proximo da prova",
        )
        session.commit()
        migrator.migrate(session, email="parent@example.test", child_name="Henrique")
        session.commit()

        second = migrator.migrate(session, email="parent@example.test", child_name="Henrique")
        session.commit()
        require(second.exams_created == 0, "re-running must not duplicate exams")
        require(second.questions_moved == 0, "re-running must not duplicate questions")

        require(len(session.exec(select(Exam)).all()) == 3, "still exactly three exams")
        require(
            len(session.exec(select(ExamQuestion)).all()) == 63,
            "the pool must not grow on a second run",
        )
    finally:
        session.close()


def main() -> None:
    for name, test in sorted(globals().items()):
        if name.startswith("test_") and callable(test):
            test()
    print("Exam simulado mode checks passed.")


if __name__ == "__main__":
    main()
