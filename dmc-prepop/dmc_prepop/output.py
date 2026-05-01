"""CSV writer for extracted records.

Format: UTF-8 with BOM, comma-delimited, all string fields quoted. Streams rows
so we don't hold large result sets in memory.
"""
from __future__ import annotations

import csv
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable, Iterator


class CSVWriter:
    def __init__(self, path: Path, headers: list[str]) -> None:
        self.path = path
        self.headers = headers
        self._fh = open(path, "w", encoding="utf-8-sig", newline="")
        self._writer = csv.writer(
            self._fh,
            delimiter=",",
            quotechar='"',
            quoting=csv.QUOTE_NONNUMERIC,
            lineterminator="\n",
        )
        self._writer.writerow(headers)
        self.row_count = 0

    def write_row(self, row: Iterable) -> None:
        self._writer.writerow([_clean(v) for v in row])
        self.row_count += 1

    def close(self) -> None:
        self._fh.close()


@contextmanager
def open_csv(path: Path, headers: list[str]) -> Iterator[CSVWriter]:
    path.parent.mkdir(parents=True, exist_ok=True)
    w = CSVWriter(path, headers)
    try:
        yield w
    finally:
        w.close()


def _clean(value):
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value
