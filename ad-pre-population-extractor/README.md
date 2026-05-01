# AD Pre-Population Extractor for Dr Migrate (DMC)

PowerShell extractor that pulls server inventory, workload signals, and topology
from Active Directory into CSVs ready to be merged into a DMC cloud-migration
assessment.

AD is the lowest-friction pre-population source available — every customer with
Windows servers has it. This tool is read-only, runs from any domain-joined
workstation, and needs only an authenticated domain user. It is not a
replacement for DMC; it's a feeder that gives you a complete server list, OS
metadata, network topology, and Kerberos SPN-derived workload hints before any
scanning starts.

## Requirements

- PowerShell 5.1 or 7.x
- RSAT `ActiveDirectory` module (Windows client) **or** AD DS role tools
  (Windows Server)
- LDAP/LDAPS connectivity to a domain controller (389/636) or Global Catalog
  (3268/3269)
- Read-only credentials — any authenticated domain user is sufficient

## Usage

```powershell
# Default: writes to ./ad-extract using current user credentials
.\Extract-ADInventory.ps1

# Pin to a specific DC and write a timestamped snapshot
.\Extract-ADInventory.ps1 -Server dc01.contoso.com `
                          -OutputDir C:\dmc\customer-x `
                          -TimestampOutput

# Alternate credentials (e.g. cross-domain run)
$cred = Get-Credential
.\Extract-ADInventory.ps1 -Server dc-othercorp.example.com -Credential $cred

# Tighten the stale-server window
.\Extract-ADInventory.ps1 -StaleThresholdDays 60
```

Logging is written to **stderr** so stdout stays clean for piping.

## Outputs

| File                              | Contents                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `ad_servers.csv`                  | Authoritative enabled-server list with OS, last logon, OU, owner             |
| `ad_spns_computer.csv`            | SPNs registered against computer objects (services running as Computer$)     |
| `ad_spns_service_accounts.csv`    | SPNs against domain user accounts — captures most SQL/Exchange/IIS workloads |
| `ad_spns_gmsa.csv`                | SPNs against Group Managed Service Accounts                                  |
| `ad_workload_classification.csv`  | Derived: per-host workload hints from joined SPN data + reference table      |
| `ad_sites.csv`                    | AD Sites (typically 1:1 with datacentres / offices)                          |
| `ad_subnets.csv`                  | Subnet-to-site mapping (correlate any IP back to a site)                     |
| `ad_ou_distribution.csv`          | Top-3-level OU counts — often encodes BU / env / app grouping                |
| `ad_stale_servers.csv`            | Servers inactive past `StaleThresholdDays` (default 90)                      |
| `ad_domain_controllers.csv`       | DCs (usually out of migration scope, identify and treat separately)          |
| `ad_coverage_summary.csv`         | Single-row summary for the customer conversation                             |
| `ad_run_status.csv`               | Per-query status with row counts and any errors (partial output is fine)     |

All CSVs are UTF-8 with BOM, comma-delimited, hostname-keyed (lowercased).

## Hostname normalisation

Both `Name` (NetBIOS) and `DNSHostName` (FQDN) are emitted in lowercase so
downstream merging with SCCM/SCOM extracts works without further normalisation.
Pick NetBIOS or FQDN for your join key and stick with it across all sources.

## Recommended merge order

1. Start with `ad_servers.csv` as the **authoritative server list** — it's the
   only source guaranteed to be complete and current.
2. Outer-join `sccm_servers.csv` for hardware/OS detail; flag servers in AD
   but not in SCCM (no inventory data).
3. Outer-join `scom_*` for topology/utilisation; flag servers in AD but not
   in SCOM (no monitoring coverage).
4. Use `ad_workload_classification.csv` (or the raw SPN CSVs) as
   workload-classification hints joined by hostname.

## What AD cannot tell you

DMC remains required for:

- Hardware specifications (CPU/memory/disk)
- Live utilisation
- Network dependencies / process attribution
- Application boundaries
- Workgroup / non-domain-joined servers
- Azure AD-only resources
- Linux/Unix servers (unless centralised identity is used — rare)
- Software inventory

Always emit the coverage summary alongside the extraction. The customer
conversation hinges on it.

## SPN reference

`spn_workload_reference.csv` lists the ServiceClass → Workload mapping the
script applies. The same map is embedded in the script for self-contained runs;
the CSV is provided for downstream tooling that doesn't run PowerShell.

## Caveats

- `LastLogonTimestamp` replicates every 9–14 days — fine for migration
  assessment, not for live activity reporting.
- `OperatingSystem` is set at domain join and updated on OS upgrades — usually
  reliable but can lag in-place upgrades.
- Multi-domain forests: re-run with `-Server` per domain.
- LAPS-managed devices: `msLAPS-Password` requires elevated rights and is
  sensitive — this script does **not** read it.
- Workgroup servers are invisible to AD. Flag this gap explicitly in the
  customer conversation.
- Disabled computer objects are excluded from the main inventory (they're
  surfaced via the stale-server query if relevant).
