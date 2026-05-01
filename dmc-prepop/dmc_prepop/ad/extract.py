"""AD extraction.

Implements all 9 queries from the AD spec. Each query is a small function that
takes an ADSession and an output directory and writes one CSV.

LDAP filter notes:
- "enabled" computer = userAccountControl bit 2 (ACCOUNTDISABLE) is NOT set:
    (!(userAccountControl:1.2.840.113556.1.4.803:=2))
- "stale" by lastLogonTimestamp uses Windows file-time (100ns ticks since
  1601-01-01 UTC).
"""
from __future__ import annotations

import datetime as dt
import logging
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

from dmc_prepop.ad.connect import ADSession
from dmc_prepop.ad.spn import parse_spn, workload_for
from dmc_prepop.normalize import normalise_hostname
from dmc_prepop.output import open_csv

log = logging.getLogger(__name__)

WINDOWS_EPOCH = dt.datetime(1601, 1, 1, tzinfo=dt.timezone.utc)
DISABLED_FLAG = "(!(userAccountControl:1.2.840.113556.1.4.803:=2))"
SERVER_FILTER = (
    f"(&(objectCategory=computer)(operatingSystem=*Server*){DISABLED_FLAG})"
)


@dataclass
class QueryResult:
    name: str
    output: str
    status: str  # "executed" | "failed"
    row_count: int = 0
    error: str | None = None


def _attr(entry: dict, name: str):
    """Pull a single attribute value (or None) from a paged_search entry."""
    attrs = entry.get("attributes") or {}
    val = attrs.get(name)
    if val is None or val == []:
        return None
    if isinstance(val, list):
        return val[0]
    return val


def _attr_list(entry: dict, name: str) -> list:
    attrs = entry.get("attributes") or {}
    val = attrs.get(name)
    if val is None:
        return []
    if isinstance(val, list):
        return val
    return [val]


