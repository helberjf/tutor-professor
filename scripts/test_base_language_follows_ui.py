"""As traduções das lições são escritas na língua em que a pessoa lê o app.

A interface e o ``base_language`` diziam respeito à mesma coisa — a língua do
leitor — e podiam discordar: interface em inglês explicando uma frase em
espanhol com uma tradução em português. Cada requisição passou a carregar o
idioma da tela, e o servidor mantém o campo em dia.

Duas regras seguram isso de pé, e as duas são testadas aqui: só escreve quando
há divergência de verdade, e não mexe quando a língua da interface é a própria
língua sendo estudada — explicar um idioma nele mesmo não é traduzir.
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path

TMP_DIR = Path(tempfile.mkdtemp(prefix="english-kids-locale-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(TMP_DIR / 'locale.sqlite').as_posix()}"
os.environ["APP_ENV"] = "test"
os.environ["SIGNUP_MODE"] = "open"
os.environ["PARENT_PASSWORD"] = "parent-pass"
os.environ["SESSION_SECRET"] = "locale-test-secret"
os.environ["PARENT_COOKIE_SECURE"] = "false"
os.environ["PARENT_COOKIE_SAMESITE"] = "lax"
os.environ["TTS_PROVIDER"] = "none"
os.environ["AUDIO_CACHE_DIR"] = str(TMP_DIR / "audio")
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_EMAIL"] = "locale@example.com"
os.environ["ACTIVITY_TIMEZONE"] = "America/Sao_Paulo"

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

import httpx  # noqa: E402
from sqlmodel import Session  # noqa: E402

import main  # noqa: E402


def assert_status(response: httpx.Response, expected: int, label: str) -> None:
    if response.status_code != expected:
        raise AssertionError(f"{label}: expected {expected}, got {response.status_code}: {response.text}")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def read_child(child_id: int) -> main.ChildProfile:
    with Session(main.engine) as session:
        child = session.get(main.ChildProfile, child_id)
        if child is None:
            raise AssertionError("o perfil sumiu no meio do teste")
        return child


def set_target_language(child_id: int, language: str) -> None:
    with Session(main.engine) as session:
        child = session.get(main.ChildProfile, child_id)
        child.target_language = language
        session.add(child)
        session.commit()


async def run() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        assert_status(
            await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Pai",
                    "last_name": "Idioma",
                    "email": "locale@example.com",
                    "cpf": "52998224725",
                    "password": "Secret@123",
                    "child_name": "Ana",
                },
            ),
            201,
            "register",
        )
        assert_status(
            await client.post(
                "/api/auth/login",
                json={"email": "locale@example.com", "password": "Secret@123"},
            ),
            200,
            "login",
        )
        child = (await client.get("/api/parent/children")).json()[0]
        child_id = child["id"]
        headers = {"X-Child-ID": str(child_id)}

        require(
            read_child(child_id).base_language == "Portuguese",
            "uma conta nova começa escrevendo as traduções em português",
        )

        # ── Quem estuda outra língua recebe as traduções na língua da tela ────
        set_target_language(child_id, "Spanish")

        assert_status(await client.get("/api/progress", headers=headers), 200, "sem header")
        require(
            read_child(child_id).base_language == "Portuguese",
            "sem o header, nada muda: um cliente antigo não é um pedido de troca",
        )

        assert_status(
            await client.get("/api/progress", headers={**headers, "X-App-Locale": "klingon"}),
            200,
            "header desconhecido",
        )
        require(
            read_child(child_id).base_language == "Portuguese",
            "um idioma que o app não fala não muda nada",
        )

        assert_status(
            await client.get("/api/progress", headers={**headers, "X-App-Locale": "en"}),
            200,
            "tela em inglês",
        )
        require(
            read_child(child_id).base_language == "English",
            "lendo o app em inglês, o espanhol passa a ser explicado em inglês",
        )

        assert_status(
            await client.get("/api/progress", headers={**headers, "X-App-Locale": "pt-BR"}),
            200,
            "tela em português",
        )
        require(
            read_child(child_id).base_language == "Portuguese",
            "voltar a interface para português traz a explicação junto",
        )

        # Maiúsculas e minúsculas do header não são problema de quem envia.
        assert_status(
            await client.get("/api/progress", headers={**headers, "X-App-Locale": "EN"}),
            200,
            "header em maiúsculas",
        )
        require(
            read_child(child_id).base_language == "English",
            "o header não precisa chegar em minúsculas",
        )

        # ── Explicar uma língua nela mesma não é traduzir ─────────────────────
        set_target_language(child_id, "English")
        with Session(main.engine) as session:
            profile = session.get(main.ChildProfile, child_id)
            profile.base_language = "Portuguese"
            session.add(profile)
            session.commit()

        assert_status(
            await client.get("/api/progress", headers={**headers, "X-App-Locale": "en"}),
            200,
            "inglês na tela estudando inglês",
        )
        require(
            read_child(child_id).base_language == "Portuguese",
            "quem estuda inglês com a tela em inglês continua vendo a tradução "
            "em português: inglês explicado em inglês não é tradução",
        )

    print("Base-language-follows-UI checks passed.")


if __name__ == "__main__":
    asyncio.run(run())
