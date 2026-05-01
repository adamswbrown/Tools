"""SCCM v_* view queries.

Each Query lists the views it requires so the extractor can schema-verify
before execution and skip the query gracefully when an SCCM site is missing
a view (e.g. older site versions or sites that haven't run the relevant
inventory class).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Query:
    name: str  # short id, used in CSV filename and logs
    output: str  # CSV filename
    sql: str
    required_views: tuple[str, ...]
    hostname_column: str | None = None  # column in result set to normalise
    description: str = ""


SERVER_FILTER = (
    "WHERE sys.Operating_System_Name_and0 LIKE '%Server%'\n"
    "  AND sys.Obsolete0 = 0\n"
    "  AND sys.Active0   = 1"
)


SERVERS = Query(
    name="servers",
    output="sccm_servers.csv",
    description="Master server inventory (Query 1.1).",
    required_views=(
        "v_R_System",
        "v_GS_COMPUTER_SYSTEM",
        "v_GS_OPERATING_SYSTEM",
        "v_GS_SYSTEM_ENCLOSURE",
    ),
    hostname_column="Hostname",
    sql=f"""
SELECT
    sys.ResourceID,
    sys.Name0                                    AS Hostname,
    sys.Full_Domain_Name0                        AS FQDN,
    cs.Manufacturer0                             AS Manufacturer,
    cs.Model0                                    AS Model,
    se.ChassisTypes0                             AS ChassisType,
    CASE
        WHEN cs.Manufacturer0 LIKE '%VMware%'    THEN 'Virtual'
        WHEN cs.Manufacturer0 LIKE '%Microsoft%' AND cs.Model0 LIKE '%Virtual%' THEN 'Virtual'
        WHEN cs.Model0        LIKE '%Virtual%'   THEN 'Virtual'
        WHEN se.ChassisTypes0 IN ('1','3','4','6','7','15','16','22','23','24') THEN 'Physical'
        ELSE 'Unknown'
    END                                          AS MachineType,
    os.Caption0                                  AS OperatingSystem,
    os.Version0                                  AS OSVersion,
    os.BuildNumber0                              AS OSBuild,
    os.InstallDate0                              AS OSInstallDate,
    os.LastBootUpTime0                           AS LastBoot,
    cs.NumberOfProcessors0                       AS PhysicalProcessors,
    cs.NumberOfLogicalProcessors0                AS LogicalProcessors,
    cs.TotalPhysicalMemory0 / 1024               AS TotalMemoryMB,
    sys.AD_Site_Name0                            AS ADSite,
    sys.Resource_Domain_OR_Workgr0               AS Domain,
    sys.Last_Logon_Timestamp0                    AS LastLogon,
    sys.Client0                                  AS HasSCCMClient,
    sys.Active0                                  AS IsActive
FROM v_R_System sys
LEFT JOIN v_GS_COMPUTER_SYSTEM       cs ON sys.ResourceID = cs.ResourceID
LEFT JOIN v_GS_OPERATING_SYSTEM      os ON sys.ResourceID = os.ResourceID
LEFT JOIN v_GS_SYSTEM_ENCLOSURE      se ON sys.ResourceID = se.ResourceID
{SERVER_FILTER}
""",
)


CPU = Query(
    name="cpu",
    output="sccm_cpu.csv",
    description="Per-socket CPU detail (Query 1.2).",
    required_views=("v_GS_PROCESSOR",),
    sql="""
SELECT
    ResourceID,
    Name0                       AS ProcessorName,
    Manufacturer0               AS CPUManufacturer,
    MaxClockSpeed0              AS MaxClockSpeedMHz,
    NumberOfCores0              AS CoresPerSocket,
    NumberOfLogicalProcessors0  AS LogicalPerSocket,
    DataWidth0                  AS Architecture
FROM v_GS_PROCESSOR
""",
)


STORAGE = Query(
    name="storage",
    output="sccm_storage.csv",
    description="Logical disks, fixed only (Query 1.3).",
    required_views=("v_GS_LOGICAL_DISK",),
    sql="""
SELECT
    ResourceID,
    DeviceID0                   AS DriveLetter,
    VolumeName0                 AS VolumeLabel,
    FileSystem0                 AS FileSystem,
    Size0                       AS TotalSizeMB,
    FreeSpace0                  AS FreeSpaceMB,
    (Size0 - FreeSpace0)        AS UsedSpaceMB,
    DriveType0                  AS DriveType
FROM v_GS_LOGICAL_DISK
WHERE DriveType0 = 3
""",
)


NETWORK = Query(
    name="network",
    output="sccm_network.csv",
    description="Network adapter configuration (Query 1.4).",
    required_views=("v_GS_NETWORK_ADAPTER_CONFIGURATION",),
    sql="""
