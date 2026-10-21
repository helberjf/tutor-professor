"""Standalone: python scripts/e2e/test_safety.py (never imports the application)."""
import tempfile
import unittest
from pathlib import Path
from safety import validate_database, validate_workspace


class SafetyTests(unittest.TestCase):
    def test_refuses_unowned_directory(self):
        with tempfile.TemporaryDirectory(prefix="tutor-e2e-") as directory:
            with self.assertRaises(ValueError):
                validate_workspace(directory, "run")
            Path(directory, ".e2e-owner").write_text("run", encoding="utf8")
            self.assertEqual(validate_workspace(directory, "run"), Path(directory).resolve())
            with self.assertRaises(ValueError):
                validate_workspace(directory, "other")

    def test_database_must_be_the_owned_disposable_file(self):
        with tempfile.TemporaryDirectory(prefix="tutor-e2e-") as directory:
            root = Path(directory).resolve()
            Path(root, ".e2e-owner").write_text("run", encoding="utf8")
            expected = f"sqlite:///{(root / 'e2e.sqlite').as_posix()}"
            self.assertEqual(validate_database(expected, str(root), "run"), root / "e2e.sqlite")
            for url in ["postgresql://production/db", "sqlite:///./kids_tutor.sqlite",
                        f"sqlite:///{(root.parent / 'other.sqlite').as_posix()}"]:
                with self.assertRaises(ValueError):
                    validate_database(url, str(root), "run")


if __name__ == "__main__":
    unittest.main()
