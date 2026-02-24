# Architecture Guide

Technical design documentation for Azure Capacity Advisor. Covers the module structure, data flow, key design decisions, and guidance for extending or integrating the tool.

---

## Design Principles

1. **Clean separation of concerns** — each module has a single responsibility and no cross-layer imports
2. **GUI-independent engine** — the `engine/`, `azure_client/`, `parsers/`, and `models/` packages have zero Streamlit dependency
3. **Real API only** — no mocked responses; the tool queries the live Azure ARM endpoint
4. **Type safety** — full type hints on all function signatures and data classes
5. **Graceful failure** — custom exception types (`AzureAuthError`, `SkuServiceError`, `DatasetParseError`) with human-readable messages

---

## Module Dependency Graph

```
app/app.py (Streamlit GUI)
    ├── app/config.py
    ├── azure_client/auth.py
    ├── azure_client/sku_service.py
    │       └── azure_client/auth.py
    │       └── app/config.py
    ├── engine/analyzer.py
    │       ├── azure_client/sku_service.py
    │       ├── engine/alternatives.py
    │       │       ├── azure_client/sku_service.py
    │       │       └── app/config.py
    │       └── models/result.py
    ├── models/machine.py
    ├── models/result.py
    └── parsers/dataset_parser.py
            └── models/machine.py
```

Key constraint: **no circular imports**. The dependency direction is always:

```
app → engine → azure_client → (external: azure.identity, requests)
app → parsers → models
engine → models
```

---

## Data Flow (Detailed)

### 1. File Upload and Parsing

```
User uploads file (.csv or .json)
    │
    ▼
parse_file(BytesIO, filename)
    │
    ├── Detect format from extension
    ├── Read into pandas DataFrame
    ├── _normalize_columns(): map 65+ column name variants → 6 canonical names
    ├── _validate_required(): ensure name, region, recommended_sku exist
    └── _to_machines(): convert rows → list[Machine]
```

**Column normalization** is the core of format flexibility. The `CANONICAL_COLUMNS` dict maps every recognized variation (lowered, stripped, de-hyphenated) to one of six canonical field names. Unrecognized columns are preserved in the `Machine.extra` dict.

### 2. Azure Authentication

```
User selects auth method in sidebar
    │
    ▼
get_credential(method, tenant_id, client_id, client_secret)
    │
    ├── DEFAULT:           DefaultAzureCredential()
    ├── SERVICE_PRINCIPAL:  ClientSecretCredential(tenant, client, secret)
    ├── DEVICE_CODE:        DeviceCodeCredential(tenant?)
    └── INTERACTIVE_BROWSER: InteractiveBrowserCredential(tenant?)
    │
    ▼
Credential is cached in module-level _credential
    │
    ▼
get_access_token() → calls credential.get_token(scope)
```

The credential is cached at module level (`_credential`) so it persists across Streamlit reruns within the same server process. `reset_credential()` clears it for account switching.

### 3. SKU Catalog Fetch

```
SkuService.fetch_skus()
    │
    ├── Check SkuCache.is_valid → return cached data if TTL hasn't expired
    │
    ├── get_access_token() → Bearer token
    │
    ├── Loop: GET /subscriptions/{id}/providers/Microsoft.Compute/skus
    │   ├── _fetch_page() with @retry decorator (tenacity)
    │   ├── Parse each item via _parse_sku() → SkuInfo
    │   ├── Filter: only resourceType == "virtualMachines"
    │   └── Follow nextLink for pagination
    │
    └── SkuCache.store(all_skus)
            ├── Index by name (case-insensitive)
            └── Index by region (for fast per-region lookups)
```

**Cache design:** The `SkuCache` maintains two indexes:
- `_data: dict[str, SkuInfo]` — name → SkuInfo (for single lookups)
- `_region_index: dict[str, list[str]]` — region → list of SKU names (for alternative search)

This avoids repeated linear scans when evaluating thousands of machines.

### 4. Analysis Engine

```
Analyzer.analyze(machines)
    │
    ▼
For each machine:
    Analyzer._evaluate(machine, region)
        │
        ├── SkuService.get_sku_info(sku_name) → SkuInfo or None
        │
        ├── Check 1: sku_info is None → UNKNOWN
        ├── Check 2: not sku_info.is_available_in_region(region) → BLOCKED
        ├── Check 3: sku_info.is_restricted_in_region(region) → BLOCKED
        ├── Check 4: sku_info.is_zone_limited_in_region(region) → RISK
        └── All checks pass → OK
        │
        ├── If not OK: AlternativeEngine.find_alternatives(...)
        └── Return AnalysisResult
```

The evaluation is **sequential and deterministic** — the first failing check determines the status. This means a SKU that is both "not in region" and "restricted" will report as BLOCKED for the "not in region" reason.

### 5. Alternative Scoring

