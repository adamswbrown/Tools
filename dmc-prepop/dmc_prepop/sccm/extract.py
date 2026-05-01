"""SCCM extractor.

Verifies required views exist before each query, runs the query in streaming
mode, and writes a CSV. Returns per-query status (executed | skipped | failed)
plus row counts for the coverage summary.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from dmc_prepop.db import column_names, view_exists
from dmc_prepop.normalize import normalise_hostname
from dmc_prepop.output import open_csv
from dmc_prepop.sccm import queries as q

log = logging.getLogger(__name__)


@dataclass
class QueryResult:
    name: str
    output: str
    status: str  # "executed" | "skipped" | "failed"
    row_count: int = 0
    missing_views: tuple[str, ...] = ()
    error: str | None = None


def run_all(conn, output_dir: Path) -> list[QueryResult]:
    output_dir.mkdir(parents=True, exist_ok=True)
    results: list[QueryResult] = []
    for query in q.ALL_QUERIES:
        results.append(run_one(conn, query, output_dir))
    return results


def run_one(conn, query: q.Query, output_dir: Path) -> QueryResult:
    missing = tuple(v for v in query.required_views if not view_exists(conn, v))
    if missing:
        log.warning(
            "skip %s: missing views %s", query.name, ",".join(missing)
        )
        return QueryResult(
            name=query.name,
            output=query.output,
            status="skipped",
            missing_views=missing,
        )

    cur = conn.cursor()
    try:
        cur.execute(query.sql)
        headers = column_names(cur)
        host_idx = (
            headers.index(query.hostname_column)
            if query.hostname_column and query.hostname_column in headers
            else None
        )
        out_path = output_dir / query.output
        with open_csv(out_path, headers) as writer:
            while True:
                rows = cur.fetchmany(5000)
                if not rows:
                    break
                for row in rows:
                    if host_idx is not None:
                        row = list(row)
                        row[host_idx] = normalise_hostname(row[host_idx])
                    writer.write_row(row)
        log.info("wrote %s (%d rows)", out_path.name, writer.row_count)
        return QueryResult(
            name=query.name,
            output=query.output,
            status="executed",
            row_count=writer.row_count,
        )
    except Exception as e:
        log.exception("query %s failed", query.name)
        return QueryResult(
            name=query.name,
            output=query.output,
            status="failed",
            error=str(e),
        )
    finally:
        cur.close()
