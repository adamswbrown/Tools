"""CLI: dmc-prepop.

Subcommands:
- `sccm` — extract SCCM site database (Phase 1).
- `ad`   — extract Active Directory inventory and SPN topology.

Future phases will add `scom`, `scom-dw`, and a top-level `all` orchestrator.
"""
from __future__ import annotations

import logging
import sys
from datetime import datetime
from pathlib import Path

import click

from dmc_prepop.ad.connect import ADError, ADSpec, open_session
from dmc_prepop.ad.extract import run_all as run_ad
from dmc_prepop.coverage import (
    build_summary,
    write_ad_coverage_summary,
    write_summary,
)
from dmc_prepop.db import ConnectionSpec, DatabaseError, connect
from dmc_prepop.sccm.extract import run_all as run_sccm


def _logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )


def _resolve_out(out: Path, timestamp_output: bool) -> Path:
    if timestamp_output:
        ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        out = out / ts
    out.mkdir(parents=True, exist_ok=True)
    return out


@click.group()
@click.version_option()
def main() -> None:
    """Extract pre-population data (AD / System Center) for Dr Migrate."""


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
    out = _resolve_out(out, timestamp_output)

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

    summary = build_summary(out, sccm_results=results)
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


@main.command("ad")
@click.option(
    "--server",
    required=True,
    help="Domain controller FQDN/IP (e.g. dc01.corp.local). Use --gc for forest-wide.",
)
@click.option(
    "--user",
    envvar="DMC_AD_USER",
    help="Bind user, e.g. 'CORP\\\\reader' or 'reader@corp.local'. Env: DMC_AD_USER. "
         "Required unless --auth kerberos.",
)
@click.option(
    "--password",
    envvar="DMC_AD_PASSWORD",
    help="Bind password. Env: DMC_AD_PASSWORD. Required unless --auth kerberos.",
)
@click.option(
    "--auth",
    type=click.Choice(["simple", "kerberos"]),
    default="simple",
    show_default=True,
    help="Bind type. 'kerberos' requires a working Kerberos ticket on the host.",
)
@click.option(
    "--ldaps/--ldap",
    default=True,
    show_default=True,
    help="Use LDAPS (TLS). Default on. Disable only for lab environments.",
)
@click.option(
    "--gc",
    "use_gc",
    is_flag=True,
    help="Bind to the Global Catalog (3268/3269) for forest-wide queries.",
)
@click.option(
    "--base-dn",
    default=None,
    help="Override the base DN. Default: auto-detect from rootDSE.",
)
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
    help="Write into a dated subdirectory instead of overwriting.",
)
@click.option("-v", "--verbose", is_flag=True)
def ad(
    server: str,
    user: str | None,
    password: str | None,
    auth: str,
    ldaps: bool,
    use_gc: bool,
    base_dn: str | None,
    out: Path,
    timestamp_output: bool,
    verbose: bool,
) -> None:
    """Run all AD queries against a domain controller (or Global Catalog)."""
    _logging(verbose)
    log = logging.getLogger("dmc-prepop.ad")
    out = _resolve_out(out, timestamp_output)

    spec = ADSpec(
        server=server,
        bind_user=user,
        bind_password=password,
        use_ldaps=ldaps,
        use_gc=use_gc,
        auth=auth,
        base_dn=base_dn,
    )
    log.info(
        "connecting to %s (%s, port %d) as %s",
        server,
        "LDAPS" if ldaps else "LDAP",
        spec.port(),
        user or "(kerberos)",
    )
    try:
        with open_session(spec) as session:
            log.info("base DN: %s", session.base_dn)
            results = run_ad(session, out)
    except ADError as e:
        click.echo(f"error: {e}", err=True)
        sys.exit(2)

    write_ad_coverage_summary(out)
    summary = build_summary(out, ad_results=results)
    summary_path = out / "coverage_summary.json"
    write_summary(summary, summary_path)

    executed = sum(1 for r in results if r.status == "executed")
    failed = sum(1 for r in results if r.status == "failed")
    total_rows = sum(r.row_count for r in results)

    click.echo(
        f"AD: {executed} executed, {failed} failed, {total_rows} rows total. "
        f"Output: {out}",
        err=True,
    )
    click.echo(f"Coverage summary: {summary_path}", err=True)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