```
AlternativeEngine.find_alternatives(sku_name, region, vcpu, memory_gb, vm_family)
    │
    ├── Get all SKUs in region from cache
    ├── Filter out: original SKU, restricted SKUs
    │
    ├── Extract reference values from SKU name:
    │   ├── _extract_generation("Standard_D4s_v5") → 5
    │   ├── _extract_family_prefix("Standard_D4s_v5") → "d"
    │   └── _extract_size_number("Standard_D4s_v5") → 4
    │
    ├── Score each candidate:
    │   ├── Family match (40 pts)
    │   ├── vCPU match (25 pts)
    │   ├── Memory match (20 pts)
    │   ├── Generation match (10 pts)
    │   └── Size tier match (5 pts)
    │
    ├── Sort by score descending
    └── Return top N names
```

The SKU name parsing uses regex patterns to extract structured data from the naming convention `Standard_{Family}{Size}{Suffix}_v{Generation}`.

### 6. GUI Rendering

```
Streamlit main()
    │
    ├── Sidebar: auth method selector, credential inputs, test/reset buttons
    ├── File uploader → parse → preview
    ├── Run Analysis button → SkuService + Analyzer pipeline
    ├── Results stored in st.session_state
    │
    ├── Summary metrics (4 columns: Total, OK, Risk, Blocked)
    ├── Filter bar (status multiselect, search, VM family)
    ├── Styled dataframe with row-level color coding
    ├── Region Comparison expander
    ├── Summary Dashboard expander (bar charts)
    └── CSV download button
```

All analysis results are stored in `st.session_state` so they persist across Streamlit reruns (e.g. when the user changes a filter).

---

## Data Models

### Machine (Input)

```python
@dataclass
class Machine:
    name: str                          # Machine/host name
    region: str                        # Azure region (normalized: lowercase, no spaces)
    recommended_sku: str               # VM SKU to validate
    vcpu: Optional[int]                # vCPU count (from dataset)
    memory_gb: Optional[float]         # Memory in GB (from dataset)
    vm_family: Optional[str]           # VM family/series (from dataset)
    extra: dict[str, str]              # Any unrecognized columns
```

Region normalization happens in `__post_init__`: `"UK South"` → `"uksouth"`.

### SkuInfo (Azure Catalog)

```python
@dataclass
class SkuInfo:
    name: str                          # e.g. "Standard_D4s_v5"
    tier: str                          # e.g. "Standard"
    size: str                          # e.g. "D4s_v5"
    family: str                        # e.g. "standardDSv5Family"
    locations: list[str]               # Regions where SKU exists
    capabilities: dict[str, str]       # Key-value pairs (vCPUs, MemoryGB, etc.)
    restrictions: list[SkuRestriction] # Location/Zone restrictions
    zones: list[str]                   # Available zones in first location
```

Properties `vcpus` and `memory_gb` extract values from the `capabilities` dict. Restriction checking methods (`is_restricted_in_region`, `is_available_in_region`, `is_zone_limited_in_region`) encapsulate the Azure restriction model.

### AnalysisResult (Output)

```python
@dataclass
class AnalysisResult:
    machine_name: str
    region: str
    display_region: str
    requested_sku: str
    status: SkuStatus                  # OK | RISK | BLOCKED | UNKNOWN
    reason: str                        # Human-readable explanation
    alternatives: list[str]            # Up to 5 alternative SKU names
    vcpu: Optional[int]
    memory_gb: Optional[float]
    vm_family: Optional[str]
```

### AnalysisSummary

```python
@dataclass
class AnalysisSummary:
    total: int
    ok: int
    risk: int
    blocked: int
    unknown: int
```

Computed via `AnalysisSummary.from_results(results)`.

---

## Azure API Integration Details

### Endpoint

```
GET https://management.azure.com/subscriptions/{subscriptionId}
    /providers/Microsoft.Compute/skus
    ?api-version=2023-07-01
    &$filter=resourceType eq 'virtualMachines'
```

### Response Structure (per SKU)

```json
{
  "resourceType": "virtualMachines",
  "name": "Standard_D4s_v5",
  "tier": "Standard",
  "size": "D4s_v5",
  "family": "standardDSv5Family",
  "locations": ["eastus", "westus2", "uksouth", ...],
  "locationInfo": [
    {
      "location": "eastus",
      "zones": ["1", "2", "3"]
    }
  ],
  "capabilities": [
    {"name": "vCPUs", "value": "4"},
    {"name": "MemoryGB", "value": "16"},
    {"name": "vCPUsAvailable", "value": "4"},
    ...
  ],
  "restrictions": [
    {
      "type": "Location",
      "values": [],
      "restrictionInfo": {
        "locations": ["westus"]
      },
      "reasonCode": "NotAvailableForSubscription"
    },
    {
      "type": "Zone",
      "values": [],
      "restrictionInfo": {
        "locations": ["eastus"],
        "zones": ["2"]
      },
      "reasonCode": "NotAvailableForSubscription"
    }
  ]
}
```

