"""Parser for rightsizing datasets in CSV and JSON formats.

Handles column name normalization so that slight variations in column naming
(e.g. 'Machine Name' vs 'MachineName' vs 'machine_name') are mapped to a
canonical set of fields.
"""

from __future__ import annotations

import io
import json
import logging
from pathlib import Path
from typing import Optional, Union

import pandas as pd

from models.machine import Machine

logger = logging.getLogger(__name__)

# Canonical column names used internally
CANONICAL_COLUMNS: dict[str, str] = {
    "name": "name",
    "machinename": "name",
    "machine_name": "name",
    "machine name": "name",
    "hostname": "name",
    "host_name": "name",
    "host name": "name",
    "vm_name": "name",
    "vmname": "name",
    "vm name": "name",
    "server": "name",
    "servername": "name",
    "server_name": "name",
    "server name": "name",
    "region": "region",
    "location": "region",
    "azure_region": "region",
    "azureregion": "region",
    "azure region": "region",
    "target_region": "region",
    "targetregion": "region",
    "target region": "region",
    "recommendedsku": "recommended_sku",
    "recommended_sku": "recommended_sku",
    "recommended sku": "recommended_sku",
    "sku": "recommended_sku",
    "vm_sku": "recommended_sku",
    "vmsku": "recommended_sku",
    "vm sku": "recommended_sku",
    "target_sku": "recommended_sku",
    "targetsku": "recommended_sku",
    "target sku": "recommended_sku",
    "recommended_vm_size": "recommended_sku",
    "vmsize": "recommended_sku",
    "vm_size": "recommended_sku",
    "vm size": "recommended_sku",
    "vcpu": "vcpu",
    "vcpus": "vcpu",
    "cpu": "vcpu",
    "cpus": "vcpu",
    "cores": "vcpu",
    "core_count": "vcpu",
    "corecount": "vcpu",
    "core count": "vcpu",
    "num_cpus": "vcpu",
    "memorygb": "memory_gb",
    "memory_gb": "memory_gb",
    "memory gb": "memory_gb",
    "memory": "memory_gb",
    "ram": "memory_gb",
    "ramgb": "memory_gb",
    "ram_gb": "memory_gb",
    "ram gb": "memory_gb",
    "memory_size_gb": "memory_gb",
    "vmfamily": "vm_family",
    "vm_family": "vm_family",
    "vm family": "vm_family",
    "family": "vm_family",
    "sku_family": "vm_family",
    "skufamily": "vm_family",
    "sku family": "vm_family",
    "series": "vm_family",
    "vm_series": "vm_family",
    "vmseries": "vm_family",
    "vm series": "vm_family",
}

REQUIRED_COLUMNS: set[str] = {"name", "region", "recommended_sku"}


