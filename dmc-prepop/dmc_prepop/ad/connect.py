"""LDAP connection helper for Active Directory.

Default: LDAPS to a domain controller, current-user (Kerberos) auth via SASL
GSSAPI when available, falling back to simple bind with explicit credentials.

Any authenticated domain user has read access to the attributes this module
queries — computer objects, SPNs, sites, subnets are world-readable in stock
AD. No elevated rights required.
"""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator

from ldap3 import (
    ALL,
    KERBEROS,
    SAFE_SYNC,
    SIMPLE,
    Connection,
    Server,
    SUBTREE,
)
from ldap3.core.exceptions import LDAPException


class ADError(RuntimeError):
    pass


@dataclass(frozen=True)
class ADSpec:
    server: str  # DC FQDN or IP, optionally with :port
    bind_user: str | None = None  # e.g. "CORP\\reader" or "reader@corp.local"
    bind_password: str | None = None
    use_ldaps: bool = True
    use_gc: bool = False  # Global Catalog (port 3268/3269)
    auth: str = "simple"  # "simple" | "kerberos"
    base_dn: str | None = None  # auto-detected from rootDSE if None
    page_size: int = 1000

    def port(self) -> int:
        if self.use_gc:
            return 3269 if self.use_ldaps else 3268
        return 636 if self.use_ldaps else 389


@contextmanager
def open_session(spec: ADSpec) -> Iterator["ADSession"]:
    server = Server(
        spec.server,
        port=spec.port(),
        use_ssl=spec.use_ldaps,
        get_info=ALL,
    )
    auth_kwargs: dict = {}
    if spec.auth == "kerberos":
        auth_kwargs["authentication"] = SASL  # type: ignore[name-defined]
        auth_kwargs["sasl_mechanism"] = KERBEROS
    else:
        if not spec.bind_user or not spec.bind_password:
            raise ADError("auth=simple requires bind_user and bind_password")
        auth_kwargs["authentication"] = SIMPLE
        auth_kwargs["user"] = spec.bind_user
        auth_kwargs["password"] = spec.bind_password

    try:
        conn = Connection(
            server,
            client_strategy=SAFE_SYNC,
            auto_bind=True,
            receive_timeout=60,
            **auth_kwargs,
        )
    except LDAPException as e:
        raise ADError(f"LDAP bind failed: {e}") from e

    base_dn = spec.base_dn or _detect_base_dn(server)
    if not base_dn:
        raise ADError("Could not determine base DN from rootDSE")

    try:
        yield ADSession(conn=conn, server=server, base_dn=base_dn, spec=spec)
    finally:
        try:
            conn.unbind()
        except Exception:
            pass


def _detect_base_dn(server: Server) -> str | None:
    info = getattr(server, "info", None)
    if not info:
        return None
    contexts = getattr(info, "naming_contexts", None) or []
    if isinstance(contexts, str):
        contexts = [contexts]
    domain_dns = [c for c in contexts if c.upper().startswith("DC=")]
    if not domain_dns:
        return None
    domain_dns.sort(key=len)
    return domain_dns[0]


@dataclass
class ADSession:
    conn: Connection
    server: Server
    base_dn: str
    spec: ADSpec

    def search(
        self,
        search_filter: str,
        attributes: list[str],
        base_dn: str | None = None,
    ) -> Iterator[dict]:
        """Paged search yielding attribute dicts."""
        try:
            generator = self.conn.extend.standard.paged_search(
                search_base=base_dn or self.base_dn,
                search_filter=search_filter,
                search_scope=SUBTREE,
                attributes=attributes,
                paged_size=self.spec.page_size,
                generator=True,
            )
        except LDAPException as e:
            raise ADError(f"LDAP search failed: {e}") from e
        for entry in generator:
            if not isinstance(entry, dict):
                continue
            if entry.get("type") != "searchResEntry":
                continue
            yield entry

    @property
    def configuration_dn(self) -> str:
        return f"CN=Configuration,{self.base_dn}"


# Late import to keep ldap3 SASL module optional at import time.
try:
    from ldap3 import SASL
except Exception:  # pragma: no cover
    SASL = None  # type: ignore[assignment]
