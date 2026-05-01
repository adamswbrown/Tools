<#
.SYNOPSIS
    Extracts server inventory, workload signals, and topology from Active Directory
    for pre-population into Dr Migrate (DMC) cloud-migration assessments.

.DESCRIPTION
    Implements the nine queries described in the AD pre-population specification:

      1. Master server inventory                  -> ad_servers.csv
      2. Computer-object SPNs                     -> ad_spns_computer.csv
      3. Service-account SPNs (incl. gMSA)        -> ad_spns_service_accounts.csv
                                                     ad_spns_gmsa.csv
      4. AD Sites                                 -> ad_sites.csv
      5. AD Subnets                               -> ad_subnets.csv
      6. OU distribution                          -> ad_ou_distribution.csv
      7. Stale server detection (90+ days)        -> ad_stale_servers.csv
      8. Domain controllers                       -> ad_domain_controllers.csv
      9. Coverage summary                         -> ad_coverage_summary.csv

    Plus a derived workload classification produced by joining queries 2 + 3 + gMSA
    against the SPN service-class reference table:

                                                  -> ad_workload_classification.csv

    Read-only. Any authenticated domain user with default read on computer objects,
    SPNs, sites, and subnets can run this. The script never writes to AD.

.PARAMETER OutputDir
    Directory where the ad_*.csv files are written. Created if it does not exist.
    Defaults to ./ad-extract in the current working directory.

.PARAMETER Server
    Specific domain controller or Global Catalog to query. If omitted, the
    ActiveDirectory module's default DC discovery is used.

.PARAMETER Credential
    Optional PSCredential for cross-domain or alternate-credential runs.
    If omitted, the current user's credentials are used.

.PARAMETER StaleThresholdDays
    Days of inactivity after which a server is treated as stale. Defaults to 90.

.PARAMETER TimestampOutput
    If set, the output directory becomes <OutputDir>/<yyyyMMdd-HHmmss>/ so that
    re-runs do not overwrite earlier snapshots.

.EXAMPLE
    .\Extract-ADInventory.ps1

.EXAMPLE
    .\Extract-ADInventory.ps1 -OutputDir C:\dmc\customer-x -TimestampOutput

.EXAMPLE
    $cred = Get-Credential
    .\Extract-ADInventory.ps1 -Server dc01.contoso.com -Credential $cred

.NOTES
    Spec date    : 2026-05-01
    Verified     : AD DS 2016/2019/2022, PowerShell 5.1 + 7.x, RSAT ActiveDirectory
    Author       : Adam Brown, Altra Cloud
#>

[CmdletBinding()]
param(
    [string] $OutputDir = (Join-Path -Path (Get-Location) -ChildPath 'ad-extract'),
    [string] $Server,
    [System.Management.Automation.PSCredential] $Credential,
    [int] $StaleThresholdDays = 90,
    [switch] $TimestampOutput
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

#--------------------------------------------------------------------
# Module check
#--------------------------------------------------------------------
if (-not (Get-Module -ListAvailable -Name ActiveDirectory)) {
    throw "The ActiveDirectory module is not available. Install RSAT (Windows client) or the AD DS role tools (Windows Server)."
}
Import-Module ActiveDirectory -ErrorAction Stop | Out-Null

#--------------------------------------------------------------------
# Helpers
#--------------------------------------------------------------------
function Resolve-OutputDir {
    param([string] $Base, [switch] $Timestamped)

    $target = if ($Timestamped) {
        Join-Path -Path $Base -ChildPath (Get-Date -Format 'yyyyMMdd-HHmmss')
    } else {
        $Base
    }

    if (-not (Test-Path -LiteralPath $target)) {
        New-Item -ItemType Directory -Path $target -Force | Out-Null
    }
    (Resolve-Path -LiteralPath $target).Path
}

function Get-CommonADParams {
    $p = @{}
    if ($script:Server)     { $p.Server     = $script:Server }
    if ($script:Credential) { $p.Credential = $script:Credential }
    $p
}

function Write-StatusLine {
    # Logging goes to stderr so stdout stays clean for any downstream piping.
    param([string] $Message)
    [Console]::Error.WriteLine($Message)
}

function Export-CsvUtf8 {
    <#
        Writes a CSV with UTF-8 BOM, comma delimiter, quoted strings.
        PowerShell 5.1's Export-Csv -Encoding UTF8 emits a BOM. PS 7 emits no BOM
        by default; UTF8BOM is the explicit equivalent there. Detect at runtime.
    #>
    param(
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(ValueFromPipeline = $true)] $InputObject
    )
    begin {
        $rows = New-Object System.Collections.Generic.List[object]
    }
    process {
        if ($null -ne $InputObject) { $rows.Add($InputObject) }
    }
    end {
        $encoding = if ($PSVersionTable.PSVersion.Major -ge 6) { 'UTF8BOM' } else { 'UTF8' }
        if ($rows.Count -eq 0) {
            # Touch an empty file so downstream pipelines don't break.
            Set-Content -LiteralPath $Path -Value '' -Encoding $encoding
            return
        }
        $rows | Export-Csv -LiteralPath $Path -NoTypeInformation -Encoding $encoding
    }
}

