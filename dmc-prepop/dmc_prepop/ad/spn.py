"""SPN parsing and service-class workload classification.

SPN form: <serviceClass>/<host>[:<port|service>][/<servicename>]

The classification table below mirrors the spec's SPN reference. The 'host'
SPN class is intentionally tagged 'ignore' — every machine has it, so it adds
no signal.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ParsedSPN:
    raw: str
    service_class: str
    service_target: str
    service_port: str | None
    service_name: str | None


def parse_spn(spn: str) -> ParsedSPN:
    raw = spn or ""
    parts = raw.split("/", 2)
    service_class = parts[0] if parts else ""
    service_target = parts[1] if len(parts) > 1 else ""
    service_name = parts[2] if len(parts) > 2 else None

    port: str | None = None
    if ":" in service_target:
        host, _, suffix = service_target.rpartition(":")
        if suffix.isdigit():
            port = suffix
            service_target = host
        else:
            # e.g. MSSQLSvc/host:instance — leave port None, suffix is named instance
            port = None
    return ParsedSPN(
        raw=raw,
        service_class=service_class,
        service_target=service_target,
        service_port=port,
        service_name=service_name,
    )


WORKLOAD_BY_CLASS: dict[str, str] = {
    "MSSQLSvc": "SQL Server",
    "HTTP": "Web (IIS / SharePoint / web app)",
    "exchangeMDB": "Exchange",
    "exchangeRFR": "Exchange",
    "SMTPSVC": "Exchange",
    "TERMSRV": "Terminal Services / RDS",
    "WSMAN": "WinRM endpoint",
    "host": "ignore",
    "ldap": "Domain Controller",
    "GC": "Domain Controller",
    "kadmin": "Domain Controller",
    "DNS": "Domain Controller",
    "MSOMHSvc": "SCOM",
    "MSOMSdkSvc": "SCOM",
    "Hyper-V Replica Service": "Hyper-V",
    "MSServerClusterMgmtAPI": "Failover cluster",
    "IMAP": "Mail",
    "POP": "Mail",
    "SMTP": "Mail",
    "ftp": "FTP",
    "cifs": "File server",
    "vmrc": "VMware management",
}


def workload_for(service_class: str) -> str:
    return WORKLOAD_BY_CLASS.get(service_class, "")
