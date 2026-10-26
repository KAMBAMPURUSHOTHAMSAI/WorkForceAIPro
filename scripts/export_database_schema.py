"""Export MySQL table/view DDL using the application's existing DATABASE_URL.

This reads schema metadata only; it does not export application rows or alter the database.
Run with the WorkForceAIPro backend virtual environment's Python executable.
"""
from __future__ import annotations

import re
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = PROJECT_ROOT / "backend"
DOCS_DIR = PROJECT_ROOT / "docs"
OUTPUT_PATH = DOCS_DIR / "database_schema.sql"
TEMP_PATH = DOCS_DIR / "database_schema.sql.tmp"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    from sqlalchemy import inspect, text
    from app.db.session import engine
except Exception as exc:  # Do not print DATABASE_URL or secrets.
    raise SystemExit(
        "Could not load the application's SQLAlchemy engine. Run this script "
        "with backend/.venv Python and verify backend/.env exists. "
        f"Details: {type(exc).__name__}: {exc}"
    ) from exc


def quote_identifier(name: str) -> str:
    """Safely quote a database identifier returned by SQLAlchemy inspection."""
    return "`" + name.replace("`", "``") + "`"


def main() -> int:
    if engine.dialect.name != "mysql":
        raise SystemExit(
            f"Expected MySQL but application's DATABASE_URL uses {engine.dialect.name!r}. "
            "No schema file was written."
        )

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    inspector = inspect(engine)
    table_names = sorted(inspector.get_table_names())
    try:
        view_names = sorted(inspector.get_view_names())
    except Exception:
        view_names = []

    if not table_names and not view_names:
        raise SystemExit("No tables/views were found; no schema file was written.")

    statements: list[str] = [
        "-- WorkForce AI Pro database schema export",
        "-- Generated from the application's configured SQLAlchemy connection.",
        "-- Schema DDL only: no application table rows are exported.",
        f"-- Generated UTC: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        "SET FOREIGN_KEY_CHECKS=0;",
        "",
    ]

    with engine.connect() as connection:
        for name in table_names:
            result = connection.execute(
                text(f"SHOW CREATE TABLE {quote_identifier(name)}")
            ).fetchone()
            if not result or len(result) < 2 or not result[1]:
                raise RuntimeError(f"MySQL did not return DDL for table {name!r}.")
            ddl = str(result[1]).rstrip().rstrip(";") + ";"
            # AUTO_INCREMENT reflects live row history, not the table definition.
            ddl = re.sub(r"\bAUTO_INCREMENT\s*=\s*\d+", "AUTO_INCREMENT=1", ddl)
            statements.extend([f"-- Table: {name}", ddl, ""])

        for name in view_names:
            result = connection.execute(
                text(f"SHOW CREATE VIEW {quote_identifier(name)}")
            ).fetchone()
            if not result or len(result) < 2 or not result[1]:
                raise RuntimeError(f"MySQL did not return DDL for view {name!r}.")
            ddl = str(result[1]).rstrip().rstrip(";") + ";"
            statements.extend([f"-- View: {name}", ddl, ""])

    statements.extend(["SET FOREIGN_KEY_CHECKS=1;", ""])
    content = "\n".join(statements)
    TEMP_PATH.write_text(content, encoding="utf-8")
    if TEMP_PATH.stat().st_size == 0 or "CREATE TABLE" not in content.upper():
        TEMP_PATH.unlink(missing_ok=True)
        raise SystemExit("Generated schema was empty or did not contain CREATE TABLE statements.")
    TEMP_PATH.replace(OUTPUT_PATH)

    print(f"Schema export saved: {OUTPUT_PATH}")
    print(f"Tables exported: {len(table_names)}")
    print(f"Views exported: {len(view_names)}")
    print(f"File size: {OUTPUT_PATH.stat().st_size} bytes")
    print("Export source: backend/.env DATABASE_URL (credentials not displayed)")
    print("Application data rows were not exported; the database was not modified.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    finally:
        try:
            engine.dispose()
        except Exception:
            pass