function Invoke-Query {
    <#
        Wraps a query in try/catch; logs row count to stderr; never aborts the run.
    #>
    param(
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [scriptblock] $Body
    )
    Write-StatusLine "[$Name] starting..."
    try {
        $count = & $Body
        if ($null -eq $count) { $count = 0 }
        Write-StatusLine "[$Name] wrote $count row(s)"
        [PSCustomObject]@{ Query = $Name; Status = 'ok'; Rows = $count; Error = $null }
    } catch {
        Write-StatusLine "[$Name] FAILED: $($_.Exception.Message)"
        [PSCustomObject]@{ Query = $Name; Status = 'error'; Rows = 0; Error = $_.Exception.Message }
    }
}

function Get-OuPath {
    <#
        Strip the domain root and the leaf computer name from a CanonicalName.
        e.g. 'contoso.local/Servers/Prod/SQL/srv01' -> 'Servers/Prod/SQL'
    #>
    param([string] $CanonicalName)
    if (-not $CanonicalName) { return '' }
    $segments = $CanonicalName -split '/'
    if ($segments.Count -le 2) { return '' }
    ($segments[1..($segments.Count - 2)]) -join '/'
}

function Get-OuPathTopThree {
    param([string] $CanonicalName)
    if (-not $CanonicalName) { return '' }
    $segments = $CanonicalName -split '/'
    if ($segments.Count -gt 4) {
        ($segments[1..3]) -join '/'
    } elseif ($segments.Count -gt 2) {
        ($segments[1..($segments.Count - 2)]) -join '/'
    } else {
        ''
    }
}

function Split-SpnParts {
    <#
        SPN format: <class>/<host>[:<port>][/<servicename>]
        Returns a hashtable with ServiceClass / ServiceTarget / ServicePort fields.
        Handles malformed SPNs by returning best-effort fields rather than throwing.
    #>
    param([string] $Spn)
    $parts = $Spn -split '/', 3
    $class  = if ($parts.Count -ge 1) { $parts[0] } else { $null }
    $target = if ($parts.Count -ge 2) { $parts[1] } else { $null }
    $port   = $null
    if ($target -and ($target -match ':(\d+)$')) {
        $port = $Matches[1]
    }
    @{ ServiceClass = $class; ServiceTarget = $target; ServicePort = $port }
}

function Get-CnFromDn {
    param([string] $Dn)
    if (-not $Dn) { return $null }
    if ($Dn -match '^CN=([^,]+),') { return $Matches[1] }
    $Dn
}

#--------------------------------------------------------------------
# SPN service-class -> workload reference table (from the spec)
#--------------------------------------------------------------------
$Script:SpnWorkloadMap = @{
    'MSSQLSvc'                 = 'SQL Server'
    'HTTP'                     = 'IIS / SharePoint / Web'
    'exchangeMDB'              = 'Exchange'
    'exchangeRFR'              = 'Exchange'
    'SMTPSVC'                  = 'Exchange'
    'TERMSRV'                  = 'Terminal Services / RDS'
    'WSMAN'                    = 'WinRM endpoint'
    'ldap'                     = 'Domain Controller'
    'GC'                       = 'Domain Controller'
    'kadmin'                   = 'Domain Controller'
    'DNS'                      = 'Domain Controller'
    'MSOMHSvc'                 = 'SCOM'
    'MSOMSdkSvc'               = 'SCOM'
    'Hyper-V Replica Service'  = 'Hyper-V'
    'MSServerClusterMgmtAPI'   = 'Failover cluster'
    'IMAP'                     = 'Mail service'
    'POP'                      = 'Mail service'
    'SMTP'                     = 'Mail service'
    'ftp'                      = 'FTP'
    'cifs'                     = 'File server'
    'vmrc'                     = 'VMware / vCenter'
}

