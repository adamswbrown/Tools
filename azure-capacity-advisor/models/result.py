"""Result models for the analysis output."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class SkuStatus(str, Enum):
    """Status of a SKU in a given region."""

    OK = "OK"
    RISK = "RISK"
    BLOCKED = "BLOCKED"
    UNKNOWN = "UNKNOWN"

    def __str__(self) -> str:
        return self.value


@dataclass
class AnalysisResult:
    """Result of analysing a single machine's SKU availability.

    Attributes:
        machine_name: The original machine name.
        region: The Azure region evaluated.
        display_region: Human-readable region name.
        requested_sku: The SKU that was requested.
        status: The availability status.
        reason: A human-readable explanation of the status.
        alternatives: List of alternative SKU names.
        vcpu: vCPU count from the input.
        memory_gb: Memory from the input.
        vm_family: VM family from the input.
    """

    machine_name: str
    region: str
    display_region: str
    requested_sku: str
    status: SkuStatus
    reason: str = ""
    alternatives: list[str] = field(default_factory=list)
    vcpu: Optional[int] = None
    memory_gb: Optional[float] = None
    vm_family: Optional[str] = None

    @property
    def alternatives_display(self) -> str:
        """Return alternatives as a comma-separated string."""
        if not self.alternatives:
            return "\u2014"
        return ", ".join(self.alternatives)


@dataclass
class AnalysisSummary:
    """Summary statistics for an analysis run."""

    total: int = 0
    ok: int = 0
    risk: int = 0
    blocked: int = 0
    unknown: int = 0

    @classmethod
    def from_results(cls, results: list[AnalysisResult]) -> AnalysisSummary:
        """Compute summary from a list of results."""
        summary = cls(total=len(results))
        for r in results:
            if r.status == SkuStatus.OK:
                summary.ok += 1
            elif r.status == SkuStatus.RISK:
                summary.risk += 1
            elif r.status == SkuStatus.BLOCKED:
                summary.blocked += 1
            else:
                summary.unknown += 1
        return summary
