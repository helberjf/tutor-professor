from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW_SESSION = ROOT / "apps" / "web" / "src" / "components" / "coding" / "ReviewSession.tsx"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    source = REVIEW_SESSION.read_text(encoding="utf-8")

    for rating in ("knew", "partial", "unknown"):
        require(
            f"const {rating} = states.filter((state) => state.rating === '{rating}').length;" in source,
            f"review summary derives the {rating} count from card ratings",
        )

    print("Coding review summary checks passed.")


if __name__ == "__main__":
    main()
