"""CLI: dmc-prepop.

Phase 1 ships the `sccm` subcommand. Future phases will add `scom` and
`scom-dw` subcommands, plus a top-level `all` orchestrator.
"""
from __future__ import annotations

import logging
import os
import sys
from datetime import datetime
from pathlib import Path

import click

from dmc_prepop.coverage import build_summary, write_summary
from dmc_prepop.db import ConnectionSpec, DatabaseError, connect
from dmc_prepop.sccm.extract import run_all as run_sccm


def _logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )


@click.group()
@click.version_option()
def main() -> None:
    """Extract System Center inventory for DMC pre-population."""


@main.command("sccm")
@click.option("--server", required=True, help="SCCM database SQL Server host (e.g. sccmdb.corp.local).")
@click.option("--database", required=True, help="SCCM site database name (e.g. CM_PS1).")
@click.option(
    "--auth",
    type=click.Choice(["sql", "integrated"]),
    default="sql",
    show_default=True,
    help="Auth mode. 'integrated' requires the [odbc] extra.",
)
@click.option("--user", envvar="DMC_SQL_USER", help="SQL user (required for --auth sql). Env: DMC_SQL_USER.")
@click.option(
    "--password",
    envvar="DMC_SQL_PASSWORD",
    help="SQL password (required for --auth sql). Env: DMC_SQL_PASSWORD.",
)
@click.option("--port", type=int, default=1433, show_default=True)
@click.option(
    "--out",
    "-o",
    type=click.Path(file_okay=False, writable=True, path_type=Path),
    default=Path("output"),
    show_default=True,
    help="Output directory.",
)
@click.option(
    "--timestamp-output",
    is_flag=True,
    help="Write into a dated subdirectory (output/<UTC-timestamp>) instead of overwriting.",
)
@click.option("-v", "--verbose", is_flag=True)
def sccm(
    server: str,
    database: str,
    auth: str,
    user: str | None,
    password: str | None,
    port: int,
    out: Path,
    timestamp_output: bool,
    verbose: bool,
) -> None:
    """Run all SCCM queries against the site database."""
    _logging(verbose)
    log = logging.getLogger("dmc-prepop.sccm")

    if timestamp_output:
        ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        out = out / ts
    out.mkdir(parents=True, exist_ok=True)

    spec = ConnectionSpec(
        server=server,
        database=database,
        auth_mode=auth,
        user=user,
        password=password,
        port=port,
    )
    try:
        spec.validate()
    except DatabaseError as e:
        click.echo(f"error: {e}", err=True)
        sys.exit(2)

    log.info("connecting to %s/%s as %s", server, database, user or "(integrated)")
    try:
        with connect(spec) as conn:
            results = run_sccm(conn, out)
    except DatabaseError as e:
        click.echo(f"error: {e}", err=True)
        sys.exit(2)

    summary = build_summary(out, results)
    summary_path = out / "coverage_summary.json"
    write_summary(summary, summary_path)

    executed = sum(1 for r in results if r.status == "executed")
    skipped = sum(1 for r in results if r.status == "skipped")
    failed = sum(1 for r in results if r.status == "failed")
    total_rows = sum(r.row_count for r in results)

    click.echo(
        f"SCCM: {executed} executed, {skipped} skipped, {failed} failed, "
        f"{total_rows} rows total. Output: {out}",
        err=True,
    )
    click.echo(f"Coverage summary: {summary_path}", err=True)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
