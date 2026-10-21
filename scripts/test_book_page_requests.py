"""Persisted page requests must be ordered, bounded and reusable without AI."""
import sys
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

if __name__ == "__main__" and not os.environ.get("LEGACY_E2E_ROOT"):
    # Also protect direct execution by CI's existing scripts/test_*.py loop.
    runner = Path(__file__).resolve().parent / "e2e/run_legacy.py"
    sys.exit(subprocess.call([sys.executable, str(runner), Path(__file__).name]))

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))
import main
from fastapi import HTTPException
from starlette.requests import Request
from sqlmodel import Session, SQLModel, create_engine, select
from models.database import Book, BookPage
from schemas.schemas import BookOutlineSchema, GenerateBookPageRequestSchema, GeneratedBookPageDraftSchema, GenerateBookRequestSchema
from services.phrase_generator_service import AIProviderConfig


class BookPageRequestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="book-page-test-")
        self.engine = create_engine(f"sqlite:///{Path(self.temp.name, 'book.sqlite').as_posix()}",
                                    connect_args={"check_same_thread": False})
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.book = Book(title="Test", theme="colors", num_pages=2)
        self.session.add(self.book)
        self.session.commit()
        self.session.refresh(self.book)
        self.book_id = self.book.id
        self.outline = BookOutlineSchema(title="Test", theme="colors", synopsis="Short story", num_pages=2,
            page_outlines=[{"page_number": i, "scene": f"Scene {i}"} for i in (1, 2)])
        self.request = Request({"type": "http", "method": "POST", "path": "/"})
        self.patches = [
            patch.object(main, "require_parent_session", return_value=SimpleNamespace(user_id=1)),
            patch.object(main, "get_requested_child", return_value=SimpleNamespace(id=1, target_language="English", age_group="18+", birth_date=None)),
            patch.object(main, "_get_user_ai_config", return_value=AIProviderConfig(provider="gemini", api_key="synthetic", model="test")),
            patch.object(main.book_generation_service, "generate_page", side_effect=self.draft),
        ]
        for item in self.patches:
            item.start()

    def draft(self, **kwargs):
        config = kwargs.get("ai_config")
        if config and config.on_success:
            config.on_success()
        return GeneratedBookPageDraftSchema(page_number=kwargs["page_number"], text_en="The cat is blue.",
                                             text_pt="O gato é azul.", vocabulary=["cat", "blue"])

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.session.close()
        self.engine.dispose()
        self.temp.cleanup()

    def call(self, number, context=None):
        payload = GenerateBookPageRequestSchema(outline=self.outline, page_number=number, context_pages=context or [])
        return main.generate_and_add_book_page(self.book_id, payload, self.request, self.session)

    def test_repeated_page_returns_saved_page_without_provider_call(self):
        first = self.call(1)
        again = self.call(1)
        self.assertEqual(first.id, again.id)
        self.assertEqual(main.book_generation_service.generate_page.call_count, 1)

    def test_complete_book_retry_does_not_require_ai_configuration(self):
        self.call(1)
        last = self.call(2)
        with patch.object(main, "_get_user_ai_config", return_value=None):
            self.assertEqual(self.call(2).id, last.id)

    def test_cannot_skip_pages(self):
        with self.assertRaises(HTTPException) as error:
            self.call(2)
        self.assertEqual(error.exception.status_code, 409)
        main.book_generation_service.generate_page.assert_not_called()

    def test_outline_must_match_saved_book(self):
        self.outline.num_pages = 1
        self.outline.page_outlines = self.outline.page_outlines[:1]
        with self.assertRaises(HTTPException) as error:
            self.call(1)
        self.assertEqual(error.exception.status_code, 400)
        main.book_generation_service.generate_page.assert_not_called()

    def test_context_comes_from_saved_pages(self):
        self.call(1)
        fake = GeneratedBookPageDraftSchema(page_number=1, text_en="CLIENT INJECTION", text_pt="fake", vocabulary=[])
        self.call(2, [fake])
        passed = main.book_generation_service.generate_page.call_args.kwargs["context_pages"]
        self.assertEqual(passed[0].text_en, "The cat is blue.")

    def test_parallel_duplicate_uses_one_generation(self):
        from concurrent.futures import ThreadPoolExecutor
        import time
        def slow(**kwargs):
            time.sleep(0.05)
            return self.draft(**kwargs)
        def call_in_session(_):
            with Session(self.engine) as session:
                return main.generate_and_add_book_page(self.book_id,
                    GenerateBookPageRequestSchema(outline=self.outline, page_number=1), self.request, session).id
        with patch.object(main.book_generation_service, "generate_page", side_effect=slow) as generate:
            with ThreadPoolExecutor(max_workers=2) as pool:
                ids = list(pool.map(call_in_session, range(2)))
            self.assertEqual(ids[0], ids[1])
            self.assertEqual(generate.call_count, 1)

    def test_config_refresh_cannot_release_generation_lock(self):
        from contextlib import contextmanager
        active = False
        @contextmanager
        def lock(*args):
            nonlocal active
            active = True
            try:
                yield
            finally:
                active = False
        def config(*args):
            self.assertFalse(active, "Credit refresh can commit; resolve it before acquiring the generation lock")
            self.session.commit()
            return AIProviderConfig(provider="gemini", api_key="synthetic", model="test")
        with patch.object(main, "_generation_lock", side_effect=lock), patch.object(main, "_get_user_ai_config", side_effect=config):
            self.call(1)

    def test_credit_hook_commits_only_after_page_is_saved(self):
        from unittest.mock import Mock
        def charge():
            self.assertEqual(len(self.session.exec(select(BookPage)).all()), 1)
            self.session.commit()
        charged = Mock(side_effect=charge)
        with patch.object(main, "_get_user_ai_config", return_value=AIProviderConfig(
                provider="gemini", api_key="synthetic", model="test", on_success=charged)):
            self.call(1)
            self.call(1)
        charged.assert_called_once()

    def test_provider_failure_does_not_consume_credit(self):
        from unittest.mock import Mock
        charge = Mock()
        real_generate = type(main.book_generation_service).generate_page.__get__(main.book_generation_service)
        config = AIProviderConfig(provider="gemini", api_key="synthetic", model="test", on_success=charge)
        with patch.object(main, "_get_user_ai_config", return_value=config), \
             patch.object(main.book_generation_service, "generate_page", side_effect=real_generate), \
             patch.object(main.book_generation_service.text_generation_service, "_generate_gemini_json_text", side_effect=RuntimeError("provider offline")):
            with self.assertRaises(HTTPException) as error:
                self.call(1)
            self.assertEqual(error.exception.status_code, 502)
            charge.assert_not_called()

    def test_legacy_endpoint_cannot_generate_multiple_pages_at_once(self):
        with patch.object(main.book_generation_service, "generate_book", side_effect=RuntimeError("Unexpected provider call")) as generate:
            try:
                main.generate_book(GenerateBookRequestSchema(level=1, num_pages=2, theme="uncached"), self.request, self.session)
            except HTTPException as error:
                self.assertEqual(error.status_code, 400)
            else:
                self.fail("The old endpoint must direct multi-page generation to the paginated flow")
            generate.assert_not_called()

    def test_invalid_json_still_meters_a_successful_provider_call(self):
        from unittest.mock import Mock
        charge = Mock()
        real_generate = type(main.book_generation_service).generate_page.__get__(main.book_generation_service)
        config = AIProviderConfig(provider="gemini", api_key="synthetic", model="test", on_success=charge)
        with patch.object(main, "_get_user_ai_config", return_value=config), \
             patch.object(main.book_generation_service, "generate_page", side_effect=real_generate), \
             patch.object(main.book_generation_service.text_generation_service, "_generate_gemini_json_text", return_value="{}"):
            with self.assertRaises(HTTPException) as error:
                self.call(1)
            self.assertEqual(error.exception.status_code, 502)
            charge.assert_called_once()


if __name__ == "__main__":
    unittest.main()
