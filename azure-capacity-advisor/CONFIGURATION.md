# Configuration Reference

Complete reference for all configuration options in Azure Capacity Advisor.

---

## Environment Variables

These variables are read at startup and can be used instead of (or in addition to) the sidebar UI inputs.

### Authentication

| Variable | Required | Default | Description |
|---|---|---|---|
| `AZURE_SUBSCRIPTION_ID` | Yes | (none) | The Azure subscription to query for SKU availability. Can also be entered in the sidebar. |
| `AZURE_CLIENT_ID` | For SP | (none) | The Application (client) ID of the service principal. Used when auth method is "Default" (via env vars) or "Service Principal". |
| `AZURE_TENANT_ID` | For SP | (none) | The Directory (tenant) ID of the Azure AD tenant. Used with service principal authentication. |
| `AZURE_CLIENT_SECRET` | For SP | (none) | The client secret for the service principal. Used with service principal authentication. |

> **SP** = Service Principal. These variables are only required when using Service Principal authentication via the Default credential chain or by selecting "Service Principal" in the sidebar.

### Application Tuning

| Variable | Default | Description |
|---|---|---|
| `SKU_CACHE_TTL` | `3600` | How long (in seconds) to cache the Azure SKU catalog in memory. The full catalog is fetched once, then served from cache until the TTL expires. Set to `0` to disable caching (not recommended). |
| `MAX_ALTERNATIVES` | `5` | Maximum number of alternative SKUs returned for each flagged machine. Accepts any positive integer. |
| `AZURE_MAX_RETRIES` | `3` | Number of retry attempts for each Azure API page request before giving up. Uses exponential backoff between retries. |

### Example `.env` File

```bash
# Required
AZURE_SUBSCRIPTION_ID=00000000-0000-0000-0000-000000000000

# Service Principal (optional — only if not using az login)
AZURE_TENANT_ID=11111111-1111-1111-1111-111111111111
AZURE_CLIENT_ID=22222222-2222-2222-2222-222222222222
AZURE_CLIENT_SECRET=your-client-secret-here

# Tuning (optional)
SKU_CACHE_TTL=3600
MAX_ALTERNATIVES=5
AZURE_MAX_RETRIES=3
```

> Note: Streamlit does not automatically load `.env` files. Use `export` commands, `dotenv` tooling, or pass them inline:
> ```bash
> AZURE_SUBSCRIPTION_ID=xxx streamlit run app/app.py
> ```

---

## Application Constants

These are defined in `app/config.py` and can be modified directly in the source code for deployments that need different defaults.

### Azure API

| Constant | Value | Description |
|---|---|---|
| `AZURE_COMPUTE_SKU_API_VERSION` | `2023-07-01` | The API version used in the ARM REST call to `Microsoft.Compute/skus`. This should match the version documented by Microsoft. |

### Retry Behaviour

| Constant | Value | Description |
|---|---|---|
| `AZURE_MAX_RETRIES` | `3` | Default max retries (overridable via env var). |
| `AZURE_RETRY_WAIT_SECONDS` | `2` | Exponential backoff multiplier. First retry waits ~2s, second ~4s, etc. |
| `AZURE_RETRY_MAX_WAIT_SECONDS` | `30` | Cap on the backoff wait time. No single retry will wait longer than 30 seconds. |

The retry logic is implemented via `tenacity` and only triggers on `requests.RequestException` and `requests.Timeout` — not on HTTP 4xx errors (which indicate auth or permission issues, not transient failures).

### Dataset Limits

| Constant | Value | Description |
|---|---|---|
| `MAX_DATASET_ROWS` | `10,000` | Maximum number of rows accepted in an uploaded dataset. Datasets exceeding this limit are rejected with an error message. |

### SKU Caching

| Constant | Value | Description |
|---|---|---|
| `SKU_CACHE_TTL_SECONDS` | `3600` | Default cache duration (1 hour). The SKU catalog is fetched once per session and reused until the TTL expires. Clicking "Run Analysis" again within the TTL uses cached data. |

