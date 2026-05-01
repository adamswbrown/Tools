"""Coverage summary for an extraction run.

Each module (SCCM, AD, ...) contributes its own section. The JSON summary
captures per-query status and row counts; modules that have a spec-defined
flat coverage CSV (e.g. AD's ad_coverage_summary.csv) write that separately.
"""
from __future__ import annotations

import csv
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable

from dmc_prepop.sccm.extract import QueryResult as SCCMResult


@dataclass
class CoverageSummary:
    output_dir: str
    sccm: dict | None = None
    ad: dict | None = None

    def to_json(self) -> str:
        # Drop sections that weren't run.
        payload = {k: v for k, v in asdict(self).items() if v is not None}
        return json.dumps(payload, indent=2, default=str)


def build_summary(
    output_dir: Path,
    sccm_results: list[SCCMResult] | None = None,
    ad_results: list | None = None,
) -> CoverageSummary:
    summary = CoverageSummary(output_dir=str(output_dir))
    if sccm_results is not None:
        summary.sccm = {
            "queries": [
                {
                    "name": r.name,
                    "status": r.status,
                    "rows": r.row_count,
                    "output": r.output,
                    "missing_views": list(r.missing_views) or None,
                    "error": r.error,
                }
                for r in sccm_results
            ],
            "distinct_hosts": _distinct_hosts(output_dir / "sccm_servers.csv"),
        }
    if ad_results is not None:
        summary.ad = {
            "queries": [
                {
                    "name": r.name,
                    "status": r.status,
                    "rows": r.row_count,
                    "output": r.output,
                    "error": r.error,
                }
                for r in ad_results
            ],
            "distinct_hosts": _distinct_hosts(output_dir / "ad_servers.csv"),
        }
    return summary


def _distinct_hosts(servers_csv: Path) -> int:
    if not servers_csv.exists():
        return 0
    seen: set[str] = set()
    with open(servers_csv, encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        if "Hostname" not in (reader.fieldnames or []):
            return 0
        for row in reader:
            host = (row.get("Hostname") or "").strip()
            if host:
                seen.add(host)
    return len(seen)


def write_summary(summary: CoverageSummary, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(summary.to_json(), encoding="utf-8")


# ---------------------------------------------------------------------------
# AD-specific coverage CSV (spec Query 9)
# ---------------------------------------------------------------------------

AD_COVERAGE_HEADERS = [
    "TotalEnabledServers",
    "DomainControllers",
    "ADSites",
    "ADSubnets",
    "StaleServers90Day",
    "ServersWithSQLSPN",
    "ServersWithHTTPSPN",
    "OSDistribution",
]


def write_ad_coverage_summary(output_dir: Path) -> Path | None:
    """Produce ad_coverage_summary.csv from the other AD CSVs (spec Query 9).

    Reads the already-written AD CSVs rather than re-querying. Skips silently
    if ad_servers.csv isn't present (AD module wasn't run).
    """
    servers_csv = output_dir / "ad_servers.csv"
    if not servers_csv.exists():
        return None

    enabled = 0
    os_counter: dict[str, int] = {}
    with open(servers_csv, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            enabled += 1
            os_name = (row.get("OperatingSystem") or "").strip()
            if os_name:
                os_counter[os_name] = os_counter.get(os_name, 0) + 1

    dcs = _row_count(output_dir / "ad_domain_controllers.csv")
    sites = _row_count(output_dir / "ad_sites.csv")
    subnets = _row_count(output_dir / "ad_subnets.csv")
    stale = _row_count(output_dir / "ad_stale_servers.csv")

    sql_hosts = _hosts_with_service_class(
        output_dir / "ad_spns_computer.csv", "MSSQLSvc"
    )
    http_hosts = _hosts_with_service_class(
        output_dir / "ad_spns_computer.csv", "HTTP"
    )

    os_dist = " | ".join(
        f"{name}: {count}"
        for name, count in sorted(os_counter.items(), key=lambda kv: -kv[1])
    )

    out = output_dir / "ad_coverage_summary.csv"
    with open(out, "w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.writer(fh, quoting=csv.QUOTE_NONNUMERIC, lineterminator="\n")
        writer.writerow(AD_COVERAGE_HEADERS)
        writer.writerow(
            [enabled, dcs, sites, subnets, stale, len(sql_hosts), len(http_hosts), os_dist]
        )
    return out


def _row_count(path: Path) -> int:
    if not path.exists():
        return 0
    with open(path, encoding="utf-8-sig") as fh:
        return max(0, sum(1 for _ in fh) - 1)


def _hosts_with_service_class(spn_csv: Path, service_class: str) -> set[str]:
    if not spn_csv.exists():
        return set()
    hosts: set[str] = set()
    with open(spn_csv, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            if (row.get("ServiceClass") or "") == service_class:
                host = (row.get("Hostname") or "").strip()
                if host:
                    hosts.add(host)
    return hosts
