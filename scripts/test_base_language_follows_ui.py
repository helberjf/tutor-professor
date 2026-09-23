"""As traduções das lições são escritas na língua que a pessoa escolheu, não na
que o navegador ou o sistema operacional dizem que ela fala.

``base_language`` já foi sincronizado automaticamente a partir do header
``X-App-Locale`` (o idioma da interface), mas isso quebrava para quem usa um
aparelho com o sistema num idioma diferente do seu — um americano com Windows
em português passava a receber as explicações em português contra a vontade.
Agora ``base_language`` é uma escolha explícita, feita no cadastro e ajustável
depois na área da conta, e a interface pode mudar de idioma sem arrastar as
explicações das aulas junto.
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


async def run() -> None:
    main.on_startup()
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # ── Quem não escolhe nada continua caindo em português ────────────────
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
            "register sem base_language",
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
            "sem escolha explícita, a conta nova começa em português",
        )

        # ── O header de locale da interface não mexe mais na língua das aulas ─
        assert_status(await client.get("/api/progress", headers=headers), 200, "sem header")
        require(
            read_child(child_id).base_language == "Portuguese",
            "sem header, nada muda",
        )

        assert_status(
            await client.get("/api/progress", headers={**headers, "X-App-Locale": "en"}),
            200,
            "tela em inglês",
        )
        require(
            read_child(child_id).base_language == "Portuguese",
            "o idioma da interface é independente do idioma das explicações: "
            "trocar a tela para inglês não pode arrastar o base_language junto",
        )

        # ── A escolha explícita nas configurações é o que manda ───────────────
        assert_status(
            await client.post(
                "/api/parent/settings",
                json={"base_language": "English"},
                headers=headers,
            ),
            200,
            "trocar o idioma das explicações nas configurações",
        )
        require(
            read_child(child_id).base_language == "English",
            "a troca explícita nas configurações é respeitada",
        )

        # E continua ali mesmo que a interface volte para português.
        assert_status(
            await client.get("/api/progress", headers={**headers, "X-App-Locale": "pt-BR"}),
            200,
            "tela em português depois da troca explícita",
        )
        require(
            read_child(child_id).base_language == "English",
            "a interface sozinha não derruba a escolha explícita",
        )

    # ── Quem escolhe no cadastro tem a escolha respeitada desde o início ──────
    # (Uma conta nova não é aprovada automaticamente, então o perfil é lido
    # direto do banco em vez de passar pela API de listagem de filhos.)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        assert_status(
            await client.post(
                "/api/auth/register",
                json={
                    "first_name": "Jane",
                    "last_name": "Doe",
                    "email": "jane@example.com",
                    "cpf": "11144477735",
                    "password": "Secret@123",
                    "child_name": "Jane",
                    "base_language": "English",
                },
            ),
            201,
            "register com base_language explícito",
        )
        with Session(main.engine) as session:
            from sqlmodel import select

            jane_user = session.exec(
                select(main.User).where(main.User.email == "jane@example.com")
            ).one()
            jane_child = session.exec(
                select(main.ChildProfile).where(main.ChildProfile.user_id == jane_user.id)
            ).one()
        require(
            jane_child.base_language == "English",
            "quem escolhe inglês no cadastro recebe as explicações em inglês, "
            "mesmo estando num computador com o sistema em português",
        )

    print("Base-language-is-explicit checks passed.")


if __name__ == "__main__":
    asyncio.run(run())