### Alternatives

| Constant | Value | Description |
|---|---|---|
| `MAX_ALTERNATIVES` | `5` | Default number of alternative SKUs returned per flagged machine. |

### Regions

| Constant | Count | Description |
|---|---|---|
| `DEFAULT_REGIONS` | 31 | The list of Azure regions shown in the "Region override" dropdown. |
| `REGION_DISPLAY_NAMES` | 31 | Mapping from region IDs (e.g. `uksouth`) to display names (e.g. `UK South`). |

**Supported regions in the dropdown:**

| Region ID | Display Name |
|---|---|
| `eastus` | East US |
| `eastus2` | East US 2 |
| `westus` | West US |
| `westus2` | West US 2 |
| `westus3` | West US 3 |
| `centralus` | Central US |
| `southcentralus` | South Central US |
| `northcentralus` | North Central US |
| `westcentralus` | West Central US |
| `uksouth` | UK South |
| `ukwest` | UK West |
| `northeurope` | North Europe |
| `westeurope` | West Europe |
| `francecentral` | France Central |
| `germanywestcentral` | Germany West Central |
| `switzerlandnorth` | Switzerland North |
| `norwayeast` | Norway East |
| `swedencentral` | Sweden Central |
| `southeastasia` | Southeast Asia |
| `eastasia` | East Asia |
| `australiaeast` | Australia East |
| `australiasoutheast` | Australia Southeast |
| `japaneast` | Japan East |
| `japanwest` | Japan West |
| `canadacentral` | Canada Central |
| `canadaeast` | Canada East |
| `brazilsouth` | Brazil South |
| `koreacentral` | Korea Central |
| `centralindia` | Central India |
| `southafricanorth` | South Africa North |
| `uaenorth` | UAE North |

> To add a region: add it to both `DEFAULT_REGIONS` and `REGION_DISPLAY_NAMES` in `app/config.py`, and optionally to the `display_region` property in `models/machine.py`.

---

## Alternative Scoring Weights

Defined in `engine/alternatives.py`. Modify these to change how alternatives are ranked:

| Weight Constant | Default | Max Points | Description |
|---|---|---|---|
| `WEIGHT_FAMILY` | `40.0` | 40 | Importance of matching the same VM family prefix (e.g. D, E, F). |
| `WEIGHT_VCPU` | `25.0` | 25 | Importance of matching the vCPU count. |
| `WEIGHT_MEMORY` | `20.0` | 20 | Importance of matching memory (GB). |
| `WEIGHT_GENERATION` | `10.0` | 10 | Importance of matching the hardware generation (v3, v4, v5). |
| `WEIGHT_SIZE_TIER` | `5.0` | 5 | Importance of matching the size number (cost approximation). |

**Total maximum score: 100 points.**

Scoring rules:
- **Exact match** on any factor = full points for that factor
- **Proportional match** (e.g. 4 vCPUs vs 8 vCPUs) = partial points based on the ratio
- **Family partial match** (same first letter, e.g. D vs Ds) = 60% of family points
- **Generation ±1** = 50% of generation points

---

## Azure API Details

### Endpoint

```
GET https://management.azure.com/subscriptions/{subscriptionId}/providers/Microsoft.Compute/skus?api-version=2023-07-01&$filter=resourceType eq 'virtualMachines'
```

### Authentication

Bearer token via `DefaultAzureCredential`, `ClientSecretCredential`, `DeviceCodeCredential`, or `InteractiveBrowserCredential` — depending on the selected method.

### Required RBAC Role

**Reader** on the subscription (minimum). The API only reads SKU metadata; it does not create or modify any resources.

### Pagination

The API returns results in pages. The tool follows the `nextLink` field automatically until all pages are consumed.

### Rate Limits

Azure ARM APIs are subject to throttling. The built-in retry logic (exponential backoff, configurable max retries) handles transient 429 responses.
