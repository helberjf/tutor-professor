from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTER = ROOT / "apps" / "web" / "src" / "app" / "register" / "page.tsx"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    source = REGISTER.read_text(encoding="utf-8")

    require("ai_provider: 'gemini'" in source, "Gemini remains the registration default")
    require("<details" in source, "optional AI setup is collapsible")
    require("<summary" in source, "collapsible AI setup has a dropdown summary")
    require("Configuração de IA (opcional)" in source, "AI setup is clearly optional")
    require("Você pode deixar tudo em branco" in source, "registration explains that an API key is not required")
    require("id=\"ai_provider\"" in source, "advanced provider selection remains available")
    require("id=\"ai_api_key\"" in source, "advanced API key input remains available")
    require("<details open" not in source, "advanced AI setup starts collapsed")

    print("Register AI UI checks passed.")


if __name__ == "__main__":
    main()