# 'host' SPNs are noise — every domain-joined machine has them.
$Script:SpnIgnoreClasses = @('host', 'TermSrv', 'RestrictedKrbHost')

#--------------------------------------------------------------------
# Setup
#--------------------------------------------------------------------
$resolvedOut = Resolve-OutputDir -Base $OutputDir -Timestamped:$TimestampOutput
Write-StatusLine "Output directory: $resolvedOut"

$staleCutoffDate     = (Get-Date).AddDays(-1 * $StaleThresholdDays)
$staleCutoffFileTime = $staleCutoffDate.ToFileTime()

$queryStatus = New-Object System.Collections.Generic.List[object]

#--------------------------------------------------------------------
# Query 1 — Master server inventory
#--------------------------------------------------------------------
$queryStatus.Add( (Invoke-Query -Name 'Q1 servers' -Body {
    $params = Get-CommonADParams
    $servers = Get-ADComputer @params `
        -Filter "OperatingSystem -like '*Server*' -and Enabled -eq 'True'" `
        -Properties Name, DNSHostName, OperatingSystem, OperatingSystemVersion,
                    OperatingSystemServicePack, LastLogonTimestamp, PasswordLastSet,
                    whenCreated, whenChanged, Description, Location, ManagedBy,
                    ServicePrincipalNames, CanonicalName, DistinguishedName, ObjectGUID

    $rows = foreach ($s in $servers) {
        $lastLogon = if ($s.LastLogonTimestamp) { [DateTime]::FromFileTime($s.LastLogonTimestamp) } else { $null }
        $age = if ($s.whenCreated) { (New-TimeSpan -Start $s.whenCreated -End (Get-Date)).Days } else { $null }
        [PSCustomObject]@{
            Name                     = $s.Name.ToLower()
            DNSHostName              = if ($s.DNSHostName) { $s.DNSHostName.ToLower() } else { $null }
            OperatingSystem          = $s.OperatingSystem
            OperatingSystemVersion   = $s.OperatingSystemVersion
            OperatingSystemServicePack = $s.OperatingSystemServicePack
            LastLogon                = $lastLogon
            PasswordLastSet          = $s.PasswordLastSet
            WhenCreated              = $s.whenCreated
            WhenChanged              = $s.whenChanged
            AgeDays                  = $age
            OU                       = Get-OuPath -CanonicalName $s.CanonicalName
            Description              = $s.Description
            Location                 = $s.Location
            ManagedBy                = Get-CnFromDn -Dn $s.ManagedBy
            ObjectGUID               = $s.ObjectGUID
            DistinguishedName        = $s.DistinguishedName
        }
    }
    $rows | Export-CsvUtf8 -Path (Join-Path $resolvedOut 'ad_servers.csv')
    ($rows | Measure-Object).Count
}) )

#--------------------------------------------------------------------
# Query 2 — Computer-object SPNs
#--------------------------------------------------------------------
$queryStatus.Add( (Invoke-Query -Name 'Q2 computer SPNs' -Body {
    $params = Get-CommonADParams
    $servers = Get-ADComputer @params `
        -Filter "OperatingSystem -like '*Server*' -and Enabled -eq 'True'" `
        -Properties Name, DNSHostName, ServicePrincipalNames

    $rows = foreach ($c in $servers) {
        if (-not $c.ServicePrincipalNames) { continue }
        foreach ($spn in $c.ServicePrincipalNames) {
            $p = Split-SpnParts -Spn $spn
            [PSCustomObject]@{
                Hostname      = $c.Name.ToLower()
                FQDN          = if ($c.DNSHostName) { $c.DNSHostName.ToLower() } else { $null }
                SPN           = $spn
                ServiceClass  = $p.ServiceClass
                ServiceTarget = $p.ServiceTarget
                ServicePort   = $p.ServicePort
            }
        }
    }
    $rows | Export-CsvUtf8 -Path (Join-Path $resolvedOut 'ad_spns_computer.csv')
    ($rows | Measure-Object).Count
}) )