def _filetime_to_dt(ft) -> dt.datetime | None:
    if ft is None:
        return None
    if isinstance(ft, dt.datetime):
        return ft
    try:
        ticks = int(ft)
    except (TypeError, ValueError):
        return None
    if ticks <= 0:
        return None
    return WINDOWS_EPOCH + dt.timedelta(microseconds=ticks // 10)


def _to_iso(value) -> str:
    if value is None:
        return ""
    if isinstance(value, dt.datetime):
        return value.astimezone(dt.timezone.utc).isoformat()
    return str(value)


def _ou_from_dn(dn: str) -> str:
    """Strip leading CN= (the leaf) and trailing DC= (domain) parts and return OUs joined by '/'."""
    if not dn:
        return ""
    parts = [p.strip() for p in dn.split(",") if p.strip()]
    ous = [p[3:] for p in parts if p.upper().startswith("OU=")]
    return "/".join(reversed(ous))


def _managed_by_cn(dn: str) -> str:
    if not dn:
        return ""
    head = dn.split(",", 1)[0].strip()
    if head.upper().startswith("CN="):
        return head[3:]
    return head


def _now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _age_days(start: dt.datetime | None, end: dt.datetime | None = None) -> int | None:
    if not start:
        return None
    end = end or _now_utc()
    if start.tzinfo is None:
        start = start.replace(tzinfo=dt.timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=dt.timezone.utc)
    return (end - start).days


def _filetime_cutoff(days_ago: int) -> int:
    cutoff = _now_utc() - dt.timedelta(days=days_ago)
    return int((cutoff - WINDOWS_EPOCH).total_seconds() * 10_000_000)


# ---------------------------------------------------------------------------
# Query 1 — servers
# ---------------------------------------------------------------------------

SERVER_ATTRS = [
    "name",
    "dNSHostName",
    "operatingSystem",
    "operatingSystemVersion",
    "operatingSystemServicePack",
    "lastLogonTimestamp",
    "pwdLastSet",
    "whenCreated",
    "whenChanged",
    "description",
    "location",
    "managedBy",
    "servicePrincipalName",
    "distinguishedName",
    "objectGUID",
    "userAccountControl",
]

SERVERS_HEADERS = [
    "Hostname",
    "DNSHostName",
    "OperatingSystem",
    "OperatingSystemVersion",
    "OperatingSystemServicePack",
    "LastLogon",
    "LastLogonDays",
    "PasswordLastSet",
    "WhenCreated",
    "WhenChanged",
    "AgeDays",
    "OU",
    "Description",
    "Location",
    "ManagedBy",
    "ObjectGUID",
    "DistinguishedName",
]


def query_servers(session: ADSession, output_dir: Path) -> QueryResult:
    out = output_dir / "ad_servers.csv"
    with open_csv(out, SERVERS_HEADERS) as writer:
        for entry in session.search(SERVER_FILTER, SERVER_ATTRS):
            name = _attr(entry, "name")
            dn = entry.get("dn") or _attr(entry, "distinguishedName") or ""
            last_logon = _filetime_to_dt(_attr(entry, "lastLogonTimestamp"))
            when_created = _attr(entry, "whenCreated")
            when_changed = _attr(entry, "whenChanged")
            pwd_last = _attr(entry, "pwdLastSet")
            pwd_last_dt = (
                _filetime_to_dt(pwd_last)
                if not isinstance(pwd_last, dt.datetime)
                else pwd_last
            )
            writer.write_row(
                [
                    normalise_hostname(name),
                    _attr(entry, "dNSHostName") or "",
                    _attr(entry, "operatingSystem") or "",
                    _attr(entry, "operatingSystemVersion") or "",
                    _attr(entry, "operatingSystemServicePack") or "",
                    _to_iso(last_logon),
                    _age_days(last_logon) if last_logon else "",
                    _to_iso(pwd_last_dt),
                    _to_iso(when_created),
                    _to_iso(when_changed),
                    _age_days(when_created) if when_created else "",
                    _ou_from_dn(dn),
                    _attr(entry, "description") or "",
                    _attr(entry, "location") or "",
                    _managed_by_cn(_attr(entry, "managedBy") or ""),
                    _attr(entry, "objectGUID") or "",
                    dn,
                ]
            )
        return QueryResult(
            name="servers", output="ad_servers.csv", status="executed",
            row_count=writer.row_count,
        )


# ---------------------------------------------------------------------------
# Query 2 — computer-object SPNs
# ---------------------------------------------------------------------------

SPN_HEADERS = [
    "Hostname",
    "FQDN",
    "SPN",
    "ServiceClass",
    "ServiceTarget",
    "ServicePort",
    "ServiceName",
    "Workload",
]


def query_computer_spns(session: ADSession, output_dir: Path) -> QueryResult:
    out = output_dir / "ad_spns_computer.csv"
    with open_csv(out, SPN_HEADERS) as writer:
        attrs = ["name", "dNSHostName", "servicePrincipalName"]
        ldap_filter = (
            f"(&(objectCategory=computer)(operatingSystem=*Server*)"
            f"(servicePrincipalName=*){DISABLED_FLAG})"
        )
        for entry in session.search(ldap_filter, attrs):
            hostname = normalise_hostname(_attr(entry, "name"))
            fqdn = _attr(entry, "dNSHostName") or ""
            for spn in _attr_list(entry, "servicePrincipalName"):
                p = parse_spn(spn)
                writer.write_row(
                    [
                        hostname,
                        fqdn,
                        p.raw,
                        p.service_class,
                        p.service_target,
                        p.service_port or "",
                        p.service_name or "",
                        workload_for(p.service_class),
                    ]
                )
    return QueryResult(
        name="spns_computer", output="ad_spns_computer.csv", status="executed",
        row_count=_count_rows(out),
    )


# ---------------------------------------------------------------------------
# Query 3 — service-account SPNs (user accounts) and gMSA
# ---------------------------------------------------------------------------

ACCOUNT_SPN_HEADERS = [
    "ServiceAccount",
    "AccountType",
    "AccountDescription",
    "Enabled",
    "SPN",
    "ServiceClass",
    "ServiceTarget",
    "ServicePort",
    "ServiceName",
    "Workload",
]


def query_service_account_spns(session: ADSession, output_dir: Path) -> QueryResult:
    out = output_dir / "ad_spns_service_accounts.csv"
    with open_csv(out, ACCOUNT_SPN_HEADERS) as writer:
        attrs = ["sAMAccountName", "description", "userAccountControl",
                 "servicePrincipalName"]
        ldap_filter = (
            f"(&(objectCategory=person)(objectClass=user)"
            f"(servicePrincipalName=*){DISABLED_FLAG})"
        )
        for entry in session.search(ldap_filter, attrs):
            account = _attr(entry, "sAMAccountName") or ""
            description = _attr(entry, "description") or ""
            uac = _attr(entry, "userAccountControl")
            enabled = "True" if not (isinstance(uac, int) and (uac & 2)) else "False"
            for spn in _attr_list(entry, "servicePrincipalName"):
                p = parse_spn(spn)
                writer.write_row(
                    [
                        account,
                        "user",
                        description,
                        enabled,
                        p.raw,
                        p.service_class,
                        p.service_target,
                        p.service_port or "",
                        p.service_name or "",
                        workload_for(p.service_class),
                    ]
                )
    return QueryResult(
        name="spns_service_accounts", output="ad_spns_service_accounts.csv",
        status="executed", row_count=_count_rows(out),
    )


def query_gmsa_spns(session: ADSession, output_dir: Path) -> QueryResult:
    out = output_dir / "ad_spns_gmsa.csv"
    with open_csv(out, ACCOUNT_SPN_HEADERS) as writer:
        # gMSA = msDS-GroupManagedServiceAccount; sMSA = msDS-ManagedServiceAccount.
        # Cover both — treat sMSA as a legacy variant of the same role.
        ldap_filter = (
            "(&(|(objectClass=msDS-GroupManagedServiceAccount)"
            "(objectClass=msDS-ManagedServiceAccount))"
            "(servicePrincipalName=*))"
        )
        attrs = ["sAMAccountName", "description", "objectClass",
                 "userAccountControl", "servicePrincipalName"]
        for entry in session.search(ldap_filter, attrs):
            account = _attr(entry, "sAMAccountName") or ""
            description = _attr(entry, "description") or ""
            classes = _attr_list(entry, "objectClass")
            account_type = (
                "gMSA"
                if "msDS-GroupManagedServiceAccount" in classes
                else "sMSA"
            )
            uac = _attr(entry, "userAccountControl")
            enabled = "True" if not (isinstance(uac, int) and (uac & 2)) else "False"
            for spn in _attr_list(entry, "servicePrincipalName"):
                p = parse_spn(spn)
                writer.write_row(
                    [
                        account,
                        account_type,
                        description,
                        enabled,
                        p.raw,
                        p.service_class,
                        p.service_target,
                        p.service_port or "",
                        p.service_name or "",
                        workload_for(p.service_class),
                    ]
                )
    return QueryResult(
        name="spns_gmsa", output="ad_spns_gmsa.csv",
        status="executed", row_count=_count_rows(out),
    )


# ---------------------------------------------------------------------------
# Query 4 — AD sites
# Query 5 — AD subnets
# ---------------------------------------------------------------------------

SITE_HEADERS = ["Name", "Description", "Location", "WhenCreated", "WhenChanged", "DistinguishedName"]


def query_sites(session: ADSession, output_dir: Path) -> QueryResult:
    out = output_dir / "ad_sites.csv"
    base = f"CN=Sites,{session.configuration_dn}"
    attrs = ["name", "description", "location", "whenCreated", "whenChanged"]
    with open_csv(out, SITE_HEADERS) as writer:
        for entry in session.search("(objectClass=site)", attrs, base_dn=base):
            writer.write_row(
                [
                    _attr(entry, "name") or "",
                    _attr(entry, "description") or "",
                    _attr(entry, "location") or "",
                    _to_iso(_attr(entry, "whenCreated")),
                    _to_iso(_attr(entry, "whenChanged")),
                    entry.get("dn") or "",
                ]
            )
    return QueryResult(
        name="sites", output="ad_sites.csv",
        status="executed", row_count=_count_rows(out),
    )


SUBNET_HEADERS = ["Name", "Site", "Location", "Description", "WhenCreated", "DistinguishedName"]


def query_subnets(session: ADSession, output_dir: Path) -> QueryResult:
    out = output_dir / "ad_subnets.csv"
    base = f"CN=Subnets,CN=Sites,{session.configuration_dn}"
    attrs = ["name", "siteObject", "location", "description", "whenCreated"]
    with open_csv(out, SUBNET_HEADERS) as writer:
        for entry in session.search("(objectClass=subnet)", attrs, base_dn=base):
            site_dn = _attr(entry, "siteObject") or ""
            writer.write_row(
                [
                    _attr(entry, "name") or "",
                    _managed_by_cn(site_dn),  # extracts CN= from the site DN
                    _attr(entry, "location") or "",
                    _attr(entry, "description") or "",
                    _to_iso(_attr(entry, "whenCreated")),
                    entry.get("dn") or "",
                ]
            )
    return QueryResult(
        name="subnets", output="ad_subnets.csv",
        status="executed", row_count=_count_rows(out),
    )


# ---------------------------------------------------------------------------
# Query 6 — OU distribution
# ---------------------------------------------------------------------------

OU_HEADERS = ["OUPath", "Count"]


def query_ou_distribution(session: ADSession, output_dir: Path) -> QueryResult:
    out = output_dir / "ad_ou_distribution.csv"
    attrs = ["distinguishedName"]
    counts: Counter[str] = Counter()
    for entry in session.search(SERVER_FILTER, attrs):
        dn = entry.get("dn") or _attr(entry, "distinguishedName") or ""
        ou = _ou_from_dn(dn)
        # Trim to top three OU levels (closest to domain root) per spec.
        segments = ou.split("/") if ou else []
        if len(segments) > 3:
            ou = "/".join(segments[:3])
        counts[ou or "(none)"] += 1
    with open_csv(out, OU_HEADERS) as writer:
        for path, count in sorted(counts.items(), key=lambda kv: kv[1], reverse=True):
            writer.write_row([path, count])
    return QueryResult(
        name="ou_distribution", output="ad_ou_distribution.csv",
        status="executed", row_count=sum(counts.values()),
    )


# ---------------------------------------------------------------------------
# Query 7 — stale servers
# ---------------------------------------------------------------------------

STALE_HEADERS = [
    "Hostname",
    "OperatingSystem",
    "Enabled",
    "LastLogon",
    "LastLogonDays",
    "PasswordLastSetDays",
    "WhenCreated",
    "DistinguishedName",
]


def query_stale_servers(
    session: ADSession, output_dir: Path, days: int = 90
) -> QueryResult:
    out = output_dir / "ad_stale_servers.csv"
    cutoff = _filetime_cutoff(days)
    # Include disabled servers in the stale view — they're often soft-decoms.
    ldap_filter = (
        f"(&(objectCategory=computer)(operatingSystem=*Server*)"
        f"(|(lastLogonTimestamp<={cutoff})(!(lastLogonTimestamp=*))))"
    )
    attrs = [
        "name",
        "operatingSystem",
        "lastLogonTimestamp",
        "pwdLastSet",
        "whenCreated",
        "userAccountControl",
        "distinguishedName",
    ]
    rows: list[list] = []
    for entry in session.search(ldap_filter, attrs):
        name = normalise_hostname(_attr(entry, "name"))
        last_logon = _filetime_to_dt(_attr(entry, "lastLogonTimestamp"))
        pwd_last = _filetime_to_dt(_attr(entry, "pwdLastSet"))
        when_created = _attr(entry, "whenCreated")
        uac = _attr(entry, "userAccountControl")
        enabled = "True" if not (isinstance(uac, int) and (uac & 2)) else "False"
        rows.append(
            [
                name,
                _attr(entry, "operatingSystem") or "",
                enabled,
                _to_iso(last_logon) if last_logon else "Never",
                _age_days(last_logon) if last_logon else 9999,
                _age_days(pwd_last) if pwd_last else 9999,
                _to_iso(when_created),
                entry.get("dn") or "",
            ]
        )
    rows.sort(key=lambda r: r[4] if isinstance(r[4], int) else 9999, reverse=True)
    with open_csv(out, STALE_HEADERS) as writer:
        for r in rows:
            writer.write_row(r)
    return QueryResult(
        name="stale_servers", output="ad_stale_servers.csv",
        status="executed", row_count=len(rows),
    )


# ---------------------------------------------------------------------------
# Query 8 — domain controllers
# ---------------------------------------------------------------------------

DC_HEADERS = [
    "Hostname",
    "DNSHostName",
    "OperatingSystem",
    "OperatingSystemVersion",
    "Site",
    "DistinguishedName",
]


def query_domain_controllers(session: ADSession, output_dir: Path) -> QueryResult:
    out = output_dir / "ad_domain_controllers.csv"
    # userAccountControl bit 8192 (0x2000) = SERVER_TRUST_ACCOUNT — domain controller.
    ldap_filter = (
        "(&(objectCategory=computer)"
        "(userAccountControl:1.2.840.113556.1.4.803:=8192))"
    )
    attrs = [
        "name",
        "dNSHostName",
        "operatingSystem",
        "operatingSystemVersion",
        "serverReferenceBL",
        "msDS-SiteName",
    ]
    with open_csv(out, DC_HEADERS) as writer:
        for entry in session.search(ldap_filter, attrs):
            site = _attr(entry, "msDS-SiteName") or ""
            writer.write_row(
                [
                    normalise_hostname(_attr(entry, "name")),
                    _attr(entry, "dNSHostName") or "",
                    _attr(entry, "operatingSystem") or "",
                    _attr(entry, "operatingSystemVersion") or "",
                    site,
                    entry.get("dn") or "",
                ]
            )
    return QueryResult(
        name="domain_controllers", output="ad_domain_controllers.csv",
        status="executed", row_count=_count_rows(out),
    )


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

QueryFn = Callable[[ADSession, Path], QueryResult]

ALL_QUERIES: list[tuple[str, QueryFn]] = [
    ("servers", query_servers),
    ("spns_computer", query_computer_spns),
    ("spns_service_accounts", query_service_account_spns),
    ("spns_gmsa", query_gmsa_spns),
    ("sites", query_sites),
    ("subnets", query_subnets),
    ("ou_distribution", query_ou_distribution),
    ("stale_servers", query_stale_servers),
    ("domain_controllers", query_domain_controllers),
]


def run_all(session: ADSession, output_dir: Path) -> list[QueryResult]:
    output_dir.mkdir(parents=True, exist_ok=True)
    results: list[QueryResult] = []
    for name, fn in ALL_QUERIES:
        try:
            log.info("running AD query: %s", name)
            results.append(fn(session, output_dir))
        except Exception as e:
            log.exception("AD query %s failed", name)
            results.append(
                QueryResult(name=name, output=f"ad_{name}.csv",
                            status="failed", error=str(e))
            )
    return results


def _count_rows(path: Path) -> int:
    if not path.exists():
        return 0
    with open(path, encoding="utf-8-sig") as fh:
        return sum(1 for _ in fh) - 1  # subtract header
