"""Keep Supabase's public Data API away from the application tables.

Supabase publishes every table in ``public`` through PostgREST and pg_graphql,
reachable with the publishable key — a key that is public by design. This app
never uses that path: the browser talks to our FastAPI backend, and the backend
connects as the table owner. So the correct policy for the API roles is
"nothing", enforced twice:

* Row level security enabled on every table with **no policies**, which denies
  every row to any role that is not the owner and has no BYPASSRLS.
* Every privilege the API roles hold on tables, sequences and functions revoked,
  including TRUNCATE, which row level security does not cover at all. The default
  privileges are revoked too, so a table created by a future migration does not
  arrive already granted to ``anon``.

RLS is enabled but deliberately **not forced**: the owner keeps bypassing it,
which is what keeps the backend working without a single policy.

On a database without the Supabase ``anon`` role (local Postgres, the VPS, SQLite)
there is no Data API to close, and this is a no-op. That also avoids turning RLS
on where the migrating role and the runtime role might differ.

Idempotent: the bootstrap runs it after every upgrade, so tables added later are
covered on the same run that creates them.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection


SCHEMA = "public"
DATA_API_ROLES = ("anon", "authenticated", "service_role")


def harden_public_schema(connection: Connection) -> list[str]:
    """Lock the Data API roles out of ``public``; return tables that gained RLS."""

    if connection.dialect.name != "postgresql":
        return []

    present_roles = set(
        connection.execute(
            text("SELECT rolname FROM pg_roles WHERE rolname = ANY(:roles)"),
            {"roles": list(DATA_API_ROLES)},
        ).scalars()
    )
    if "anon" not in present_roles:
        return []

    quote = connection.dialect.identifier_preparer.quote
    schema = quote(SCHEMA)

    # Only tables this role can alter, i.e. owns directly or through membership.
    tables = list(
        connection.execute(
            text(
                "SELECT c.relname FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = :schema AND c.relkind IN ('r', 'p') "
                "AND NOT c.relrowsecurity "
                "AND pg_has_role(current_user, c.relowner, 'USAGE') "
                "ORDER BY c.relname"
            ),
            {"schema": SCHEMA},
        ).scalars()
    )
    for table in tables:
        connection.execute(
            text(f"ALTER TABLE {schema}.{quote(table)} ENABLE ROW LEVEL SECURITY")
        )

    roles = ", ".join(quote(role) for role in DATA_API_ROLES if role in present_roles)
    for statement in (
        f"REVOKE ALL ON ALL TABLES IN SCHEMA {schema} FROM {roles}",
        f"REVOKE ALL ON ALL SEQUENCES IN SCHEMA {schema} FROM {roles}",
        # Functions default to EXECUTE for PUBLIC, which anon inherits.
        f"REVOKE ALL ON ALL FUNCTIONS IN SCHEMA {schema} FROM PUBLIC, {roles}",
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} REVOKE ALL ON TABLES FROM {roles}",
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} REVOKE ALL ON SEQUENCES FROM {roles}",
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} REVOKE ALL ON FUNCTIONS FROM {roles}",
    ):
        connection.execute(text(statement))
    return tables
