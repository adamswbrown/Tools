"""Alternative SKU recommendation engine.

When a requested SKU is blocked, restricted, or unavailable, this engine
suggests the best replacement SKUs using a weighted scoring system.

Priority order:
    1. Same VM family
    2. Same vCPU count
    3. Similar memory
    4. Same generation
    5. Closest cost profile (approximated via size tier)
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from app.config import MAX_ALTERNATIVES
from azure_client.sku_service import SkuInfo, SkuService

logger = logging.getLogger(__name__)

# Weights for the scoring algorithm
WEIGHT_FAMILY: float = 40.0
WEIGHT_VCPU: float = 25.0
WEIGHT_MEMORY: float = 20.0
WEIGHT_GENERATION: float = 10.0
WEIGHT_SIZE_TIER: float = 5.0

# Regex to extract generation number from SKU name (e.g. v5 from Standard_D4s_v5)
_GENERATION_RE = re.compile(r"_v(\d+)$", re.IGNORECASE)

# Regex to extract the numeric size from SKU name (e.g. 4 from Standard_D4s_v5)
_SIZE_RE = re.compile(r"[A-Za-z]+_[A-Za-z]+?(\d+)", re.IGNORECASE)

# Regex to extract the family prefix from SKU name (e.g. D from Standard_D4s_v5)
_FAMILY_PREFIX_RE = re.compile(
    r"Standard_([A-Za-z]+?)(\d+)", re.IGNORECASE
)


def _extract_generation(sku_name: str) -> Optional[int]:
    """Extract the generation number from a SKU name."""
    match = _GENERATION_RE.search(sku_name)
    if match:
        return int(match.group(1))
    return None


def _extract_size_number(sku_name: str) -> Optional[int]:
    """Extract the numeric size portion of the SKU name."""
    match = _SIZE_RE.search(sku_name)
    if match:
        return int(match.group(1))
    return None


def _extract_family_prefix(sku_name: str) -> Optional[str]:
    """Extract the family letter prefix (e.g. 'D', 'E', 'B', 'Ds')."""
    match = _FAMILY_PREFIX_RE.search(sku_name)
    if match:
        return match.group(1).lower()
    return None


class AlternativeEngine:
    """Recommends alternative VM SKUs when the requested one is unavailable."""

    def __init__(
        self,
        sku_service: SkuService,
        max_alternatives: int = MAX_ALTERNATIVES,
    ) -> None:
        """Initialize the alternative engine.

        Args:
            sku_service: The Azure SKU service (must already have data fetched).
            max_alternatives: Maximum number of alternatives to return.
        """
        self._sku_service = sku_service
        self._max_alternatives = max_alternatives

    def find_alternatives(
        self,
        sku_name: str,
        region: str,
        vcpu: Optional[int] = None,
        memory_gb: Optional[float] = None,
        vm_family: Optional[str] = None,
    ) -> list[str]:
        """Find the best alternative SKUs for a given configuration.

        Args:
            sku_name: The original requested SKU name.
            region: The target region.
            vcpu: Desired vCPU count.
            memory_gb: Desired memory in GB.
            vm_family: Desired VM family.

        Returns:
            List of alternative SKU names, ordered by relevance (best first).
        """
        candidates = self._sku_service.get_skus_in_region(region)
        if not candidates:
            logger.warning("No SKUs found in region '%s' for alternatives", region)
            return []

        # Filter out the original SKU itself, and SKUs that are restricted
        candidates = [
            c for c in candidates
            if c.name.lower() != sku_name.lower()
            and not c.is_restricted_in_region(region)
        ]

        if not candidates:
            return []

        # Extract reference values from the original SKU name
        ref_generation = _extract_generation(sku_name)
        ref_family_prefix = _extract_family_prefix(sku_name)
        ref_size_number = _extract_size_number(sku_name)

        # Use the SKU catalog info for vCPU/memory if we have it
        original_info = self._sku_service.get_sku_info(sku_name)
        if original_info:
            if vcpu is None:
                vcpu = original_info.vcpus
            if memory_gb is None:
                memory_gb = original_info.memory_gb

        scored: list[tuple[float, SkuInfo]] = []
        for candidate in candidates:
            score = self._score(
                candidate=candidate,
                ref_vcpu=vcpu,
                ref_memory_gb=memory_gb,
                ref_family=vm_family,
                ref_family_prefix=ref_family_prefix,
                ref_generation=ref_generation,
                ref_size_number=ref_size_number,
            )
            scored.append((score, candidate))

        # Sort by score descending (higher = better match)
        scored.sort(key=lambda x: x[0], reverse=True)

        result = [s[1].name for s in scored[: self._max_alternatives]]
        logger.debug(
            "Alternatives for %s in %s: %s",
            sku_name,
            region,
            result,
        )
        return result

    def _score(
        self,
        candidate: SkuInfo,
        ref_vcpu: Optional[int],
        ref_memory_gb: Optional[float],
        ref_family: Optional[str],
        ref_family_prefix: Optional[str],
        ref_generation: Optional[int],
        ref_size_number: Optional[int],
    ) -> float:
        """Score a candidate SKU against reference criteria.

        Higher score means better match. Maximum possible score is 100.

        Args:
            candidate: The candidate SKU to score.
            ref_vcpu: Target vCPU count.
            ref_memory_gb: Target memory in GB.
            ref_family: Target VM family string.
            ref_family_prefix: Extracted family prefix (e.g. 'd', 'e').
            ref_generation: Target generation number.
            ref_size_number: Numeric size extracted from the SKU name.

        Returns:
            A score between 0 and 100.
        """
        score: float = 0.0

        # 1. Family match (40 points)
        cand_family_prefix = _extract_family_prefix(candidate.name)
        if ref_family_prefix and cand_family_prefix:
            if cand_family_prefix == ref_family_prefix:
                score += WEIGHT_FAMILY
            elif ref_family_prefix[0] == cand_family_prefix[0]:
                # Same base letter (e.g. D vs Ds) — partial credit
                score += WEIGHT_FAMILY * 0.6
        elif ref_family and candidate.family:
            if ref_family.lower() in candidate.family.lower():
                score += WEIGHT_FAMILY
            elif candidate.family.lower()[0] == ref_family.lower()[0]:
                score += WEIGHT_FAMILY * 0.4

        # 2. vCPU match (25 points)
        cand_vcpu = candidate.vcpus
        if ref_vcpu and cand_vcpu:
            if cand_vcpu == ref_vcpu:
                score += WEIGHT_VCPU
            else:
                ratio = min(cand_vcpu, ref_vcpu) / max(cand_vcpu, ref_vcpu)
                score += WEIGHT_VCPU * ratio

        # 3. Memory match (20 points)
        cand_mem = candidate.memory_gb
        if ref_memory_gb and cand_mem:
            if cand_mem == ref_memory_gb:
                score += WEIGHT_MEMORY
            else:
                ratio = min(cand_mem, ref_memory_gb) / max(cand_mem, ref_memory_gb)
                score += WEIGHT_MEMORY * ratio

        # 4. Generation match (10 points)
        cand_gen = _extract_generation(candidate.name)
        if ref_generation and cand_gen:
            if cand_gen == ref_generation:
                score += WEIGHT_GENERATION
            elif abs(cand_gen - ref_generation) == 1:
                score += WEIGHT_GENERATION * 0.5

        # 5. Size tier / cost proximity (5 points)
        cand_size = _extract_size_number(candidate.name)
        if ref_size_number and cand_size:
            if cand_size == ref_size_number:
                score += WEIGHT_SIZE_TIER
            else:
                ratio = min(cand_size, ref_size_number) / max(cand_size, ref_size_number)
                score += WEIGHT_SIZE_TIER * ratio

        return score
