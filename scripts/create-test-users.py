"""
Cria contas de teste no banco de dados local do Tutor and Professor.
Execute: python scripts/create-test-users.py
"""
import hashlib
import os
import secrets
import sqlite3
import sys
from pathlib import Path

# ── Configuracao ──────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = REPO_ROOT / "apps" / "api" / "kids_tutor.sqlite"

# Contas a criar
TEST_USERS = [
    {
        "first_name": "Helber",
        "last_name": "Soares",
        "email": "helberjf@gmail.com",
        "cpf": "12345678909",   # CPF valido: 123.456.789-09
        "password": "Teste@123",
        "child_name": "Lucas",
        "target_language": "English",
    },
    {
        "first_name": "Demo",
        "last_name": "Pai",
        "email": "demo@english-kids-tutor.test",
        "cpf": "11144477735",   # CPF valido: 111.444.777-35
        "password": "Demo@123",
        "child_name": "Ana",
        "target_language": "English",
    },
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def hash_cpf(cpf: str) -> str:
    digits = "".join(c for c in cpf if c.isdigit())
    return hashlib.sha256(digits.encode()).hexdigest()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260_000)
    return salt.hex() + ":" + dk.hex()


def validate_cpf(cpf: str) -> bool:
    digits = [int(c) for c in cpf if c.isdigit()]
    if len(digits) != 11 or len(set(digits)) == 1:
        return False
    total = sum(d * (10 - i) for i, d in enumerate(digits[:9]))
    r = total % 11
    d1 = 0 if r < 2 else 11 - r
    if digits[9] != d1:
        return False
    total = sum(d * (11 - i) for i, d in enumerate(digits[:10]))
    r = total % 11
    d2 = 0 if r < 2 else 11 - r
    return digits[10] == d2


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if not DB_PATH.exists():
        print(f"ERRO: banco de dados nao encontrado em {DB_PATH}")
        print("Execute o backend pelo menos uma vez para criar o banco.")
        sys.exit(1)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    for user_data in TEST_USERS:
        email = user_data["email"].lower().strip()
        cpf = user_data["cpf"]

        # Validar CPF
        if not validate_cpf(cpf):
            print(f"  AVISO: CPF invalido para {email}, pulando.")
            continue

        # Verificar se ja existe
        existing = cur.execute("SELECT id FROM user WHERE email = ?", (email,)).fetchone()
        if existing:
            print(f"  JA EXISTE: {email} (id={existing['id']}) — pulando.")
            continue

        cpf_hash = hash_cpf(cpf)
        existing_cpf = cur.execute("SELECT id FROM user WHERE cpf_hash = ?", (cpf_hash,)).fetchone()
        if existing_cpf:
            print(f"  CPF JA CADASTRADO para outro usuario (email={email}) — pulando.")
            continue

        # Criar usuario
        pw_hash = hash_password(user_data["password"])
        cur.execute(
            """
            INSERT INTO user (first_name, last_name, email, cpf_hash, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            """,
            (user_data["first_name"], user_data["last_name"], email, cpf_hash, pw_hash),
        )
        user_id = cur.lastrowid

        # Criar perfil da crianca
        cur.execute(
            """
            INSERT INTO childprofile (name, age_group, base_language, target_language,
                                      current_level, streak_count, voice_preference,
                                      auto_audio, user_id, created_at)
            VALUES (?, '7-9', 'pt-BR', ?, 1, 0, 'af_bella', 1, ?, datetime('now'))
            """,
            (user_data["child_name"], user_data["target_language"], user_id),
        )

        conn.commit()
        print(f"  CRIADO: {user_data['first_name']} {user_data['last_name']}")
        print(f"    Email:  {email}")
        print(f"    Senha:  {user_data['password']}")
        print(f"    Filho:  {user_data['child_name']}")

    conn.close()
    print()
    print("Contas de teste prontas!")
    print()
    print("Para entrar no app, use:")
    for u in TEST_USERS:
        print(f"  Email: {u['email']}")
        print(f"  Senha: {u['password']}")
        print()


if __name__ == "__main__":
    print()
    print("=== Criando contas de teste ===")
    print()
    main()
