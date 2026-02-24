# Azure Capacity Advisor

Validates Azure VM SKU availability for migrations and rightsizing exercises. Upload a dataset of recommended VM SKUs, and the tool checks each one against the Azure Resource Manager API to detect availability issues, restrictions, and zone limitations — then recommends alternatives.

## Features

- **CSV and JSON** dataset support with flexible column name normalization
- **Real Azure API** integration via `DefaultAzureCredential`
- **Risk detection**: OK, RISK, BLOCKED, UNKNOWN status for each machine
- **Alternative SKU recommendations** ranked by family, vCPU, memory, generation
- **Interactive Streamlit GUI** with filtering, search, and export
- **Region comparison** and summary dashboard
- **Local SKU caching** for performance

## Project Structure

```
azure-capacity-advisor/
├── app/
│   ├── app.py              # Streamlit GUI entry point
│   └── config.py           # Application configuration
├── azure_client/
│   ├── auth.py             # Azure authentication (DefaultAzureCredential)
│   └── sku_service.py      # SKU fetching, caching, and querying
├── engine/
│   ├── analyzer.py         # Capacity/risk analysis engine
│   └── alternatives.py     # Alternative SKU recommendation engine
├── models/
│   ├── machine.py          # Machine data model
│   └── result.py           # Analysis result and summary models
├── parsers/
│   └── dataset_parser.py   # CSV/JSON parser with column normalization
├── data/
│   ├── example_dataset.csv # Example CSV dataset
│   └── example_dataset.json# Example JSON dataset
├── requirements.txt
└── README.md
```

## Prerequisites

- Python 3.11+
- An Azure subscription
- Azure CLI installed and authenticated (`az login`), or a managed identity / service principal configured

## Setup

```bash
cd azure-capacity-advisor
pip install -r requirements.txt
```

## Authentication

The tool uses `DefaultAzureCredential` which tries these methods in order:

1. **Environment variables** — set `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`
2. **Managed identity** — if running on an Azure resource
3. **Azure CLI** — run `az login` before starting the tool

Set your subscription ID:

```bash
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
```

Or enter it in the sidebar when the app starts.

## Running

```bash
streamlit run app/app.py
```

## Usage

1. Open the Streamlit app in your browser
2. Enter your Azure Subscription ID in the sidebar (or set via env var)
3. Optionally select a region override
4. Upload a CSV or JSON dataset
5. Click **Run Analysis**
6. Review results in the interactive table
7. Use filters, search, and the summary dashboard
8. Download results as CSV

## Dataset Format

### CSV

```csv
MachineName,Region,RecommendedSKU,vCPU,MemoryGB,VMFamily
APP-SQL-01,uksouth,Standard_D4s_v5,4,16,Dsv5
WEB-01,uksouth,Standard_B2ms,2,8,B
```

### JSON

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

Column names are flexible — the parser normalizes common variations (e.g. `Machine Name`, `machine_name`, `hostname`, `VM SKU`, `sku`, etc.).

## Status Definitions

| Status    | Meaning                                              |
|-----------|------------------------------------------------------|
| OK        | SKU is available and unrestricted in the region      |
| RISK      | SKU has zone-level restrictions                      |
| BLOCKED   | SKU is not available or restricted in the region     |
| UNKNOWN   | SKU not found in the Azure catalog                   |
