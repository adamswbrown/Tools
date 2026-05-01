"""Coverage summary for an extraction run.

Phase 1 (SCCM only) emits per-query row counts plus distinct hosts seen in
sccm_servers.csv. Once SCOM modules are added, the cross-source gap analysis
(SCCM-not-SCOM, SCOM-not-SCCM, SCOM with SQL/IIS discovery) lands here.
"""
from __future__ import annotations

import csv
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

from dmc_prepop.sccm.extract import QueryResult


@dataclass
class CoverageSummary:
    output_dir: str
    sccm: dict = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, default=str)


def build_summary(output_dir: Path, sccm_results: list[QueryResult]) -> CoverageSummary:
    summary = CoverageSummary(output_dir=str(output_dir))
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
