"""Every setting documented in .env.prod.example must reach the API container.

`docker compose --env-file .env.prod` only feeds the ${...} interpolation inside
docker-compose.prod.yml; a container gets nothing but what its service lists
under `environment:` or `env_file:`. For months the api service listed nine keys,
so TRUST_PROXY_HEADERS, AI_ENCRYPTION_KEY, SIGNUP_MODE, EMAIL_* and the rest of
the example sat in .env.prod doing nothing.

The api service now loads .env.prod as an env file. This keeps it that way:

* .env.prod is an env file of the api service, after apps/api/.env, so the
  deploy file wins where both set a key;
* no key the example documents is pinned in `environment:` to something other
  than its own .env.prod value (that entry would silently beat the env file);
* the entries that must beat both env files stay pinned in `environment:`.

The compose file is read with a deliberately small parser (CI installs only the
API's requirements, which have no YAML library). It understands the shapes this
file uses and fails loudly on anything else, rather than guessing.
"""
from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = REPO_ROOT / "docker-compose.prod.yml"
EXAMPLE_FILE = REPO_ROOT / ".env.prod.example"
DEPLOY_ENV_FILE = ".env.prod"
APP_ENV_FILE = "apps/api/.env"

# Pinned on purpose: a stale apps/api/.env copied from the development example
# says APP_ENV=development and points DATABASE_URL at 127.0.0.1.
MUST_STAY_PINNED = ("DATABASE_URL", "APP_ENV", "PARENT_COOKIE_SECURE", "PARENT_COOKIE_SAMESITE")

KEY_LINE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def meaningful(lines: list[str]) -> list[str]:
    return [line for line in lines if line.strip() and not line.lstrip().startswith("#")]


def block(lines: list[str], header: str, indent: int) -> list[str]:
    """The lines nested under `header:` at exactly `indent` spaces."""

    for index, line in enumerate(lines):
        if indent_of(line) == indent and line.strip() == f"{header}:":
            body: list[str] = []
            for child in lines[index + 1 :]:
                if child.strip() and not child.lstrip().startswith("#") and indent_of(child) <= indent:
                    break
                body.append(child)
            return body
    raise AssertionError(f"'{header}:' not found at indent {indent} in {COMPOSE_FILE.name}")


def unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        return value[1:-1]
    return value


def normalize_path(value: str) -> str:
    return unquote(value).removeprefix("./")


def parse_env_files(lines: list[str]) -> list[tuple[str, bool]]:
    """(path, required) for each env_file item, in order."""

    items: list[tuple[str, bool]] = []
    for line in meaningful(lines):
        text = line.strip()
        if text.startswith("- path:"):
            items.append((normalize_path(text[len("- path:") :]), True))
        elif text.startswith("required:") and items:
            path, _ = items[-1]
            items[-1] = (path, unquote(text[len("required:") :]).lower() != "false")
        elif text.startswith("- "):
            items.append((normalize_path(text[2:]), True))
        else:
            raise AssertionError(f"unexpected env_file line, update this parser: {line!r}")
    return items


def parse_environment(lines: list[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in meaningful(lines):
        text = line.strip()
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*))?$", text)
        if not match:
            raise AssertionError(f"unexpected environment line, update this parser: {line!r}")
        values[match.group(1)] = unquote(match.group(2) or "")
    return values


def example_keys() -> list[str]:
    keys: list[str] = []
    for line in EXAMPLE_FILE.read_text(encoding="utf-8").splitlines():
        match = KEY_LINE.match(line)
        if match and match.group(1) not in keys:
            keys.append(match.group(1))
    return keys


def main() -> None:
    lines = COMPOSE_FILE.read_text(encoding="utf-8").splitlines()
    api = block(block(lines, "services", 0), "api", 2)
    env_files = parse_env_files(block(api, "env_file", 4))
    environment = parse_environment(block(api, "environment", 4))
    paths = [path for path, _ in env_files]

    # 1. The deploy file is loaded into the container, not only interpolated.
    require(
        DEPLOY_ENV_FILE in paths,
        f"the api service must load {DEPLOY_ENV_FILE} as an env_file; found {paths}. "
        "--env-file alone never reaches the container.",
    )
    # 2. ...and wins over the optional application file.
    if APP_ENV_FILE in paths:
        require(
            paths.index(DEPLOY_ENV_FILE) > paths.index(APP_ENV_FILE),
            f"{DEPLOY_ENV_FILE} must come after {APP_ENV_FILE} so the deploy file wins",
        )

    # 3. Each documented key reaches the API with the operator's value: either
    #    through the env file, or interpolated from that same variable.
    keys = example_keys()
    require(len(keys) >= 40, f"expected the full example, parsed only {len(keys)} keys")
    pinned_over = [
        f"{key}: {environment[key]}"
        for key in keys
        if key in environment and not re.search(r"\$\{?" + key + r"\b", environment[key])
    ]
    require(
        not pinned_over,
        "these keys are documented in .env.prod.example but pinned in the api "
        f"environment, so the operator's value never arrives: {pinned_over}",
    )

    # 4. The entries that must beat both env files are still pinned.
    missing = [key for key in MUST_STAY_PINNED if key not in environment]
    require(not missing, f"these must stay in the api environment: {missing}")
    require(environment["APP_ENV"] == "production", "APP_ENV must stay pinned to production")
    require("@db:5432/" in environment["DATABASE_URL"], "DATABASE_URL must point at the db service")

    print(f"Prod compose env checks passed ({len(keys)} documented keys reach the API).")


if __name__ == "__main__":
    main()
