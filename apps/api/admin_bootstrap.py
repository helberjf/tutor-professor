"""Create (or repair) the administrator account for the admin dashboard.

The dashboard recognises a single administrator: the account whose e-mail
matches ADMIN_EMAIL. This module creates that account in the database, sets its
password, and prints the ADMIN_PASSWORD_HASH line to keep in the environment as
a recovery password, so the administrator can get back in even if the stored one
is lost.

It lives next to the API rather than in scripts/ so that it ships inside the
Docker image and can be run against a production stack:

    docker compose -f docker-compose.prod.yml --env-file .env.prod \\
        exec api python admin_bootstrap.py --email admin@seudominio.com

Locally, scripts/create-admin-user.py is the wrapper for the same thing.
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys
from datetime import datetime
from pathlib import Path


API_DIR = Path(__file__).resolve().parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or repair the administrator account.")
    parser.add_argument(
        "--email",
        default="",
        help="Administrator e-mail. Defaults to ADMIN_EMAIL from the environment.",
    )
    parser.add_argument("--password", help="Administrator password. Prompted when omitted.")
    parser.add_argument("--first-name", default="Admin")
    parser.add_argument("--last-name", default="Tutor")
    return parser.parse_args(argv)


def run(argv: list[str] | None = None) -> int:
    from dotenv import load_dotenv

    load_dotenv(API_DIR / ".env")

    args = parse_args(argv)

    import main
    from models.database import ChildProfile, User
    from sqlmodel import Session, select

    email = (args.email or os.getenv("ADMIN_EMAIL", "")).strip().lower()
    if not email:
        print(
            "Defina ADMIN_EMAIL no ambiente (apps/api/.env, local.secrets ou "
            ".env.prod) ou passe --email.",
            file=sys.stderr,
        )
        return 2

    if main.ADMIN_EMAIL and email != main.ADMIN_EMAIL:
        print(
            f"Aviso: {email} nao e o ADMIN_EMAIL carregado ({main.ADMIN_EMAIL}). "
            "A conta sera criada, mas o painel /admin so reconhece o ADMIN_EMAIL.",
            file=sys.stderr,
        )

    from services.password_policy import password_policy_detail, validate_password_strength

    password = args.password or getpass.getpass("Senha do administrador: ")
    # The administrator holds the keys to every other account, so the same
    # policy the signup form enforces applies here too.
    strength = validate_password_strength(password)
    if not strength.is_valid:
        print(password_policy_detail(strength), file=sys.stderr)
        return 2

    main.create_db_and_tables()
    main._run_schema_migrations()

    password_hash = main.hash_password(password)
    with Session(main.engine) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        created = user is None
        if user is None:
            user = User(
                first_name=args.first_name,
                last_name=args.last_name,
                email=email,
                # The administrator does not go through the signup form, so there
                # is no CPF to hash; this keeps the unique column filled.
                cpf_hash=f"admin:{main.hash_session_token(email)}",
                password_hash=password_hash,
            )
        else:
            user.password_hash = password_hash

        user.status = main.USER_STATUS_APPROVED
        user.reviewed_at = datetime.utcnow()
        session.add(user)
        session.commit()
        session.refresh(user)

        if not session.exec(select(ChildProfile).where(ChildProfile.user_id == user.id)).first():
            session.add(ChildProfile(name=user.first_name, age_group="7-9", user_id=user.id))
            session.commit()

    print(f"{'Conta criada' if created else 'Conta atualizada'}: {email}")
    print("Entre em /login com esse e-mail e senha, depois abra /admin.")
    print()
    print("Guarde estas linhas no ambiente do servidor (.env.prod, apps/api/.env ou local.secrets):")
    print(f"ADMIN_EMAIL={email}")
    print(f"ADMIN_PASSWORD_HASH={password_hash}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
