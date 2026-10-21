"""Run the real API with guards installed BEFORE loading application modules."""
import os
from pathlib import Path
import shutil
import socket
import sys
import threading

from safety import validate_database, validate_workspace

root = validate_workspace(os.environ["E2E_WORKSPACE"], os.environ["E2E_RUN_ID"])
validate_database(os.environ["DATABASE_URL"], str(root), os.environ["E2E_RUN_ID"])
if os.environ.get("APP_ENV") != "test":
    raise RuntimeError("E2E: APP_ENV=test obrigatório.")


internal = threading.local()
original_socketpair = socket.socketpair


def internal_socketpair(*args, **kwargs):
    # asyncio on Windows creates a private loopback wake-up pipe on a random port.
    internal.socketpair = True
    try:
        return original_socketpair(*args, **kwargs)
    finally:
        internal.socketpair = False


socket.socketpair = internal_socketpair


def audit(event, args):
    if event in {"socket.connect", "socket.getaddrinfo"}:
        address = args[1] if event == "socket.connect" else (args[0], args[1])
        if isinstance(address, tuple):
            host, port = address[:2]
            if host not in {"127.0.0.1", "localhost", "::1"} or (
                    int(port) not in {3100, 8100} and not getattr(internal, "socketpair", False)):
                raise PermissionError("E2E: rede externa recusada pela API de teste.")
    if event == "sqlite3.connect":
        database = Path(os.fsdecode(args[0])).resolve()
        if database != root / "e2e.sqlite":
            raise PermissionError("E2E: acesso a outro banco SQLite recusado.")


sys.addaudithook(audit)
import dotenv  # noqa: E402
dotenv.load_dotenv = lambda *args, **kwargs: False
api_dir = Path(__file__).resolve().parents[2] / "apps" / "api"
sys.path.insert(0, str(api_dir))
import main  # noqa: E402
from seed import seed  # noqa: E402
from datetime import date, datetime
from typing import Literal
from fastapi import Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session
from models.database import User, ChildProfile

# The admin editor writes files: even those writes belong to this disposable run.
shutil.copytree(api_dir / "content", root / "content")
main.ADMIN_LEARN_DIR = root / "content" / "admin-learn"
try:
    main.on_startup()
except Exception as error:
    # Only synthetic configuration exists in this process; reveal chained cause
    # for harness diagnostics when the production bootstrap redacts its message.
    cause = error.__context__
    if cause is not None:
        print(f"E2E bootstrap cause: {type(cause).__name__}: {cause}", file=sys.stderr)
    raise
seed(main)


class FixtureOptions(BaseModel):
    status: Literal["approved", "pending", "rejected"] = "approved"
    onboarding_completed: bool = True
    seed_exam: bool = False


@main.app.post("/__e2e__/fixtures", include_in_schema=False)
def fixture(options: FixtureOptions, x_e2e_run: str = Header(default="")):
    # This endpoint exists ONLY in this wrapper, bound to loopback, after the
    # disposable database guard. Tests seed prerequisites, then use real routes.
    if x_e2e_run != os.environ["E2E_RUN_ID"]:
        raise HTTPException(status_code=403, detail="E2E run mismatch")
    validate_database(main.DATABASE_URL, str(root), x_e2e_run)
    import secrets
    from fastapi import Response
    identity = secrets.token_hex(8)
    with Session(main.engine) as session:
        user = User(first_name="Pessoa", last_name="E2E", email=f"{identity}@e2e.invalid",
                    cpf_hash=f"synthetic:{identity}", password_hash=main.hash_password("E2e!Synthetic123"),
                    status=options.status, email_verified_at=datetime.utcnow(),
                    onboarding_completed_at=datetime.utcnow() if options.onboarding_completed else None)
        session.add(user)
        session.flush()
        child = ChildProfile(name=f"Estudante {identity}", user_id=user.id, age_group="18+",
                             birth_date=date(2000, 1, 1), auto_audio=False)
        session.add(child)
        session.commit()
        session.refresh(child)
        if options.seed_exam:
            from models.database import Exam, ExamQuestion
            exam = Exam(child_id=child.id, code="E2E", name="Saudações E2E", question_count=2,
                        duration_minutes=5, passing_percent=50)
            session.add(exam)
            session.flush()
            for index, english, correct in [(0, "Good morning", "Bom dia"), (1, "Thank you", "Obrigado")]:
                session.add(ExamQuestion(exam_id=exam.id, domain="Geral", question=f"Traduza: {english}",
                                        question_key=f"synthetic-{index}", options=["Bom dia", "Obrigado", "Até mais", "Por favor"],
                                        correct_options=[correct], explanation=f"{english} significa {correct}."))
            session.commit()
        response = Response()
        token = main.create_parent_session(response=response, session=session, user_id=user.id)
        return {"id": user.id, "email": user.email, "password": "E2e!Synthetic123",
                "child_id": child.id, "child_name": child.name, "token": token}


@main.app.get("/__e2e__/ready", include_in_schema=False)
def ready():
    return {"service": "tutor-e2e", "run_id": os.environ["E2E_RUN_ID"],
            "database": "disposable-sqlite", "external_network": "blocked"}


@main.app.post("/__e2e__/shutdown", include_in_schema=False, status_code=202)
def shutdown(x_e2e_run: str = Header(default="")):
    validate_workspace(str(root), x_e2e_run)
    (root / ".shutdown").write_text(x_e2e_run, encoding="utf8")
    return {"stopping": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(main.app, host="127.0.0.1", port=8100, lifespan="off", log_level="warning")
