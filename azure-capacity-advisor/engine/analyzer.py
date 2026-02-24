"""Capacity and risk analyzer engine.

Evaluates each machine's recommended SKU against the Azure SKU catalog
to determine availability status in the target region.

Statuses:
    OK       - SKU is available and unrestricted.
    RISK     - SKU is available but has zone restrictions or is in a constrained family.
    BLOCKED  - SKU is not available or explicitly restricted in the region.
    UNKNOWN  - SKU was not found in the Azure catalog at all.
"""

from __future__ import annotations

import logging
from typing import Optional

from azure_client.sku_service import SkuInfo, SkuService
from engine.alternatives import AlternativeEngine
from models.machine import Machine
from models.result import AnalysisResult, SkuStatus

logger = logging.getLogger(__name__)


class Analyzer:
    """Evaluates SKU availability and risk for a list of machines."""

    def __init__(
        self,
        sku_service: SkuService,
        alternative_engine: AlternativeEngine,
        region_override: Optional[str] = None,
    ) -> None:
        """Initialize the analyzer.

        Args:
            sku_service: The Azure SKU service (must already have data fetched).
            alternative_engine: Engine for recommending alternative SKUs.
            region_override: If set, evaluate all machines against this region
                             instead of their individual region fields.
        """
        self._sku_service = sku_service
        self._alt_engine = alternative_engine
        self._region_override = region_override

    def analyze(self, machines: list[Machine]) -> list[AnalysisResult]:
        """Analyze a list of machines and return results.

        Args:
            machines: Parsed machine entries from the dataset.

        Returns:
            A list of AnalysisResult objects, one per machine.
        """
        results: list[AnalysisResult] = []
        for machine in machines:
            region = self._region_override or machine.region
            result = self._evaluate(machine, region)
            results.append(result)
        logger.info("Analyzed %d machines", len(results))
        return results

    def _evaluate(self, machine: Machine, region: str) -> AnalysisResult:
        """Evaluate a single machine's SKU against the region.

        Args:
            machine: The machine to evaluate.
            region: The target Azure region.

        Returns:
            An AnalysisResult with status, reason, and alternatives.
        """
        sku_name = machine.recommended_sku
        sku_info: Optional[SkuInfo] = self._sku_service.get_sku_info(sku_name)

        # Construct base result
        base = dict(
            machine_name=machine.name,
            region=region,
            display_region=machine.display_region,
            requested_sku=sku_name,
            vcpu=machine.vcpu,
            memory_gb=machine.memory_gb,
            vm_family=machine.vm_family,
        )

        # SKU not found in any region
        if sku_info is None:
            alternatives = self._alt_engine.find_alternatives(
                sku_name=sku_name,
                region=region,
                vcpu=machine.vcpu,
                memory_gb=machine.memory_gb,
                vm_family=machine.vm_family,
            )
            return AnalysisResult(
                **base,
                status=SkuStatus.UNKNOWN,
                reason=f"SKU '{sku_name}' not found in Azure catalog.",
                alternatives=alternatives,
            )

        # SKU exists but is not listed in the target region
        if not sku_info.is_available_in_region(region):
            alternatives = self._alt_engine.find_alternatives(
                sku_name=sku_name,
                region=region,
                vcpu=sku_info.vcpus or machine.vcpu,
                memory_gb=sku_info.memory_gb or machine.memory_gb,
                vm_family=machine.vm_family or sku_info.family,
            )
            return AnalysisResult(
                **base,
                status=SkuStatus.BLOCKED,
                reason=f"SKU '{sku_name}' is not available in region '{region}'.",
                alternatives=alternatives,
            )

        # SKU is in the region but has a location-level restriction
        if sku_info.is_restricted_in_region(region):
            reason_codes = [
                r.reason_code
                for r in sku_info.restrictions
                if r.type == "Location"
                and region.lower() in [v.lower() for v in r.values]
            ]
            reason_str = ", ".join(reason_codes) if reason_codes else "restricted"
            alternatives = self._alt_engine.find_alternatives(
                sku_name=sku_name,
                region=region,
                vcpu=sku_info.vcpus or machine.vcpu,
                memory_gb=sku_info.memory_gb or machine.memory_gb,
                vm_family=machine.vm_family or sku_info.family,
            )
            return AnalysisResult(
                **base,
                status=SkuStatus.BLOCKED,
                reason=f"SKU '{sku_name}' is restricted in '{region}' ({reason_str}).",
                alternatives=alternatives,
            )

        # SKU is available but has zone-level restrictions
        if sku_info.is_zone_limited_in_region(region):
            alternatives = self._alt_engine.find_alternatives(
                sku_name=sku_name,
                region=region,
                vcpu=sku_info.vcpus or machine.vcpu,
                memory_gb=sku_info.memory_gb or machine.memory_gb,
                vm_family=machine.vm_family or sku_info.family,
            )
            return AnalysisResult(
                **base,
                status=SkuStatus.RISK,
                reason=f"SKU '{sku_name}' has zone restrictions in '{region}'.",
                alternatives=alternatives,
            )

        # SKU is available and unrestricted
        return AnalysisResult(
            **base,
            status=SkuStatus.OK,
            reason="SKU is available and unrestricted.",
            alternatives=[],
        )
