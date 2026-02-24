"""Azure Capacity Advisor — Streamlit GUI.

Provides a web interface for uploading rightsizing datasets, validating
VM SKU availability against Azure regions, and exporting the results.

Run with:
    streamlit run app/app.py
"""

from __future__ import annotations

import io
import logging
import sys
from pathlib import Path

import pandas as pd
import streamlit as st

# Add project root to path so modules can be imported cleanly
_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from app.config import (
    AppConfig,
    DEFAULT_REGIONS,
    MAX_DATASET_ROWS,
    REGION_DISPLAY_NAMES,
)
from azure_client.auth import AzureAuthError, AuthMethod, reset_credential, test_connection
from azure_client.sku_service import SkuService, SkuServiceError
from engine.alternatives import AlternativeEngine
from engine.analyzer import Analyzer
from models.result import AnalysisSummary, SkuStatus
from parsers.dataset_parser import DatasetParseError, parse_file

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Page configuration
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="Azure Capacity Advisor",
    page_icon="\u2601\ufe0f",
    layout="wide",
)


def _build_region_options() -> list[str]:
    """Build display labels for the region dropdown."""
    return [REGION_DISPLAY_NAMES.get(r, r) for r in DEFAULT_REGIONS]


def _display_label_to_region(label: str) -> str:
    """Convert a display label back to an Azure region id."""
    for region_id, display in REGION_DISPLAY_NAMES.items():
        if display == label:
            return region_id
    return label.lower().replace(" ", "")


def _status_badge(status: SkuStatus) -> str:
    """Return a coloured status label for display."""
    colors = {
        SkuStatus.OK: "green",
        SkuStatus.RISK: "orange",
        SkuStatus.BLOCKED: "red",
        SkuStatus.UNKNOWN: "gray",
    }
    color = colors.get(status, "gray")
    return f":{color}[**{status.value}**]"


def _results_to_dataframe(results: list) -> pd.DataFrame:
    """Convert analysis results to a Pandas DataFrame for display and export."""
    rows = []
    for r in results:
        rows.append(
            {
                "Machine": r.machine_name,
                "Region": r.display_region,
                "Requested SKU": r.requested_sku,
                "Status": r.status.value,
                "Reason": r.reason,
                "Alternatives": r.alternatives_display,
                "vCPU": r.vcpu if r.vcpu else "",
                "Memory (GB)": r.memory_gb if r.memory_gb else "",
                "VM Family": r.vm_family if r.vm_family else "",
            }
        )
    return pd.DataFrame(rows)


def _render_summary(summary: AnalysisSummary) -> None:
    """Render the summary metrics panel."""
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Machines", summary.total)
    col2.metric("OK", summary.ok)
    col3.metric("Risk", summary.risk)
    col4.metric("Blocked", summary.blocked + summary.unknown)


def _highlight_status(row: pd.Series) -> list[str]:
    """Apply row-level styling based on status."""
    status = row.get("Status", "")
    if status == "OK":
        return ["background-color: #d4edda"] * len(row)
    elif status == "RISK":
        return ["background-color: #fff3cd"] * len(row)
    elif status == "BLOCKED":
        return ["background-color: #f8d7da"] * len(row)
    elif status == "UNKNOWN":
        return ["background-color: #e2e3e5"] * len(row)
    return [""] * len(row)


