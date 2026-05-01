# servicenow-cmdb-export

CLI that pulls CMDB reference records from ServiceNow and writes a denormalized
device-to-business-app-and-environment mapping to an Excel file. Servers and
client devices in one sheet, joined to apps via `cmdb_rel_ci` (with an
assigned-user fallback for clients).

## Install

```bash
pip install -e .
```

## Configure

Set environment variables (see `.env.example`):

- `SNOW_INSTANCE` — e.g. `acme.service-now.com`
- `SNOW_USER` / `SNOW_PASSWORD` — basic-auth credentials with read on
  `cmdb_ci_server`, `cmdb_ci_pc_hardware`, `cmdb_ci_business_app`,
  `cmdb_ci_environment`, `cmdb_rel_ci`, `sys_user`.

## Run

```bash
snow-cmdb-export server-app-map --out cmdb.xlsx
snow-cmdb-export server-app-map --out servers-only.xlsx --device-type server
snow-cmdb-export server-app-map --out filtered.xlsx \
    --query "operational_status=1^company.name=Acme"
snow-cmdb-export server-app-map --out audit.xlsx --raw
```

## Output schema (`device_app_map` sheet)

| column | source |
| --- | --- |
| device_type | `server` or `client` |
| name | `cmdb_ci_*.name` |
| fqdn | `cmdb_ci_*.fqdn` (falls back to `dns_domain`) |
| environment | `cmdb_ci_environment.name` joined via `cmdb_rel_ci` |
| assigned_user | `sys_user.name` resolved from `assigned_to` |
| assigned_user_email | `sys_user.email` |
| business_app | `cmdb_ci_business_app.name` |
| app_owner | `business_owner` (fallback `managed_by`) |
| criticality | `business_criticality` |
| support_group | `support_group` on the CI |

## Joining logic

- **Servers → apps**: relationship rows on `cmdb_rel_ci` whose `type` display
  value is one of `Runs on::Runs`, `Depends on::Used by`, `Hosted on::Hosts`.
- **Clients → apps**: same relationship lookup first; if none, fall back to
  business apps where the client's assigned user is `business_owner`,
  `managed_by`, or `owned_by`. Capped by `--max-apps-per-user` (default 10).
- **Environment**: any `cmdb_rel_ci` edge from the CI to a `cmdb_ci_environment`.
