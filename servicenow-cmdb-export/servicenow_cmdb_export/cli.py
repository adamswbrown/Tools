"""CLI: snow-cmdb-export."""
from __future__ import annotations

import sys

import click

from servicenow_cmdb_export.client import ServiceNowClient, ServiceNowError
from servicenow_cmdb_export.exporter import write_workbook
from servicenow_cmdb_export.queries import build_rows, fetch_snapshot


@click.group()
@click.version_option()
def main() -> None:
    """Export CMDB device-to-app-and-environment mappings from ServiceNow."""


@main.command("server-app-map")
@click.option(
    "--out",
    "-o",
    required=True,
    type=click.Path(dir_okay=False, writable=True),
    help="Output .xlsx path.",
)
@click.option(
    "--device-type",
    type=click.Choice(["all", "server", "client"]),
    default="all",
    show_default=True,
)
@click.option(
    "--query",
    default=None,
    help="Optional ServiceNow encoded query applied to device tables (sysparm_query).",
)
@click.option(
    "--max-apps-per-user",
    type=int,
    default=10,
    show_default=True,
    help="Cap apps per client (via assigned-user fallback). 0 = unlimited.",
)
@click.option(
    "--raw/--no-raw",
    default=False,
    help="Also dump raw CMDB tables as additional sheets.",
)
def server_app_map(
    out: str, device_type: str, query: str | None, max_apps_per_user: int, raw: bool
) -> None:
    """Pull CMDB and write a denormalized device/app/env mapping to Excel."""
    try:
        client = ServiceNowClient()
    except ServiceNowError as e:
        click.echo(f"error: {e}", err=True)
        sys.exit(2)

    click.echo("Fetching CMDB snapshot from ServiceNow...", err=True)
    snap = fetch_snapshot(client, device_filter=device_type, extra_query=query)
    click.echo(
        f"  servers={len(snap.servers)} clients={len(snap.clients)} "
        f"apps={len(snap.apps_by_id)} envs={len(snap.envs_by_id)}",
        err=True,
    )

    rows = build_rows(snap, max_apps_per_user=max_apps_per_user)
    n = write_workbook(out, rows, snapshot=snap, include_raw=raw)
    click.echo(f"Wrote {n} rows to {out}", err=True)


if __name__ == "__main__":
    main()