# ---------------------------------------------------------------------------
# Main application
# ---------------------------------------------------------------------------
def main() -> None:
    """Entry point for the Streamlit application."""
    st.title("Azure Capacity Advisor")
    st.markdown(
        "Validate VM SKU availability for Azure migrations and rightsizing exercises. "
        "Upload your dataset, run the analysis, and export the results."
    )

    # --- Sidebar: Azure Login ---
    with st.sidebar:
        st.header("Azure Login")

        auth_method_label = st.selectbox(
            "Authentication method",
            options=[m.value for m in AuthMethod],
            index=0,
            help=(
                "**Default** — uses Azure CLI (`az login`), managed identity, "
                "or env vars automatically.\n\n"
                "**Service Principal** — enter client credentials directly.\n\n"
                "**Device Code** — log in via browser with a one-time code.\n\n"
                "**Interactive Browser** — opens a browser window to log in."
            ),
        )
        auth_method = AuthMethod(auth_method_label)

        subscription_id = st.text_input(
            "Subscription ID",
            value=AppConfig.from_env().subscription_id,
            type="password",
            help="Your Azure subscription ID. Can also be set via AZURE_SUBSCRIPTION_ID env var.",
        )

        # Conditional fields based on auth method
        tenant_id = ""
        client_id = ""
        client_secret = ""

        if auth_method == AuthMethod.SERVICE_PRINCIPAL:
            tenant_id = st.text_input(
                "Tenant ID",
                type="password",
                help="Azure AD tenant ID (Directory ID).",
            )
            client_id = st.text_input(
                "Client ID",
                type="password",
                help="App registration client ID (Application ID).",
            )
            client_secret = st.text_input(
                "Client Secret",
                type="password",
                help="App registration client secret.",
            )

        if auth_method in (AuthMethod.DEVICE_CODE, AuthMethod.INTERACTIVE_BROWSER):
            tenant_id = st.text_input(
                "Tenant ID (optional)",
                help="Azure AD tenant ID. Leave blank for multi-tenant.",
            )

        # Test connection button
        col_test, col_clear = st.columns(2)
        with col_test:
            if st.button("Test Connection", use_container_width=True):
                if not subscription_id:
                    st.error("Enter a Subscription ID first.")
                else:
                    try:
                        with st.spinner("Authenticating..."):
                            test_connection(
                                subscription_id=subscription_id,
                                method=auth_method,
                                tenant_id=tenant_id,
                                client_id=client_id,
                                client_secret=client_secret,
                            )
                        st.session_state["auth_verified"] = True
                        st.session_state["auth_method"] = auth_method
                        st.success("Connected!")
                    except AzureAuthError as exc:
                        st.session_state["auth_verified"] = False
                        st.error(f"Auth failed: {exc}")
        with col_clear:
            if st.button("Reset Auth", use_container_width=True):
                reset_credential()
                st.session_state.pop("auth_verified", None)
                st.session_state.pop("auth_method", None)
                st.info("Credentials cleared.")

        # Show auth status
        if st.session_state.get("auth_verified"):
            current = st.session_state.get("auth_method", auth_method)
            st.success(f"Authenticated via {current}")

        st.divider()
        st.header("Options")
        region_override_label = st.selectbox(
            "Region override (optional)",
            options=["(use dataset regions)"] + _build_region_options(),
            index=0,
            help="Override the region for all machines. Leave as default to use each row's region.",
        )
        region_override: str | None = None
        if region_override_label != "(use dataset regions)":
            region_override = _display_label_to_region(region_override_label)

        st.divider()
        st.caption("Azure Capacity Advisor v1.0")

    # --- File upload ---
    st.subheader("1. Upload Dataset")
    uploaded = st.file_uploader(
        "Upload a CSV or JSON rightsizing dataset",
        type=["csv", "json"],
        help="Expects columns: MachineName, Region, RecommendedSKU (and optionally vCPU, MemoryGB, VMFamily).",
    )

    if uploaded is None:
        st.info("Upload a file to get started.")
        return

    # Parse uploaded file
    try:
        raw_bytes = uploaded.read()
        machines = parse_file(io.BytesIO(raw_bytes), uploaded.name)
    except DatasetParseError as exc:
        st.error(f"Failed to parse dataset: {exc}")
        return

    if len(machines) > MAX_DATASET_ROWS:
        st.error(
            f"Dataset has {len(machines)} rows, which exceeds the maximum of {MAX_DATASET_ROWS}."
        )
        return

    st.success(f"Loaded **{len(machines)}** machines from `{uploaded.name}`.")

    # Preview
    with st.expander("Preview uploaded data", expanded=False):
        preview_rows = [
            {
                "Machine": m.name,
                "Region": m.display_region,
                "SKU": m.recommended_sku,
                "vCPU": m.vcpu or "",
                "Memory (GB)": m.memory_gb or "",
                "Family": m.vm_family or "",
            }
            for m in machines[:50]
        ]
        st.dataframe(pd.DataFrame(preview_rows), use_container_width=True)
        if len(machines) > 50:
            st.caption(f"Showing first 50 of {len(machines)} rows.")

    # --- Run analysis ---
    st.subheader("2. Run Analysis")

    if not subscription_id:
        st.warning(
            "Enter your Azure Subscription ID in the sidebar or set the "
            "`AZURE_SUBSCRIPTION_ID` environment variable."
        )
        return

    if st.button("Run Analysis", type="primary", use_container_width=True):
        try:
            with st.spinner("Authenticating with Azure..."):
                sku_service = SkuService(
                    subscription_id=subscription_id,
                    auth_method=auth_method,
                    tenant_id=tenant_id,
                    client_id=client_id,
                    client_secret=client_secret,
                )

            with st.spinner("Fetching Azure VM SKU catalog (this may take a moment on first run)..."):
                sku_service.fetch_skus()

            alt_engine = AlternativeEngine(sku_service=sku_service)
            analyzer = Analyzer(
                sku_service=sku_service,
                alternative_engine=alt_engine,
                region_override=region_override,
            )

            with st.spinner("Analyzing SKU availability..."):
                results = analyzer.analyze(machines)

            # Store results in session state
            st.session_state["results"] = results
            st.session_state["results_df"] = _results_to_dataframe(results)
            st.session_state["summary"] = AnalysisSummary.from_results(results)

        except AzureAuthError as exc:
            st.error(f"Azure authentication failed: {exc}")
            return
        except SkuServiceError as exc:
            st.error(f"Azure SKU service error: {exc}")
            return
        except Exception as exc:
            logger.exception("Unexpected error during analysis")
            st.error(f"An unexpected error occurred: {exc}")
            return

    # --- Display results ---
    if "results_df" not in st.session_state:
        return

    results_df: pd.DataFrame = st.session_state["results_df"]
    summary: AnalysisSummary = st.session_state["summary"]

    st.subheader("3. Results")

    # Summary panel
    _render_summary(summary)

    st.divider()

    # Filter controls
    filter_col1, filter_col2, filter_col3 = st.columns(3)
    with filter_col1:
        status_filter = st.multiselect(
            "Filter by status",
            options=["OK", "RISK", "BLOCKED", "UNKNOWN"],
            default=["OK", "RISK", "BLOCKED", "UNKNOWN"],
        )
    with filter_col2:
        search_term = st.text_input("Search machines", placeholder="Type to search...")
    with filter_col3:
        family_options = sorted(results_df["VM Family"].dropna().unique().tolist())
        family_options = [f for f in family_options if f]
        family_filter = st.multiselect(
            "Filter by VM family",
            options=family_options,
            default=[],
            help="Leave empty to show all families.",
        )

    # Apply filters
    filtered = results_df.copy()
    if status_filter:
        filtered = filtered[filtered["Status"].isin(status_filter)]
    if search_term:
        mask = filtered.apply(
            lambda row: search_term.lower() in row.astype(str).str.lower().str.cat(sep=" "),
            axis=1,
        )
        filtered = filtered[mask]
    if family_filter:
        filtered = filtered[filtered["VM Family"].isin(family_filter)]

    # Display table with styling
    styled = filtered.style.apply(_highlight_status, axis=1)
    st.dataframe(
        styled,
        use_container_width=True,
        height=min(400 + len(filtered) * 5, 800),
    )

    st.caption(f"Showing {len(filtered)} of {len(results_df)} results.")

    # --- Region comparison (extra feature) ---
    if len(filtered) > 0:
        with st.expander("Region Comparison", expanded=False):
            st.markdown("**Status breakdown by region:**")
            region_summary = (
                filtered.groupby(["Region", "Status"])
                .size()
                .unstack(fill_value=0)
                .reset_index()
            )
            st.dataframe(region_summary, use_container_width=True)

    # --- Summary dashboard (extra feature) ---
    with st.expander("Summary Dashboard", expanded=False):
        dash_col1, dash_col2 = st.columns(2)
        with dash_col1:
            st.markdown("**Status Distribution**")
            status_counts = filtered["Status"].value_counts()
            st.bar_chart(status_counts)
        with dash_col2:
            st.markdown("**Top Requested SKUs**")
            sku_counts = filtered["Requested SKU"].value_counts().head(10)
            st.bar_chart(sku_counts)

    # --- Export ---
    st.subheader("4. Export")
    csv_data = filtered.to_csv(index=False).encode("utf-8")
    st.download_button(
        label="Download results as CSV",
        data=csv_data,
        file_name="capacity_advisor_results.csv",
        mime="text/csv",
        use_container_width=True,
    )


if __name__ == "__main__":
    main()
