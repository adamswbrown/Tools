"""CMDB extraction and joining.

Strategy:
- Pull servers (cmdb_ci_server) and clients (cmdb_ci_pc_hardware) separately so
  device_type is unambiguous.
- Pull cmdb_ci_business_app and cmdb_ci_environment.
- Pull cmdb_rel_ci once, indexed by parent and child sys_id, so we can resolve:
    server  -> business_app  (via "Runs on::Runs" / "Depends on::Used by")
    server  -> environment   (via any rel where the other side is an environment CI)
    client  -> environment   (same)
- For clients without a CMDB-modeled app link, fall back to assigned_to user ->
  apps where that user is business_owner / managed_by / owned_by.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable

from servicenow_cmdb_export.client import ServiceNowClient

SERVER_TABLE = "cmdb_ci_server"
CLIENT_TABLE = "cmdb_ci_pc_hardware"
APP_TABLE = "cmdb_ci_business_app"
ENV_TABLE = "cmdb_ci_environment"
REL_TABLE = "cmdb_rel_ci"
USER_TABLE = "sys_user"

# Relationship type display values that connect a CI to its hosted app.
APP_REL_TYPES = {"Runs on::Runs", "Depends on::Used by", "Hosted on::Hosts"}


@dataclass
class Row:
    device_type: str
    name: str
    fqdn: str
    environment: str
    assigned_user: str
    assigned_user_email: str
    business_app: str
    app_owner: str
    criticality: str
    support_group: str

    @staticmethod
    def headers() -> list[str]:
        return [
            "device_type",
            "name",
            "fqdn",
            "environment",
            "assigned_user",
            "assigned_user_email",
            "business_app",
            "app_owner",
            "criticality",
            "support_group",
        ]

    def as_list(self) -> list[str]:
        return [getattr(self, h) for h in self.headers()]


@dataclass
class CMDBSnapshot:
    servers: list[dict] = field(default_factory=list)
    clients: list[dict] = field(default_factory=list)
    apps_by_id: dict[str, dict] = field(default_factory=dict)
    envs_by_id: dict[str, dict] = field(default_factory=dict)
    users_by_id: dict[str, dict] = field(default_factory=dict)
    # parent_sys_id -> list of (rel_type_display, child_sys_id, child_class)
    rels_by_parent: dict[str, list[tuple[str, str, str]]] = field(default_factory=dict)
    rels_by_child: dict[str, list[tuple[str, str, str]]] = field(default_factory=dict)
    # sys_user.sys_id -> set of business_app sys_ids the user owns
    apps_by_owner: dict[str, set[str]] = field(default_factory=dict)


def fetch_snapshot(
    client: ServiceNowClient,
    device_filter: str = "all",
    extra_query: str | None = None,
) -> CMDBSnapshot:
    snap = CMDBSnapshot()
    disp = ServiceNowClient.display
    val = ServiceNowClient.value

    if device_filter in ("all", "server"):
        snap.servers = list(client.table(SERVER_TABLE, query=extra_query))
    if device_filter in ("all", "client"):
        snap.clients = list(client.table(CLIENT_TABLE, query=extra_query))

    for app in client.table(APP_TABLE):
        snap.apps_by_id[val(app.get("sys_id"))] = app
        owner_id = val(app.get("business_owner")) or val(app.get("managed_by")) or val(app.get("owned_by"))
        if owner_id:
            snap.apps_by_owner.setdefault(owner_id, set()).add(val(app.get("sys_id")))

    for env in client.table(ENV_TABLE):
        snap.envs_by_id[val(env.get("sys_id"))] = env

    # Collect user sys_ids referenced as assigned_to so we can resolve emails.
    user_ids: set[str] = set()
    for ci in (*snap.servers, *snap.clients):
        uid = val(ci.get("assigned_to"))
        if uid:
            user_ids.add(uid)
    if user_ids:
        # Chunk the IN clause to avoid URL length limits.
        ids = list(user_ids)
        for i in range(0, len(ids), 200):
            chunk = ids[i : i + 200]
            q = "sys_idIN" + ",".join(chunk)
            for u in client.table(USER_TABLE, query=q, fields=["sys_id", "name", "email"]):
                snap.users_by_id[val(u.get("sys_id"))] = u

    for rel in client.table(REL_TABLE, fields=["parent", "child", "type"]):
        parent = val(rel.get("parent"))
        child = val(rel.get("child"))
        rel_type = disp(rel.get("type"))
        # Class hint isn't on the rel row directly — leave blank; we look up later.
        snap.rels_by_parent.setdefault(parent, []).append((rel_type, child, ""))
        snap.rels_by_child.setdefault(child, []).append((rel_type, parent, ""))
    return snap


def _env_for_ci(snap: CMDBSnapshot, ci_sys_id: str) -> str:
    disp = ServiceNowClient.display
    for _rel_type, other_id, _ in snap.rels_by_parent.get(ci_sys_id, []):
        env = snap.envs_by_id.get(other_id)
        if env:
            return disp(env.get("name"))
    for _rel_type, other_id, _ in snap.rels_by_child.get(ci_sys_id, []):
        env = snap.envs_by_id.get(other_id)
        if env:
            return disp(env.get("name"))
    return ""


def _apps_for_server(snap: CMDBSnapshot, ci_sys_id: str) -> list[dict]:
    apps: list[dict] = []
    seen: set[str] = set()
    for rel_type, other_id, _ in snap.rels_by_parent.get(ci_sys_id, []):
        if rel_type in APP_REL_TYPES and other_id in snap.apps_by_id and other_id not in seen:
            apps.append(snap.apps_by_id[other_id])
            seen.add(other_id)
    for rel_type, other_id, _ in snap.rels_by_child.get(ci_sys_id, []):
        if rel_type in APP_REL_TYPES and other_id in snap.apps_by_id and other_id not in seen:
            apps.append(snap.apps_by_id[other_id])
            seen.add(other_id)
    return apps


def _apps_for_client(
    snap: CMDBSnapshot, ci_sys_id: str, assigned_user_id: str
) -> list[dict]:
    direct = _apps_for_server(snap, ci_sys_id)
    if direct:
        return direct
    # Fallback: assigned user's owned apps.
    if not assigned_user_id:
        return []
    return [snap.apps_by_id[a] for a in snap.apps_by_owner.get(assigned_user_id, set())]


def build_rows(
    snap: CMDBSnapshot, max_apps_per_user: int = 10
) -> Iterable[Row]:
    disp = ServiceNowClient.display
    val = ServiceNowClient.value

    def emit(ci: dict, device_type: str):
        sys_id = val(ci.get("sys_id"))
        name = disp(ci.get("name"))
        fqdn = disp(ci.get("fqdn")) or disp(ci.get("dns_domain"))
        env = _env_for_ci(snap, sys_id)
        user_id = val(ci.get("assigned_to"))
        user = snap.users_by_id.get(user_id, {})
        assigned_user = disp(user.get("name")) or disp(ci.get("assigned_to"))
        assigned_email = disp(user.get("email"))
        support_group = disp(ci.get("support_group"))

        apps = (
            _apps_for_server(snap, sys_id)
            if device_type == "server"
            else _apps_for_client(snap, sys_id, user_id)
        )
        if max_apps_per_user and len(apps) > max_apps_per_user:
            apps = apps[:max_apps_per_user]

        if not apps:
            yield Row(
                device_type=device_type,
                name=name,
                fqdn=fqdn,
                environment=env,
                assigned_user=assigned_user,
                assigned_user_email=assigned_email,
                business_app="",
                app_owner="",
                criticality="",
                support_group=support_group,
            )
            return

        for app in apps:
            yield Row(
                device_type=device_type,
                name=name,
                fqdn=fqdn,
                environment=env,
                assigned_user=assigned_user,
                assigned_user_email=assigned_email,
                business_app=disp(app.get("name")),
                app_owner=disp(app.get("business_owner")) or disp(app.get("managed_by")),
                criticality=disp(app.get("business_criticality")),
                support_group=support_group,
            )

    for ci in snap.servers:
        yield from emit(ci, "server")
    for ci in snap.clients:
        yield from emit(ci, "client")
