"""A revoked session must never turn a concurrent read into an ORM 500.

The database interleavings are explicit instead of relying on thread timing.
Run through scripts/e2e/run_legacy.py for secret-free, disposable execution.
"""
from datetime import datetime, timedelta
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
TEMP = tempfile.TemporaryDirectory(prefix="tutor-session-race-")
DATABASE = Path(TEMP.name) / "session.sqlite"
os.environ.update(DATABASE_URL=f"sqlite:///{DATABASE.as_posix()}", APP_ENV="test",
                  SESSION_SECRET="synthetic-session-revocation-regression", TTS_PROVIDER="none",
                  AUDIO_CACHE_DIR=str(Path(TEMP.name) / "audio"))
sys.path.insert(0, str(ROOT / "apps/api"))

from sqlalchemy import delete
from sqlmodel import Session, SQLModel
from starlette.requests import Request
import main
from models.database import UserSession


class SessionRevocationRaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        SQLModel.metadata.create_all(main.engine)

    @classmethod
    def tearDownClass(cls):
        main.engine.dispose()
        TEMP.cleanup()

    def create_session(self):
        token = os.urandom(24).hex()
        previous = datetime.utcnow() - timedelta(minutes=5)
        with Session(main.engine) as database:
            record = UserSession(session_token_hash=main.hash_session_token(token),
                                 last_seen_at=previous, expires_at=datetime.utcnow() + timedelta(hours=1))
            database.add(record)
            database.commit()
            database.refresh(record)
            return token, record.id, previous

    def request(self, token):
        return Request({"type": "http", "headers": [(b"authorization", f"Bearer {token}".encode())]})

    def test_revoked_between_select_and_touch_is_unauthenticated(self):
        token, identity, _ = self.create_session()
        with Session(main.engine) as reader:
            execute = reader.exec
            revoked = False

            def interleave(statement, *args, **kwargs):
                nonlocal revoked
                result = execute(statement, *args, **kwargs)
                if getattr(statement, "is_select", False) and not revoked:
                    record = result.first()
                    self.assertEqual(record.id, identity)
                    with Session(main.engine) as revoker:
                        revoker.exec(delete(UserSession).where(UserSession.id == identity))
                        revoker.commit()
                    revoked = True
                    return SimpleNamespace(first=lambda: record)
                return result

            with patch.object(reader, "exec", side_effect=interleave):
                self.assertIsNone(main.get_request_user_session(self.request(token), reader))
            reader.flush()
        with Session(main.engine) as database:
            self.assertIsNone(database.get(UserSession, identity))

    def test_touch_does_not_leave_an_orm_update_for_a_deleted_session(self):
        token, identity, _ = self.create_session()
        with Session(main.engine) as reader:
            record = main.get_request_user_session(self.request(token), reader)
            self.assertIsNotNone(record)
            # Remove the row without ORM identity-map synchronization. This is
            # the same missing-row state a concurrent revoker left in the E2E.
            reader.connection().execute(delete(UserSession).where(UserSession.id == identity))
            reader.flush()
            reader.commit()
        with Session(main.engine) as database:
            self.assertIsNone(database.get(UserSession, identity))

    def test_live_session_still_records_activity(self):
        token, identity, previous = self.create_session()
        with Session(main.engine) as reader:
            record = main.get_request_user_session(self.request(token), reader)
            self.assertIsNotNone(record)
            self.assertGreater(record.last_seen_at, previous)
            reader.commit()
        with Session(main.engine) as database:
            self.assertGreater(database.get(UserSession, identity).last_seen_at, previous)


if __name__ == "__main__":
    unittest.main()
