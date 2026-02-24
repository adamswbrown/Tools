"""Machine model representing a single VM entry from a rightsizing dataset."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Machine:
    """Represents a single machine row from the input dataset.

    Attributes:
        name: The machine/host name.
        region: Azure region where the VM should be deployed.
        recommended_sku: The SKU recommended by the rightsizing tool.
        vcpu: Number of virtual CPUs.
        memory_gb: Memory in gigabytes.
        vm_family: The Azure VM family (e.g. Dsv5, B).
    """

    name: str
    region: str
    recommended_sku: str
    vcpu: Optional[int] = None
    memory_gb: Optional[float] = None
    vm_family: Optional[str] = None
    extra: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.name = self.name.strip()
        self.region = self.region.strip().lower().replace(" ", "")
        self.recommended_sku = self.recommended_sku.strip()
        if self.vm_family:
            self.vm_family = self.vm_family.strip()

    @property
    def display_region(self) -> str:
        """Return a human-readable region name."""
        region_map: dict[str, str] = {
            "uksouth": "UK South",
            "ukwest": "UK West",
            "eastus": "East US",
            "eastus2": "East US 2",
            "westus": "West US",
            "westus2": "West US 2",
            "westus3": "West US 3",
            "centralus": "Central US",
            "northeurope": "North Europe",
            "westeurope": "West Europe",
            "southeastasia": "Southeast Asia",
            "eastasia": "East Asia",
            "australiaeast": "Australia East",
            "australiasoutheast": "Australia Southeast",
            "japaneast": "Japan East",
            "japanwest": "Japan West",
            "canadacentral": "Canada Central",
            "canadaeast": "Canada East",
            "brazilsouth": "Brazil South",
            "southcentralus": "South Central US",
            "northcentralus": "North Central US",
            "westcentralus": "West Central US",
            "germanywestcentral": "Germany West Central",
            "switzerlandnorth": "Switzerland North",
            "norwayeast": "Norway East",
            "swedencentral": "Sweden Central",
            "francecentral": "France Central",
            "francesouth": "France South",
            "koreacentral": "Korea Central",
            "koreasouth": "Korea South",
            "southafricanorth": "South Africa North",
            "uaenorth": "UAE North",
            "centralindia": "Central India",
            "southindia": "South India",
            "westindia": "West India",
        }
        return region_map.get(self.region, self.region)
