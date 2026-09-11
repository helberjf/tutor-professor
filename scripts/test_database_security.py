from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path
from unittest import mock

from sqlalchemy import create_engine
from sqlalchemy.dialects import postgresql


ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "apps" / "api"
sys.path.insert(0, str(API))

from database_security import harden_public_schema  # noqa: E402


class FakePostgresConnection:
    """Records statements and answers the two catalog queries the helper makes."""

    def __init__(self, roles: list[str], tables_without_rls: list[str]) -> None:
        self.dialect = postgresql.dialect()
        self.roles = roles
        self.tables = tables_without_rls
        self.statements: list[str] = []

    def execute(self, statement, parameters=None):
        sql = str(statement)
        self.statements.append(sql)
        result = mock.Mock()
        if "FROM pg_roles" in sql:
            result.scalars.return_value = [role for role in self.roles if role in parameters["roles"]]
        elif "FROM pg_class" in sql:
            result.scalars.return_value = list(self.tables)
        else:
            result.scalars.return_value = []
        return result


class HardenPublicSchemaTests(unittest.TestCase):
    def test_sqlite_is_untouched(self) -> None:
        engine = create_engine("sqlite://")
        with engine.connect() as connection:
            self.assertEqual(harden_public_schema(connection), [])

    def test_postgres_without_the_supabase_roles_is_untouched(self) -> None:
        connection = FakePostgresConnection(roles=[], tables_without_rls=["user"])

        self.assertEqual(harden_public_schema(connection), [])
        self.assertEqual(len(connection.statements), 1, connection.statements)

    def test_supabase_enables_rls_without_forcing_it_and_revokes_the_api_roles(self) -> None:
        connection = FakePostgresConnection(
            roles=["anon", "authenticated", "service_role"],
            tables_without_rls=["user", "childprofile"],
        )

        self.assertEqual(harden_public_schema(connection), ["user", "childprofile"])
        executed = "\n".join(connection.statements)

        # "user" is a reserved word; an unquoted ALTER would fail on the real table.
        self.assertIn('ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY', executed)
        self.assertIn("ALTER TABLE public.childprofile ENABLE ROW LEVEL SECURITY", executed)
        # Forcing RLS would make the owner obey it too, and with no policies the
        # backend itself would read zero rows.
        self.assertNotIn("FORCE", executed)
        self.assertNotIn("CREATE POLICY", executed)

        roles = "anon, authenticated, service_role"
        for statement in (
            f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {roles}",
            f"REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {roles}",
            f"REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, {roles}",
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM {roles}",
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM {roles}",
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM {roles}",
        ):
            self.assertIn(statement, executed)
        self.assertNotIn("GRANT ", executed)

    def test_only_tables_this_role_can_alter_are_selected(self) -> None:
        connection = FakePostgresConnection(roles=["anon"], tables_without_rls=[])

        harden_public_schema(connection)
        catalog_query = next(sql for sql in connection.statements if "FROM pg_class" in sql)

        self.assertIn("NOT c.relrowsecurity", catalog_query)
        self.assertIn("pg_has_role(current_user, c.relowner, 'USAGE')", catalog_query)


class WiringTests(unittest.TestCase):
    def test_migration_0023_applies_the_lockdown_after_0022(self) -> None:
        migration = (API / "alembic" / "versions" / "0023_supabase_row_level_security.py").read_text(
            encoding="utf-8"
        )

        self.assertRegex(migration, r'(?m)^revision: str = "0023"$')
        self.assertRegex(migration, r'(?m)^down_revision: Union\[str, None\] = "0022"$')
        upgrade = migration[migration.index("def upgrade") : migration.index("def downgrade")]
        self.assertIn("harden_public_schema(op.get_bind())", upgrade)

    def test_bootstrap_reapplies_the_lockdown_after_every_upgrade(self) -> None:
        bootstrap = (API / "database_bootstrap.py").read_text(encoding="utf-8")
        run = bootstrap[bootstrap.index("def _run_bootstrap") : bootstrap.index("def bootstrap_database")]

        self.assertLess(run.index('command.upgrade(config, "head")'), run.index("_harden_public_schema("))

    def test_no_migration_grants_the_data_api_roles(self) -> None:
        grant = re.compile(r"GRANT\s[^\n]*\bTO\s[^\n]*\b(anon|authenticated)\b", re.IGNORECASE)
        for path in sorted((API / "alembic" / "versions").glob("*.py")):
            self.assertIsNone(grant.search(path.read_text(encoding="utf-8")), path.name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