class DatasetParseError(Exception):
    """Raised when the dataset cannot be parsed."""


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Map raw column names to canonical names.

    Unrecognized columns are kept under their original lowered name.
    """
    rename_map: dict[str, str] = {}
    for col in df.columns:
        lookup = col.strip().lower().replace("-", "_")
        canonical = CANONICAL_COLUMNS.get(lookup)
        if canonical:
            rename_map[col] = canonical
        else:
            rename_map[col] = lookup
    df = df.rename(columns=rename_map)
    return df


def _validate_required(df: pd.DataFrame) -> None:
    """Ensure the dataframe has all required columns after normalization."""
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise DatasetParseError(
            f"Dataset is missing required columns: {', '.join(sorted(missing))}. "
            f"Found columns: {', '.join(sorted(df.columns))}"
        )


def _to_machines(df: pd.DataFrame) -> list[Machine]:
    """Convert dataframe rows to Machine objects."""
    machines: list[Machine] = []
    known_fields = {"name", "region", "recommended_sku", "vcpu", "memory_gb", "vm_family"}
    extra_cols = [c for c in df.columns if c not in known_fields]

    for _, row in df.iterrows():
        vcpu: Optional[int] = None
        if "vcpu" in df.columns and pd.notna(row.get("vcpu")):
            try:
                vcpu = int(float(row["vcpu"]))
            except (ValueError, TypeError):
                pass

        memory_gb: Optional[float] = None
        if "memory_gb" in df.columns and pd.notna(row.get("memory_gb")):
            try:
                memory_gb = float(row["memory_gb"])
            except (ValueError, TypeError):
                pass

        vm_family: Optional[str] = None
        if "vm_family" in df.columns and pd.notna(row.get("vm_family")):
            vm_family = str(row["vm_family"])

        extra = {}
        for c in extra_cols:
            if pd.notna(row.get(c)):
                extra[c] = str(row[c])

        machines.append(
            Machine(
                name=str(row["name"]),
                region=str(row["region"]),
                recommended_sku=str(row["recommended_sku"]),
                vcpu=vcpu,
                memory_gb=memory_gb,
                vm_family=vm_family,
                extra=extra,
            )
        )
    return machines


def parse_csv(source: Union[str, Path, io.StringIO, io.BytesIO]) -> list[Machine]:
    """Parse a CSV file or stream into a list of Machine objects.

    Args:
        source: File path, StringIO, or BytesIO containing CSV data.

    Returns:
        List of Machine objects.

    Raises:
        DatasetParseError: If the CSV cannot be parsed or required columns are missing.
    """
    try:
        df = pd.read_csv(source)
    except Exception as exc:
        raise DatasetParseError(f"Failed to read CSV: {exc}") from exc

    df = _normalize_columns(df)
    _validate_required(df)
    logger.info("Parsed CSV with %d rows and columns: %s", len(df), list(df.columns))
    return _to_machines(df)


def parse_json(source: Union[str, Path, io.StringIO, io.BytesIO]) -> list[Machine]:
    """Parse a JSON file or stream into a list of Machine objects.

    Expects either a JSON array of objects or a JSON object with a top-level key
    containing the array (e.g. {"machines": [...]}).

    Args:
        source: File path, StringIO, or BytesIO containing JSON data.

    Returns:
        List of Machine objects.

    Raises:
        DatasetParseError: If the JSON cannot be parsed or required columns are missing.
    """
    try:
        if isinstance(source, (str, Path)):
            with open(source, "r", encoding="utf-8") as f:
                raw = json.load(f)
        elif isinstance(source, io.BytesIO):
            raw = json.loads(source.read().decode("utf-8"))
        else:
            raw = json.loads(source.read())
    except Exception as exc:
        raise DatasetParseError(f"Failed to read JSON: {exc}") from exc

    # If raw is a dict, look for the first key whose value is a list
    if isinstance(raw, dict):
        for key, val in raw.items():
            if isinstance(val, list):
                raw = val
                break
        else:
            raise DatasetParseError(
                "JSON object does not contain an array of records."
            )

    if not isinstance(raw, list):
        raise DatasetParseError("Expected a JSON array of machine records.")

    try:
        df = pd.DataFrame(raw)
    except Exception as exc:
        raise DatasetParseError(f"Failed to convert JSON to DataFrame: {exc}") from exc

    df = _normalize_columns(df)
    _validate_required(df)
    logger.info("Parsed JSON with %d rows and columns: %s", len(df), list(df.columns))
    return _to_machines(df)


def parse_file(source: Union[str, Path, io.BytesIO], filename: str) -> list[Machine]:
    """Auto-detect format from filename and parse accordingly.

    Args:
        source: File path or BytesIO stream.
        filename: Original filename used for format detection.

    Returns:
        List of Machine objects.

    Raises:
        DatasetParseError: If format is unsupported or parsing fails.
    """
    ext = Path(filename).suffix.lower()
    if ext == ".csv":
        return parse_csv(source)
    elif ext == ".json":
        return parse_json(source)
    else:
        raise DatasetParseError(
            f"Unsupported file format '{ext}'. Use .csv or .json files."
        )