#--------------------------------------------------------------------
# Query 3 — Service-account SPNs (regular user accounts) + gMSA variant
#--------------------------------------------------------------------
$queryStatus.Add( (Invoke-Query -Name 'Q3 service-account SPNs' -Body {
    $params = Get-CommonADParams
    $accts = Get-ADUser @params `
        -Filter "ServicePrincipalNames -like '*'" `
        -Properties Name, SamAccountName, ServicePrincipalNames, Description, Enabled |
        Where-Object { $_.Enabled }

    $rows = foreach ($a in $accts) {
        if (-not $a.ServicePrincipalNames) { continue }
        foreach ($spn in $a.ServicePrincipalNames) {
            $p = Split-SpnParts -Spn $spn
            [PSCustomObject]@{
                ServiceAccount     = $a.SamAccountName
                AccountType        = 'user'
                AccountDescription = $a.Description
                SPN                = $spn
                ServiceClass       = $p.ServiceClass
                ServiceTarget      = $p.ServiceTarget
                ServicePort        = $p.ServicePort
            }
        }
    }
    $rows | Export-CsvUtf8 -Path (Join-Path $resolvedOut 'ad_spns_service_accounts.csv')
    ($rows | Measure-Object).Count
}) )

$queryStatus.Add( (Invoke-Query -Name 'Q3b gMSA SPNs' -Body {
    $params = Get-CommonADParams
    $gmsas = Get-ADServiceAccount @params -Filter * `
        -Properties Name, SamAccountName, ServicePrincipalNames, Description, Enabled |
        Where-Object { $_.Enabled }

    $rows = foreach ($a in $gmsas) {
        if (-not $a.ServicePrincipalNames) { continue }
        foreach ($spn in $a.ServicePrincipalNames) {
            $p = Split-SpnParts -Spn $spn
            [PSCustomObject]@{
                ServiceAccount     = $a.SamAccountName
                AccountType        = 'gMSA'
                AccountDescription = $a.Description
                SPN                = $spn
                ServiceClass       = $p.ServiceClass
                ServiceTarget      = $p.ServiceTarget
                ServicePort        = $p.ServicePort
            }
        }
    }
    $rows | Export-CsvUtf8 -Path (Join-Path $resolvedOut 'ad_spns_gmsa.csv')
    ($rows | Measure-Object).Count
}) )

#--------------------------------------------------------------------
# Query 4 — AD Sites
#--------------------------------------------------------------------
$queryStatus.Add( (Invoke-Query -Name 'Q4 sites' -Body {
    $params = Get-CommonADParams
    $rows = Get-ADReplicationSite @params -Filter * -Properties * |
        Select-Object Name, Description, Location, whenCreated, whenChanged
    $rows | Export-CsvUtf8 -Path (Join-Path $resolvedOut 'ad_sites.csv')
    ($rows | Measure-Object).Count
}) )

#--------------------------------------------------------------------
# Query 5 — AD Subnets
#--------------------------------------------------------------------
$queryStatus.Add( (Invoke-Query -Name 'Q5 subnets' -Body {
    $params = Get-CommonADParams
    $rows = Get-ADReplicationSubnet @params -Filter * -Properties * |
        Select-Object Name, Site, Location, Description, whenCreated
    $rows | Export-CsvUtf8 -Path (Join-Path $resolvedOut 'ad_subnets.csv')
    ($rows | Measure-Object).Count
}) )

#--------------------------------------------------------------------
# Query 6 — OU distribution (top 3 levels)
#--------------------------------------------------------------------
$queryStatus.Add( (Invoke-Query -Name 'Q6 OU distribution' -Body {
    $params = Get-CommonADParams
    $servers = Get-ADComputer @params `
        -Filter "OperatingSystem -like '*Server*' -and Enabled -eq 'True'" `
        -Properties CanonicalName

    $rows = $servers |
        Group-Object { Get-OuPathTopThree -CanonicalName $_.CanonicalName } |
        Select-Object @{N='OUPath'; E={$_.Name}}, Count |
        Sort-Object Count -Descending
    $rows | Export-CsvUtf8 -Path (Join-Path $resolvedOut 'ad_ou_distribution.csv')
    ($rows | Measure-Object).Count
}) )

#--------------------------------------------------------------------
# Query 7 — Stale servers (>= StaleThresholdDays since LastLogonTimestamp)
#--------------------------------------------------------------------
$queryStatus.Add( (Invoke-Query -Name 'Q7 stale servers' -Body {
    $params = Get-CommonADParams
    $stale = Get-ADComputer @params `
        -Filter "OperatingSystem -like '*Server*' -and LastLogonTimestamp -lt $staleCutoffFileTime" `
        -Properties LastLogonTimestamp, PasswordLastSet, OperatingSystem, whenCreated, Enabled

    $rows = foreach ($s in $stale) {
        $lastLogon = if ($s.LastLogonTimestamp) {
            [DateTime]::FromFileTime($s.LastLogonTimestamp)
        } else { $null }

        $lastLogonDays = if ($lastLogon) {
            (New-TimeSpan -Start $lastLogon -End (Get-Date)).Days
        } else { 9999 }

        $pwdDays = if ($s.PasswordLastSet) {
            (New-TimeSpan -Start $s.PasswordLastSet -End (Get-Date)).Days
        } else { 9999 }

        [PSCustomObject]@{
            Name                = $s.Name.ToLower()
            OperatingSystem     = $s.OperatingSystem
            Enabled             = $s.Enabled
            LastLogon           = if ($lastLogon) { $lastLogon } else { 'Never' }
            LastLogonDays       = $lastLogonDays
            PasswordLastSetDays = $pwdDays
            WhenCreated         = $s.whenCreated
        }
    }

    $rows = $rows | Sort-Object LastLogonDays -Descending
    $rows | Export-CsvUtf8 -Path (Join-Path $resolvedOut 'ad_stale_servers.csv')
    ($rows | Measure-Object).Count
}) )

#--------------------------------------------------------------------
# Query 8 — Domain controllers
#--------------------------------------------------------------------
$queryStatus.Add( (Invoke-Query -Name 'Q8 domain controllers' -Body {
    $params = Get-CommonADParams
    $rows = Get-ADDomainController @params -Filter * |
        Select-Object Name, HostName, Site, IPv4Address, OperatingSystem,
                      OperatingSystemVersion, IsGlobalCatalog, IsReadOnly,
                      Domain, Forest
    $rows | Export-CsvUtf8 -Path (Join-Path $resolvedOut 'ad_domain_controllers.csv')
    ($rows | Measure-Object).Count
}) )

#--------------------------------------------------------------------
# Derived — Workload classification per host
#   Joins ad_spns_computer + ad_spns_service_accounts + ad_spns_gmsa,
#   strips noise classes (host/RestrictedKrbHost), maps ServiceClass to
#   a workload label, and aggregates per hostname.
#
#   ServiceTarget on service-account SPNs is the host the service runs on,
#   which is how a SQL workload running as a domain account ties back to
#   a server inventoried in Query 1.
#--------------------------------------------------------------------
$queryStatus.Add( (Invoke-Query -Name 'Workload classification' -Body {
    function Get-HostnameFromTarget {
        param([string] $Target)
        if (-not $Target) { return $null }
        # Strip :port if present, then take just the leftmost label as the NetBIOS hint.
        $h = $Target -replace ':\d+$', ''
        ($h -split '\.')[0].ToLower()
    }

    $compPath  = Join-Path $resolvedOut 'ad_spns_computer.csv'
    $svcPath   = Join-Path $resolvedOut 'ad_spns_service_accounts.csv'
    $gmsaPath  = Join-Path $resolvedOut 'ad_spns_gmsa.csv'

    $rows = New-Object System.Collections.Generic.List[object]

    foreach ($path in @($compPath, $svcPath, $gmsaPath)) {
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $imported = @()
        try { $imported = Import-Csv -LiteralPath $path } catch { $imported = @() }
        foreach ($r in $imported) {
            if (-not $r.ServiceClass) { continue }
            if ($Script:SpnIgnoreClasses -contains $r.ServiceClass) { continue }
            $workload = $Script:SpnWorkloadMap[$r.ServiceClass]
            if (-not $workload) { $workload = "Other ($($r.ServiceClass))" }

            $hostname = if ($r.PSObject.Properties.Name -contains 'Hostname' -and $r.Hostname) {
                $r.Hostname.ToLower()
            } else {
                Get-HostnameFromTarget -Target $r.ServiceTarget
            }
            if (-not $hostname) { continue }

            $rows.Add([PSCustomObject]@{
                Hostname     = $hostname
                Workload     = $workload
                ServiceClass = $r.ServiceClass
                Source       = if ($path -eq $compPath) { 'computer' }
                               elseif ($path -eq $gmsaPath) { 'gMSA' }
                               else { 'service-account' }
                ServiceAccount = if ($r.PSObject.Properties.Name -contains 'ServiceAccount') { $r.ServiceAccount } else { $null }
                SPN          = $r.SPN
            })
        }
    }

    # Aggregate to one row per (hostname, workload) so the file is small enough
    # to skim, while still preserving the underlying SPN evidence in the SPN CSVs.
    $aggregated = $rows |
        Group-Object Hostname, Workload |
        ForEach-Object {
            $first = $_.Group | Select-Object -First 1
            [PSCustomObject]@{
                Hostname        = $first.Hostname
                Workload        = $first.Workload
                Evidence        = $_.Count
                ServiceClasses  = (($_.Group.ServiceClass | Sort-Object -Unique) -join ',')
                Sources         = (($_.Group.Source        | Sort-Object -Unique) -join ',')
                ServiceAccounts = (($_.Group.ServiceAccount | Where-Object { $_ } | Sort-Object -Unique) -join ',')
            }
        } |
        Sort-Object Hostname, Workload

    $aggregated | Export-CsvUtf8 -Path (Join-Path $resolvedOut 'ad_workload_classification.csv')
    ($aggregated | Measure-Object).Count
}) )

#--------------------------------------------------------------------
# Query 9 — Coverage summary (single row + per-query status table)
#--------------------------------------------------------------------
$queryStatus.Add( (Invoke-Query -Name 'Q9 coverage summary' -Body {
    $params = Get-CommonADParams

    $totalServers    = (Get-ADComputer @params -Filter "OperatingSystem -like '*Server*'").Count
    $enabledServers  = (Get-ADComputer @params -Filter "OperatingSystem -like '*Server*' -and Enabled -eq 'True'").Count
    $disabledServers = (Get-ADComputer @params -Filter "OperatingSystem -like '*Server*' -and Enabled -eq 'False'").Count
    $staleServers    = (Get-ADComputer @params -Filter "OperatingSystem -like '*Server*' -and LastLogonTimestamp -lt $staleCutoffFileTime").Count
    $dcCount         = (Get-ADDomainController @params -Filter *).Count
    $siteCount       = (Get-ADReplicationSite @params -Filter *).Count
    $subnetCount     = (Get-ADReplicationSubnet @params -Filter *).Count

    $osDistribution = Get-ADComputer @params `
        -Filter "OperatingSystem -like '*Server*' -and Enabled -eq 'True'" `
        -Properties OperatingSystem |
        Group-Object OperatingSystem |
        Sort-Object Count -Descending |
        ForEach-Object { "$($_.Name): $($_.Count)" }

    $row = [PSCustomObject]@{
        ExtractedAt          = (Get-Date).ToString('s')
        StaleThresholdDays   = $StaleThresholdDays
        TotalServerObjects   = $totalServers
        EnabledServers       = $enabledServers
        DisabledServers      = $disabledServers
        StaleServers         = $staleServers
        DomainControllers    = $dcCount
        ADSites              = $siteCount
        ADSubnets            = $subnetCount
        OSDistribution       = ($osDistribution -join '; ')
    }
    $row | Export-CsvUtf8 -Path (Join-Path $resolvedOut 'ad_coverage_summary.csv')
    1
}) )

#--------------------------------------------------------------------
# Per-query run status (useful when one query fails and others succeed)
#--------------------------------------------------------------------
$queryStatus | Export-CsvUtf8 -Path (Join-Path $resolvedOut 'ad_run_status.csv')

Write-StatusLine ''
Write-StatusLine '--- run summary ---'
foreach ($s in $queryStatus) {
    Write-StatusLine ("{0,-28} {1,-6} rows={2}{3}" -f $s.Query, $s.Status, $s.Rows, $(if ($s.Error) { "  err=$($s.Error)" } else { '' }))
}
Write-StatusLine ''
Write-StatusLine "Output: $resolvedOut"
