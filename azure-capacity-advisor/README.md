# Azure Capacity Advisor

A production-quality tool for cloud architects that validates Azure VM SKU availability before deployment. It analyses rightsizing datasets against the live Azure Resource Manager API to detect capacity risks, restrictions, and zone limitations — then recommends the best alternative SKUs.

Built for migration planning, rightsizing validation, and FinOps workflows.

---

## Table of Contents

- [Problem](#problem)
- [Features](#features)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Authentication](#authentication)
- [Running the Tool](#running-the-tool)
- [Usage Guide](#usage-guide)
- [Dataset Format](#dataset-format)
- [Status Definitions](#status-definitions)
- [Alternative SKU Engine](#alternative-sku-engine)
- [Configuration Reference](#configuration-reference)
- [Architecture](#architecture)
- [Extending the Tool](#extending-the-tool)
- [Troubleshooting](#troubleshooting)

---

## Problem

When planning Azure migrations or rightsizing exercises, engineers receive a list of recommended VM SKUs. However:

- Some SKUs **cannot be allocated** in specific regions
- Some SKUs are **restricted or deprecated**
- **Capacity shortages** cause deployments to fail silently at provisioning time
- Zone-level restrictions limit high-availability configurations

This tool validates those SKUs **before deployment**, saving hours of failed provisioning attempts and giving architects confidence in their migration plans.

---

## Features

- **Multi-format input** — CSV and JSON datasets with automatic column name normalization (65 recognized column name variants)
- **Real Azure API** — queries the live ARM Compute SKU endpoint; no mocked data
- **Multiple auth methods** — Azure CLI, Service Principal, Device Code, Interactive Browser, and Managed Identity
- **Risk detection** — classifies each SKU as OK, RISK, BLOCKED, or UNKNOWN with detailed reasons
- **Alternative recommendations** — weighted scoring engine returns the top 5 replacement SKUs ranked by family, vCPU, memory, generation, and size tier
- **Interactive Streamlit GUI** — file upload, progress indicators, sortable/filterable table, search, and CSV export
- **Region comparison** — side-by-side status breakdown across regions
- **Summary dashboard** — bar charts for status distribution and top requested SKUs
- **In-memory SKU caching** — fetches the full Azure catalog once, caches with configurable TTL
- **Retry logic** — exponential backoff on Azure API failures via `tenacity`
- **Scales to 10,000 rows** — all analysis runs locally after the initial API call

---

## Project Structure

```
azure-capacity-advisor/
├── app/
│   ├── __init__.py
│   ├── app.py                 # Streamlit GUI entry point
│   └── config.py              # Centralized configuration and env var handling
├── azure_client/
│   ├── __init__.py
│   ├── auth.py                # Multi-method Azure authentication
│   └── sku_service.py         # ARM API client with pagination, caching, retry
├── engine/
│   ├── __init__.py
│   ├── analyzer.py            # Capacity/risk analysis engine
│   └── alternatives.py        # Alternative SKU recommendation engine
├── models/
│   ├── __init__.py
│   ├── machine.py             # Input machine dataclass
│   └── result.py              # AnalysisResult, SkuStatus enum, AnalysisSummary
├── parsers/
│   ├── __init__.py
│   └── dataset_parser.py      # CSV/JSON parser with column normalization
├── data/
│   ├── example_dataset.csv    # 25-machine example (CSV)
│   └── example_dataset.json   # 5-machine example (JSON)
├── requirements.txt
├── CONFIGURATION.md           # Detailed configuration reference
├── ARCHITECTURE.md            # Architecture and extension guide
└── README.md
```

---

## Prerequisites

- **Python 3.11+**
- **An Azure subscription** with at least **Reader** role
- **One of** the following for authentication:
  - Azure CLI installed (`az login`)
  - A service principal with `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`
  - A managed identity (when running on Azure)
  - A browser for Device Code or Interactive Browser login

---

## Installation

```bash
cd azure-capacity-advisor
pip install -r requirements.txt
```

Dependencies installed:

| Package | Purpose |
|---|---|
| `streamlit` | Web GUI framework |
| `pandas` | DataFrame processing for datasets and results |
| `azure-identity` | Azure authentication (DefaultAzureCredential, etc.) |
| `requests` | HTTP client for the ARM API |
| `tenacity` | Retry logic with exponential backoff |

---

## Authentication

The tool supports four authentication methods, selectable from the sidebar.

### 1. Default (Recommended)

Uses `DefaultAzureCredential`, which automatically tries:

1. Environment variables (`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET`)
2. Managed Identity (on Azure VMs, App Service, Functions, etc.)
3. Azure CLI (`az login`)
4. Azure PowerShell

```bash
# Simplest: log in via CLI
az login

# Set your subscription
export AZURE_SUBSCRIPTION_ID="00000000-0000-0000-0000-000000000000"
```

### 2. Service Principal

Enter credentials directly in the sidebar — useful for CI/CD pipelines or shared environments.

**Required fields:**
- Tenant ID (Directory ID)
- Client ID (Application ID)
- Client Secret

Or set via environment variables:

```bash
export AZURE_TENANT_ID="your-tenant-id"
export AZURE_CLIENT_ID="your-client-id"
export AZURE_CLIENT_SECRET="your-client-secret"
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
```

### 3. Device Code (Browser Login)

For environments where the browser isn't on the same machine:

1. Select "Device Code (Browser Login)" in the sidebar
2. Click **Test Connection**
3. A code and URL will appear in the terminal
4. Open the URL in any browser, enter the code, and authenticate

### 4. Interactive Browser

Opens a browser window on the local machine for OAuth login. Useful for desktop use.

### Testing Your Connection

Click the **Test Connection** button in the sidebar before running analysis. It will attempt to obtain an Azure access token and confirm authentication is working.

Click **Reset Auth** to clear cached credentials and switch to a different method or account.

---

## Running the Tool

```bash
cd azure-capacity-advisor
streamlit run app/app.py
```

The app opens at `http://localhost:8501` by default.

### With environment variables pre-set:

```bash
AZURE_SUBSCRIPTION_ID="your-sub-id" streamlit run app/app.py
```

---

## Usage Guide

### Step 1: Configure Authentication

In the sidebar:
1. Select your authentication method
2. Enter your Subscription ID (or set `AZURE_SUBSCRIPTION_ID`)
3. Fill in any additional credentials for your chosen method
4. Click **Test Connection** to verify

### Step 2: Upload Dataset

Click the file uploader and select a `.csv` or `.json` file containing your rightsizing data.

The tool previews the first 50 rows so you can verify the data was parsed correctly.

### Step 3: Run Analysis

1. Optionally select a **Region override** to evaluate all machines against a single region (useful for comparing migration targets)
2. Click **Run Analysis**
3. The tool:
   - Authenticates with Azure
   - Fetches the full VM SKU catalog (cached for 1 hour)
   - Evaluates each machine's SKU against its target region
   - Computes alternatives for any flagged SKUs

### Step 4: Review Results

The results table shows:

| Column | Description |
|---|---|
| Machine | Machine name from the dataset |
| Region | Target Azure region (display name) |
| Requested SKU | The recommended SKU from the dataset |
| Status | OK / RISK / BLOCKED / UNKNOWN |
| Reason | Human-readable explanation |
| Alternatives | Up to 5 replacement SKUs, ranked by relevance |
| vCPU | vCPU count from the dataset |
| Memory (GB) | Memory from the dataset |
| VM Family | VM family from the dataset |

**Filtering options:**
- **Status filter** — select which statuses to display
- **Search** — free-text search across all columns
- **VM family filter** — filter by specific VM families

**Additional views:**
- **Region Comparison** — expandable panel showing status counts per region
- **Summary Dashboard** — bar charts for status distribution and top requested SKUs

### Step 5: Export

Click **Download results as CSV** to export the currently filtered view.

---

## Dataset Format

### Required Columns

The parser needs at minimum three columns (names are flexible):

| Canonical Name | Description | Recognized Variants |
|---|---|---|
| `name` | Machine/server name | `MachineName`, `Machine Name`, `machine_name`, `hostname`, `Host Name`, `vm_name`, `VMName`, `server`, `ServerName`, `Server Name` |
| `region` | Target Azure region | `Region`, `location`, `azure_region`, `AzureRegion`, `target_region`, `TargetRegion` |
| `recommended_sku` | VM SKU to validate | `RecommendedSKU`, `Recommended SKU`, `recommended_sku`, `sku`, `SKU`, `vm_sku`, `VMSize`, `vm_size`, `target_sku` |

### Optional Columns

| Canonical Name | Description | Recognized Variants |
|---|---|---|
| `vcpu` | vCPU count | `vCPU`, `vCPUs`, `cpu`, `cores`, `core_count`, `num_cpus` |
| `memory_gb` | Memory in GB | `MemoryGB`, `Memory GB`, `memory`, `ram`, `RAM`, `RamGB`, `memory_size_gb` |
| `vm_family` | VM family/series | `VMFamily`, `VM Family`, `family`, `sku_family`, `series`, `vm_series` |

Any unrecognized columns are preserved as extra metadata.

### CSV Example

```csv
MachineName,Region,RecommendedSKU,vCPU,MemoryGB,VMFamily
APP-SQL-01,uksouth,Standard_D4s_v5,4,16,Dsv5
WEB-01,uksouth,Standard_B2ms,2,8,B
DB-PRIMARY,uksouth,Standard_E8s_v5,8,64,Esv5
```

### JSON Example

The parser accepts a JSON array or an object with a top-level key containing an array:

```json
{
  "machines": [
    {
      "MachineName": "APP-SQL-01",
      "Region": "uksouth",
      "RecommendedSKU": "Standard_D4s_v5",
      "vCPU": 4,
      "MemoryGB": 16,
      "VMFamily": "Dsv5"
    }
  ]
}
```

Or as a flat array:

```json
[
  {
    "hostname": "APP-SQL-01",
    "location": "uksouth",
    "sku": "Standard_D4s_v5"
  }
]
```

### Example Datasets

Two example datasets are included in the `data/` directory:

- `data/example_dataset.csv` — 25 machines across `uksouth` and `westeurope`, including general-purpose, memory-optimized, compute-optimized, GPU, HPC, and SAP SKUs
- `data/example_dataset.json` — 5 machines demonstrating the JSON format

---

## Status Definitions

The analyzer evaluates each machine's SKU through a series of checks, in order:

| Status | Condition | What It Means |
|---|---|---|
| **UNKNOWN** | SKU name not found in Azure catalog | The SKU may be misspelled, deprecated, or not a valid Azure VM size |
| **BLOCKED** | SKU not listed in the target region | The SKU exists in Azure but is not offered in this region |
| **BLOCKED** | SKU has a location-level restriction | Azure has explicitly restricted this SKU in this region (e.g. `NotAvailableForSubscription`) |
| **RISK** | SKU has zone-level restrictions | The SKU is available but not in all availability zones — may affect HA deployments |
| **OK** | SKU passes all checks | The SKU is available and unrestricted in the target region |

The evaluation order matters — the first failing check determines the status.

---

## Alternative SKU Engine

When a SKU is flagged as RISK, BLOCKED, or UNKNOWN, the engine searches for the best replacements from the SKUs available (and unrestricted) in the same region.

### Scoring Weights

Each candidate is scored on a 100-point scale:

| Factor | Weight | Logic |
|---|---|---|
| **VM Family** | 40 pts | Exact family prefix match = 40; same base letter (e.g. D vs Ds) = 24; different family = 0 |
| **vCPU Count** | 25 pts | Exact match = 25; proportional score based on ratio (e.g. 4 vs 8 = 12.5) |
| **Memory** | 20 pts | Exact match = 20; proportional score based on ratio |
| **Generation** | 10 pts | Same generation = 10; one generation apart = 5; further = 0 |
| **Size Tier** | 5 pts | Exact numeric size match = 5; proportional score based on ratio |

### Example

For `Standard_D4s_v5` (4 vCPU, 16 GB, D-family, gen 5):

| Alternative | Family (40) | vCPU (25) | Memory (20) | Gen (10) | Size (5) | Total |
|---|---|---|---|---|---|---|
| `Standard_D4as_v5` | 24 (D vs Da) | 25 | 20 | 10 | 5 | **84** |
| `Standard_D4s_v4` | 40 | 25 | 20 | 5 | 5 | **95** |
| `Standard_E4s_v5` | 0 | 25 | 10 | 10 | 5 | **50** |
| `Standard_D8s_v5` | 40 | 12.5 | 10 | 10 | 2.5 | **75** |

The top 5 candidates (configurable) are returned, sorted by score descending.

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `AZURE_SUBSCRIPTION_ID` | (none) | Azure subscription ID — required |
| `AZURE_CLIENT_ID` | (none) | Service principal client/application ID |
| `AZURE_TENANT_ID` | (none) | Azure AD tenant/directory ID |
| `AZURE_CLIENT_SECRET` | (none) | Service principal client secret |
| `SKU_CACHE_TTL` | `3600` | SKU cache time-to-live in seconds |
| `MAX_ALTERNATIVES` | `5` | Maximum number of alternative SKUs to recommend |
| `AZURE_MAX_RETRIES` | `3` | Maximum retry attempts for Azure API calls |

### Application Constants (in `app/config.py`)

| Constant | Value | Description |
|---|---|---|
| `AZURE_COMPUTE_SKU_API_VERSION` | `2023-07-01` | ARM API version for the Compute SKU endpoint |
| `SKU_CACHE_TTL_SECONDS` | `3600` | Default cache TTL (1 hour) |
| `MAX_DATASET_ROWS` | `10,000` | Maximum rows accepted in a dataset |
| `AZURE_MAX_RETRIES` | `3` | Retry attempts per API page request |
| `AZURE_RETRY_WAIT_SECONDS` | `2` | Initial backoff multiplier for retries |
| `AZURE_RETRY_MAX_WAIT_SECONDS` | `30` | Maximum wait between retries |
| `DEFAULT_REGIONS` | 31 regions | Regions shown in the UI dropdown |

See [CONFIGURATION.md](CONFIGURATION.md) for the complete reference.

---

## Architecture

### Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  CSV / JSON │────▶│ DatasetParser │────▶│ List[Machine] │
│   Upload    │     │ (normalize)  │     │               │
└─────────────┘     └──────────────┘     └───────┬───────┘
                                                 │
                    ┌──────────────┐              │
                    │  Azure ARM   │              │
                    │  SKU API     │              │
                    └──────┬───────┘              │
                           │                     │
                    ┌──────▼───────┐              │
                    │  SkuService  │              │
                    │  (cache)     │              │
                    └──────┬───────┘              │
                           │                     │
                    ┌──────▼─────────────────────▼──┐
                    │         Analyzer               │
                    │  (evaluate each machine)       │
                    └──────┬────────────────────────┘
                           │
                    ┌──────▼───────┐
                    │ Alternative  │
                    │   Engine     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Results +   │
                    │  Summary     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Streamlit   │
                    │  GUI         │
                    └──────────────┘
```

### Module Responsibilities

| Module | Class / Function | Purpose |
|---|---|---|
| `parsers/dataset_parser.py` | `parse_csv()`, `parse_json()`, `parse_file()` | Reads files, normalizes columns, validates required fields, returns `Machine` objects |
| `azure_client/auth.py` | `get_credential()`, `get_access_token()`, `test_connection()` | Multi-method Azure authentication with credential caching |
| `azure_client/sku_service.py` | `SkuService` | Fetches SKU catalog from ARM API with pagination, retry, and in-memory caching |
| `azure_client/sku_service.py` | `SkuInfo` | Dataclass with properties for vCPU/memory extraction and restriction checking |
| `azure_client/sku_service.py` | `SkuCache` | TTL-based in-memory cache indexed by SKU name and region |
| `engine/analyzer.py` | `Analyzer` | Evaluates each machine's SKU: UNKNOWN → BLOCKED → RISK → OK |
| `engine/alternatives.py` | `AlternativeEngine` | Weighted scoring of candidate SKUs for replacements |
| `models/machine.py` | `Machine` | Input data model with region normalization |
| `models/result.py` | `AnalysisResult`, `SkuStatus`, `AnalysisSummary` | Output data models |
| `app/app.py` | `main()` | Streamlit UI: upload, auth sidebar, results table, filters, charts, export |
| `app/config.py` | `AppConfig`, constants | Centralized configuration with environment variable support |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the complete design guide.

---

## Extending the Tool

The modular design supports several extension paths:

### As a REST API

The engine modules (`Analyzer`, `AlternativeEngine`, `SkuService`) have no Streamlit dependency. Wrap them with FastAPI or Flask:

```python
from azure_client.sku_service import SkuService
from engine.alternatives import AlternativeEngine
from engine.analyzer import Analyzer

sku_service = SkuService(subscription_id="...")
sku_service.fetch_skus()
alt_engine = AlternativeEngine(sku_service=sku_service)
analyzer = Analyzer(sku_service=sku_service, alternative_engine=alt_engine)
results = analyzer.analyze(machines)
```

### As a CLI Tool

Parse files directly and output results:

```python
from parsers.dataset_parser import parse_csv
machines = parse_csv("input.csv")
# ... run analysis ...
```

### Custom Scoring Weights

Modify the weights in `engine/alternatives.py`:

```python
WEIGHT_FAMILY = 40.0      # VM family match importance
WEIGHT_VCPU = 25.0        # vCPU match importance
WEIGHT_MEMORY = 20.0      # Memory match importance
WEIGHT_GENERATION = 10.0  # Generation match importance
WEIGHT_SIZE_TIER = 5.0    # Size tier / cost proximity
```

### Adding New Auth Methods

Add a new member to `AuthMethod` in `azure_client/auth.py` and add the corresponding branch in `get_credential()`.

---

## Troubleshooting

### "Failed to initialize Azure credentials"

**Cause:** No valid authentication method found.

**Fix:** Ensure one of:
- `az login` has been run
- Service principal env vars are set
- You've selected the correct auth method in the sidebar

### "Azure subscription ID is required"

**Cause:** The subscription ID wasn't provided.

**Fix:** Set `AZURE_SUBSCRIPTION_ID` or enter it in the sidebar.

### "Azure API returned HTTP 403"

**Cause:** Your account doesn't have permission to list SKUs.

**Fix:** Ensure your account/SP has at least **Reader** role on the subscription.

### "Azure API returned HTTP 401"

**Cause:** The access token has expired or is invalid.

**Fix:** Click **Reset Auth** in the sidebar and re-authenticate.

### "Dataset is missing required columns"

**Cause:** The parser couldn't map your column names to the required fields.

**Fix:** Ensure your file has columns that match one of the [recognized variants](#required-columns). The error message lists which canonical columns are missing and what columns were found.

### Slow first run

**Expected:** The initial SKU fetch retrieves the entire Azure VM catalog (1000+ SKUs across all regions). This is paginated and may take 10-30 seconds. Subsequent runs within the cache TTL (default: 1 hour) are instant.

### "Unsupported file format"

**Fix:** The tool only accepts `.csv` and `.json` files. Rename or convert your file.
