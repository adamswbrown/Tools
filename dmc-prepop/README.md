# dmc-prepop

Extract server inventory, topology, and utilisation from Active Directory and
Microsoft System Center deployments (SCCM, SCOM, SCOM DW) into CSV files that
can feed Dr Migrate (DMC) for cloud migration assessment.

This is a feeder, not a replacement for DMC. AD/SCCM/SCOM provide static
inventory, topology, and historical utilisation; DMC remains required for live
network dependency capture, process-level fingerprinting, and
application-boundary resolution.

## Status

- **AD module** — complete. Lowest-friction source: every customer with Windows
  servers has it. Authoritative server list + SPN-based workload classification.
- **SCCM module** — complete. Hardware, software, services, roles, patches.
- **SCOM CMDB** — pending (`OperationsManager` topology).
- **SCOM DW** — pending (`OperationsManagerDW` utilisation, P95 right-sizer).

## Install

```bash
pip install -e .
# Optional: pyodbc-based Integrated Auth on Windows for SCCM SQL connection
pip install -e .[odbc]
```

## AD extraction

```bash
dmc-prepop ad \
    --server dc01.corp.local \
    --user 'CORP\reader' \
    --password '...' \
    --out output/
```

Auth options:
- `--auth simple` (default) — bind with `--user` / `--password` (or env vars
  `DMC_AD_USER` / `DMC_AD_PASSWORD`). Works from any host that can reach the DC.
- `--auth kerberos` — uses an existing Kerberos ticket on the host. No bind
  credentials required.

Connection options:
- `--ldaps` (default) / `--ldap` — TLS on port 636 vs cleartext 389.
- `--gc` — bind to the Global Catalog (3268/3269) for forest-wide queries.
- `--base-dn` — override the base DN. Default: auto-detect from rootDSE.

### AD outputs

Nine CSVs plus `coverage_summary.json`:

| File | Spec query | Notes |
| --- | --- | --- |
| `ad_servers.csv` | 1 | **Spine.** One row per enabled server-class computer. Hostname normalised, OS, last-logon age, OU path, ManagedBy. |
| `ad_spns_computer.csv` | 2 | SPNs registered on computer objects. `Workload` column maps the service class to a friendly name. |
| `ad_spns_service_accounts.csv` | 3 | SPNs registered on **user** service accounts — the high-value SQL/Exchange discovery angle. |
| `ad_spns_gmsa.csv` | 3 (variant) | SPNs registered on gMSA / sMSA accounts. |
| `ad_sites.csv` | 4 | AD Sites — usually 1:1 with physical datacentres. |
| `ad_subnets.csv` | 5 | Subnet → site mapping. |
| `ad_ou_distribution.csv` | 6 | Top-3-OU-level grouping with server counts. |
| `ad_stale_servers.csv` | 7 | Servers with no logon in 90+ days. Retirement candidates. |
| `ad_domain_controllers.csv` | 8 | DCs identified via `userAccountControl` SERVER_TRUST_ACCOUNT bit. Usually out of migration scope. |
| `ad_coverage_summary.csv` | 9 | Single-row summary: enabled servers, DCs, sites, subnets, stale count, SQL/HTTP-SPN-bearing host counts, OS distribution. |

### SPN workload classification

Service-class strings are mapped to friendly workloads via a built-in table
(see `dmc_prepop/ad/spn.py`). Examples: `MSSQLSvc` → SQL Server, `HTTP` → Web
(IIS / SharePoint / web app), `exchangeMDB`/`exchangeRFR`/`SMTPSVC` →
Exchange, `TERMSRV` → RDS. The default `host` SPN is tagged `ignore` (every
machine has it).

### What AD will not tell you

- Hardware specs (CPU/memory/disk) — query SCCM
- Live utilisation — query SCOM DW
- Network dependencies — runs through DMC
- Workgroup / non-domain-joined / Azure-AD-only / Linux servers — invisible

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

### SCCM outputs

Eight CSVs plus `coverage_summary.json`:

| File | Source query | Notes |
| --- | --- | --- |
| `sccm_servers.csv` | 1.1 | Spine. Hardware, OS, memory, AD site. |
| `sccm_cpu.csv` | 1.2 | One row per physical socket. |
| `sccm_storage.csv` | 1.3 | Fixed disks only. Sizes in MB. |
| `sccm_network.csv` | 1.4 | IP/MAC. |
| `sccm_software.csv` | 1.5 | Add/Remove Programs (x86 + x64 unioned). |
| `sccm_services.csv` | 1.6 | Workload signature dictionary feeds off this. |
| `sccm_roles.csv` | 1.7 | Installed roles/features only. |
| `sccm_patches.csv` | 1.8 | Per-host compliance summary. |

### SCCM schema verification

Each query lists the SCCM `v_*` views it requires. The extractor checks
`INFORMATION_SCHEMA.VIEWS` before running and skips with a clear message when a
view isn't present (versions vary; some inventory classes are optional).

## Cross-source conventions

- **Output format**: CSV with UTF-8 BOM, comma-delimited, quoted strings.
- **Hostname normalisation**: lowercased, trailing-`$`-stripped, NetBIOS only.
  Applied in every Hostname-bearing column so AD ↔ SCCM ↔ SCOM joins work
  without further normalisation.
- **`--timestamp-output`**: writes into `output/<UTC-timestamp>/` instead of
  overwriting; useful for retaining historic snapshots.
- **`coverage_summary.json`**: per-module per-query status (`executed` /
  `skipped` / `failed`), row counts, distinct host counts. Phase-4 gap
  analysis (AD-not-SCCM, SCCM-not-SCOM, …) will land here.

## Roadmap

- Phase 3: SCOM CMDB module (`OperationsManager` database) — entities,
  hosting graph, SQL/IIS topology.
- Phase 4: SCOM DW module (`OperationsManagerDW`) — perf hourly, P95
  right-sizer, paged date-range streaming.
- Phase 5: Cross-product merge helper and full gap analysis.