SELECT
    ResourceID,
    Description0                AS AdapterDescription,
    MACAddress0                 AS MACAddress,
    IPAddress0                  AS IPAddresses,
    DefaultIPGateway0           AS DefaultGateway,
    IPSubnet0                   AS Subnet,
    DNSDomain0                  AS DNSDomain,
    DNSServerSearchOrder0       AS DNSServers,
    DHCPEnabled0                AS DHCPEnabled
FROM v_GS_NETWORK_ADAPTER_CONFIGURATION
WHERE IPEnabled0 = 1
""",
)


SOFTWARE = Query(
    name="software",
    output="sccm_software.csv",
    description="Installed software, x86 + x64 unioned (Query 1.5).",
    required_views=("v_Add_Remove_Programs", "v_Add_Remove_Programs_64", "v_R_System"),
    hostname_column="Hostname",
    sql=f"""
SELECT
    arp.ResourceID,
    sys.Name0                   AS Hostname,
    arp.DisplayName0            AS SoftwareName,
    arp.Publisher0              AS Publisher,
    arp.Version0                AS Version,
    arp.InstallDate0            AS InstallDate,
    'x86'                       AS Architecture
FROM v_Add_Remove_Programs arp
INNER JOIN v_R_System sys ON arp.ResourceID = sys.ResourceID
{SERVER_FILTER}
  AND arp.DisplayName0 IS NOT NULL

UNION ALL

SELECT
    arp.ResourceID,
    sys.Name0                   AS Hostname,
    arp.DisplayName0            AS SoftwareName,
    arp.Publisher0              AS Publisher,
    arp.Version0                AS Version,
    arp.InstallDate0            AS InstallDate,
    'x64'                       AS Architecture
FROM v_Add_Remove_Programs_64 arp
INNER JOIN v_R_System sys ON arp.ResourceID = sys.ResourceID
{SERVER_FILTER}
  AND arp.DisplayName0 IS NOT NULL
""",
)


SERVICES = Query(
    name="services",
    output="sccm_services.csv",
    description="Windows services with executable path (Query 1.6).",
    required_views=("v_GS_SERVICE", "v_R_System"),
    hostname_column="Hostname",
    sql=f"""
SELECT
    svc.ResourceID,
    sys.Name0                   AS Hostname,
    svc.DisplayName0            AS ServiceDisplayName,
    svc.Name0                   AS ServiceName,
    svc.PathName0               AS ExecutablePath,
    svc.StartMode0              AS StartMode,
    svc.State0                  AS CurrentState,
    svc.StartName0              AS RunAsAccount
FROM v_GS_SERVICE svc
INNER JOIN v_R_System sys ON svc.ResourceID = sys.ResourceID
{SERVER_FILTER}
  AND svc.StartMode0 IN ('Auto', 'Manual')
""",
)


ROLES = Query(
    name="roles",
    output="sccm_roles.csv",
    description="Installed Windows Server roles and features (Query 1.7).",
    required_views=("v_GS_SERVER_FEATURE", "v_R_System"),
    hostname_column="Hostname",
    sql=f"""
SELECT
    srf.ResourceID,
    sys.Name0                   AS Hostname,
    srf.Name0                   AS RoleOrFeatureName,
    srf.DisplayName0            AS DisplayName,
    srf.InstallState0           AS InstallState
FROM v_GS_SERVER_FEATURE srf
INNER JOIN v_R_System sys ON srf.ResourceID = sys.ResourceID
{SERVER_FILTER}
  AND srf.InstallState0 = 1
""",
)


PATCHES = Query(
    name="patches",
    output="sccm_patches.csv",
    description="Update compliance summary per host (Query 1.8).",
    required_views=("v_R_System", "v_UpdateComplianceStatus"),
    hostname_column="Hostname",
    sql=f"""
SELECT
    sys.Name0                   AS Hostname,
    SUM(CASE WHEN ucs.Status = 2 THEN 1 ELSE 0 END)  AS RequiredUpdates,
    SUM(CASE WHEN ucs.Status = 3 THEN 1 ELSE 0 END)  AS InstalledUpdates,
    MAX(ucs.LastStatusCheckTime)                     AS LastUpdateScan
FROM v_R_System sys
LEFT JOIN v_UpdateComplianceStatus ucs ON sys.ResourceID = ucs.ResourceID
{SERVER_FILTER}
GROUP BY sys.Name0
""",
)


ALL_QUERIES: tuple[Query, ...] = (
    SERVERS,
    CPU,
    STORAGE,
    NETWORK,
    SOFTWARE,
    SERVICES,
    ROLES,
    PATCHES,
)