### Restriction Types

| Type | Meaning | Status Assigned |
|---|---|---|
| `Location` | SKU is restricted in specific regions for this subscription | BLOCKED |
| `Zone` | SKU is restricted in specific availability zones within a region | RISK |

### Reason Codes

| Code | Meaning |
|---|---|
| `NotAvailableForSubscription` | SKU is not available for this specific subscription (quota/policy) |
| `QuotaId` | Subscription quota prevents use of this SKU |

---

## Error Handling Strategy

### Exception Hierarchy

```
Exception
├── DatasetParseError        # parsers/dataset_parser.py
│   ├── Missing required columns
│   ├── Invalid CSV/JSON format
│   └── Unsupported file extension
├── AzureAuthError           # azure_client/auth.py
│   ├── Missing credentials
│   ├── Invalid service principal
│   └── Token acquisition failure
└── SkuServiceError          # azure_client/sku_service.py
    ├── Missing subscription ID
    ├── HTTP errors (4xx, 5xx)
    └── Network errors
```

### Error Flow

1. **Parsers** raise `DatasetParseError` → displayed as `st.error()` in the UI
2. **Auth** raises `AzureAuthError` → displayed as `st.error()` with guidance
3. **SKU Service** raises `SkuServiceError` → displayed as `st.error()` with HTTP details
4. **Unexpected errors** are caught by a blanket `except Exception`, logged, and displayed

All errors are non-fatal to the Streamlit process — the user can fix the issue and retry.

---

## Integration Patterns

### As a REST API (FastAPI Example)

```python
from fastapi import FastAPI, UploadFile
from parsers.dataset_parser import parse_file
from azure_client.sku_service import SkuService
from engine.alternatives import AlternativeEngine
from engine.analyzer import Analyzer

app = FastAPI()
sku_service = SkuService(subscription_id="...")

@app.on_event("startup")
async def startup():
    sku_service.fetch_skus()

@app.post("/analyze")
async def analyze(file: UploadFile, region_override: str = None):
    machines = parse_file(file.file, file.filename)
    alt_engine = AlternativeEngine(sku_service=sku_service)
    analyzer = Analyzer(sku_service, alt_engine, region_override)
    results = analyzer.analyze(machines)
    return [{"machine": r.machine_name, "status": r.status.value, ...} for r in results]
```

### As a Python Library

```python
from parsers.dataset_parser import parse_csv
from azure_client.sku_service import SkuService
from engine.alternatives import AlternativeEngine
from engine.analyzer import Analyzer
from models.result import AnalysisSummary

# Parse
machines = parse_csv("data/example_dataset.csv")

# Fetch SKU catalog
sku_service = SkuService(subscription_id="...")
sku_service.fetch_skus()

# Analyse
alt_engine = AlternativeEngine(sku_service=sku_service)
analyzer = Analyzer(sku_service, alt_engine)
results = analyzer.analyze(machines)

# Summarise
summary = AnalysisSummary.from_results(results)
print(f"OK: {summary.ok}, Risk: {summary.risk}, Blocked: {summary.blocked}")

for r in results:
    if r.status != SkuStatus.OK:
        print(f"{r.machine_name}: {r.status} — {r.reason}")
        print(f"  Alternatives: {r.alternatives_display}")
```

### As a Migration Assessment Plugin

The `Analyzer` accepts any list of `Machine` objects. Build machines programmatically from any source:

```python
from models.machine import Machine

machines = [
    Machine(name="vm-01", region="uksouth", recommended_sku="Standard_D4s_v5"),
    Machine(name="vm-02", region="westeurope", recommended_sku="Standard_E8s_v5"),
]
```

### As a FinOps Validation Tool

The `SkuInfo` dataclass exposes the full capabilities dict from Azure. You can extend the analyzer to check additional properties:

```python
sku_info = sku_service.get_sku_info("Standard_D4s_v5")
print(sku_info.capabilities)
# {'vCPUs': '4', 'MemoryGB': '16', 'MaxDataDiskCount': '8', ...}
```

---

## Performance Characteristics

| Operation | Time | Notes |
|---|---|---|
| CSV parse (10K rows) | < 1s | pandas `read_csv` + normalization |
| JSON parse (10K rows) | < 1s | `json.load` + pandas conversion |
| Azure SKU fetch (first run) | 10-30s | Paginated API; depends on network |
| Azure SKU fetch (cached) | < 1ms | In-memory lookup |
| Analysis (10K machines) | < 2s | Local processing after cache |
| Alternative scoring (per machine) | < 10ms | Linear scan of region SKUs |

The bottleneck is the initial Azure API call. All subsequent processing is CPU-bound and runs locally.
