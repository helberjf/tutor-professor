"""Guards used before importing the real API or opening any test database."""
import tempfile
from pathlib import Path


def validate_workspace(directory: str, run_id: str) -> Path:
    root = Path(directory).resolve()
    if (root.parent != Path(tempfile.gettempdir()).resolve()
            or not root.name.startswith("tutor-e2e-") or not run_id
            or not (root / ".e2e-owner").is_file()
            or (root / ".e2e-owner").read_text(encoding="utf8") != run_id):
        raise ValueError("E2E: workspace temporário sem marcador válido.")
    return root


def validate_database(url: str, directory: str, run_id: str) -> Path:
    root = validate_workspace(directory, run_id)
    database = root / "e2e.sqlite"
    # Windows may give Node an 8.3 temp path while Python resolves the long name.
    # Compare resolved files, retaining a strict scheme and no URI/query options.
    if (not url.startswith("sqlite:///") or "?" in url or "#" in url
            or Path(url[len("sqlite:///"):]).resolve() != database):
        raise ValueError("E2E: banco recusado; somente e2e.sqlite da execução é permitido.")
    return database
