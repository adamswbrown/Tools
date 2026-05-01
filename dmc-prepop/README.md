# dmc-prepop

Extract server inventory, topology, and utilisation from Microsoft System Center
deployments (SCCM, SCOM, SCOM DW) into CSV files that can feed Dr Migrate (DMC)
for cloud migration assessment.

This is a feeder, not a replacement for DMC. SCCM and SCOM provide static
inventory and historical utilisation; DMC remains required for live network
dependency capture, process-level fingerprinting, and application-boundary
resolution.

## Status

**Phase 1 — SCCM only.** SCOM CMDB and SCOM Data Warehouse modules will land in
follow-up PRs.

## Install

```bash
pip install -e .
# Optional: pyodbc-based Integrated Auth on Windows
pip install -e .[odbc]
```

## SCCM extraction

```bash
dmc-prepop sccm \
    --server sccmdb.corp.local \
    --database CM_PS1 \
    --auth sql \
    --user cmdb_reader \
    --password '...' \
    --out output/
```

Use `--auth integrated` (requires the `[odbc]` extra) when running on a
domain-joined host against a Kerberos-only SQL instance.

`--timestamp-output` writes into `output/<UTC-timestamp>/` instead of
overwriting, for snapshotting.

### Outputs

Eight CSVs in the output directory plus `coverage_summary.json`:

| File | Source query | Notes |
| --- | --- | --- |
| `sccm_servers.csv` | Query 1.1 | Spine. One row per server with hardware, OS, memory, AD site. Hostname normalised. |
| `sccm_cpu.csv` | Query 1.2 | One row per physical socket. Aggregate `CoresPerSocket` for total cores. |
| `sccm_storage.csv` | Query 1.3 | Fixed disks only (`DriveType0 = 3`). Sizes in MB. |
| `sccm_network.csv` | Query 1.4 | IP/MAC. `IPAddress0` is `;`-delimited when multi-IP. |
| `sccm_software.csv` | Query 1.5 | Add/Remove Programs (x86 + x64 unioned). |
| `sccm_services.csv` | Query 1.6 | Workload signature dictionary feeds off this. |
| `sccm_roles.csv` | Query 1.7 | Installed Windows Server roles/features only. |
| `sccm_patches.csv` | Query 1.8 | Per-host update compliance summary. |

`coverage_summary.json` lists per-query status (`executed` / `skipped` / `failed`),
row counts, and any missing source views — for the customer conversation about
gaps DMC needs to fill.

### Schema verification

Each query lists the SCCM `v_*` views it requires. The extractor checks
`INFORMATION_SCHEMA.VIEWS` before running and skips with a clear message when a
view isn't present (versions vary; some inventory classes are optional).

### Hostname normalisation

All hostname columns are lowercased, NetBIOS-stripped, and trailing-`$`-stripped
so SCCM ↔ SCOM ↔ SCOMDW joins work without further normalisation.

## Roadmap

- Phase 2: SCOM CMDB module (`OperationsManager` database) — entities,
  hosting graph, SQL/IIS topology.
- Phase 3: SCOM DW module (`OperationsManagerDW`) — perf hourly, P95 right-sizer
  aggregation, paged date-range streaming.
- Phase 4: Cross-product merge helper and gap analysis.
