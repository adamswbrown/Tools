"""SQL Server connection helper.

Default driver is pymssql (no ODBC install required, works on Linux). Pass
auth_mode="integrated" to use pyodbc with Windows Integrated auth — needed when
running on a domain-joined Windows host against a Kerberos-only SQL instance.

All connections are read-only by intent: the CLI asks for db_datareader and
issues SELECT only.
"""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator, Sequence


class DatabaseError(RuntimeError):
    pass


@dataclass(frozen=True)
class ConnectionSpec:
    server: str
    database: str
    auth_mode: str = "sql"  # "sql" | "integrated"
    user: str | None = None
    password: str | None = None
    port: int = 1433
    timeout: int = 60

    def validate(self) -> None:
        if self.auth_mode not in ("sql", "integrated"):
            raise DatabaseError(f"Unknown auth_mode: {self.auth_mode}")
        if self.auth_mode == "sql" and (not self.user or not self.password):
            raise DatabaseError("auth_mode=sql requires user and password")


@contextmanager
def connect(spec: ConnectionSpec):
    spec.validate()
    if spec.auth_mode == "integrated":
        conn = _connect_pyodbc(spec)
    else:
        conn = _connect_pymssql(spec)
    try:
        yield conn
    finally:
        conn.close()


def _connect_pymssql(spec: ConnectionSpec):
    try:
        import pymssql  # type: ignore
    except ImportError as e:
        raise DatabaseError(
            "pymssql not installed. Install with `pip install pymssql`."
        ) from e
    try:
        return pymssql.connect(
            server=spec.server,
            port=spec.port,
            user=spec.user,
            password=spec.password,
            database=spec.database,
            timeout=spec.timeout,
            login_timeout=spec.timeout,
        )
    except Exception as e:
        raise DatabaseError(f"pymssql connect failed: {e}") from e


def _connect_pyodbc(spec: ConnectionSpec):
    try:
        import pyodbc  # type: ignore
    except ImportError as e:
        raise DatabaseError(
            "pyodbc not installed. Install with `pip install dmc-prepop[odbc]`."
        ) from e
    parts = [
        "DRIVER={ODBC Driver 18 for SQL Server}",
        f"SERVER={spec.server},{spec.port}",
        f"DATABASE={spec.database}",
        "Trusted_Connection=yes",
        "Encrypt=yes",
        "TrustServerCertificate=yes",
    ]
    try:
        return pyodbc.connect(";".join(parts), timeout=spec.timeout)
    except Exception as e:
        raise DatabaseError(f"pyodbc connect failed: {e}") from e


def fetch_iter(conn, sql: str, params: Sequence | None = None, batch: int = 5000) -> Iterator[tuple]:
    """Stream rows from a query, fetching in batches to bound memory."""
    cur = conn.cursor()
    try:
        cur.execute(sql, params or ())
        while True:
            rows = cur.fetchmany(batch)
            if not rows:
                return
            for r in rows:
                yield r
    finally:
        cur.close()


def column_names(cur) -> list[str]:
    return [d[0] for d in cur.description]


def view_exists(conn, view_name: str) -> bool:
    """Check INFORMATION_SCHEMA.VIEWS for the named view (case-insensitive)."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = %s",
            (view_name,),
        )
        return (cur.fetchone() or (0,))[0] > 0
    finally:
        cur.close()
