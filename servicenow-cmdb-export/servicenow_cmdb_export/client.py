"""Thin ServiceNow Table API client.

Auth: HTTP Basic via env vars (SNOW_USER / SNOW_PASSWORD). Instance from
SNOW_INSTANCE (e.g. "acme.service-now.com" or full https URL).
"""
from __future__ import annotations

import os
from typing import Iterable, Iterator
from urllib.parse import urljoin

import requests


class ServiceNowError(RuntimeError):
    pass


class ServiceNowClient:
    DEFAULT_PAGE_SIZE = 1000

    def __init__(
        self,
        instance: str | None = None,
        user: str | None = None,
        password: str | None = None,
        timeout: int = 60,
    ) -> None:
        instance = instance or os.environ.get("SNOW_INSTANCE")
        user = user or os.environ.get("SNOW_USER")
        password = password or os.environ.get("SNOW_PASSWORD")
        if not instance:
            raise ServiceNowError("SNOW_INSTANCE not set")
        if not user or not password:
            raise ServiceNowError("SNOW_USER and SNOW_PASSWORD must be set")

        if not instance.startswith("http"):
            instance = f"https://{instance}"
        self.base_url = instance.rstrip("/") + "/"
        self.timeout = timeout
        self._session = requests.Session()
        self._session.auth = (user, password)
        self._session.headers.update(
            {"Accept": "application/json", "Content-Type": "application/json"}
        )

    def table(
        self,
        name: str,
        query: str | None = None,
        fields: Iterable[str] | None = None,
        page_size: int = DEFAULT_PAGE_SIZE,
    ) -> Iterator[dict]:
        """Yield rows from a ServiceNow table, paging through results."""
        url = urljoin(self.base_url, f"api/now/table/{name}")
        params: dict[str, str] = {
            "sysparm_limit": str(page_size),
            "sysparm_display_value": "all",
            "sysparm_exclude_reference_link": "true",
        }
        if query:
            params["sysparm_query"] = query
        if fields:
            params["sysparm_fields"] = ",".join(fields)

        offset = 0
        while True:
            params["sysparm_offset"] = str(offset)
            resp = self._session.get(url, params=params, timeout=self.timeout)
            if resp.status_code >= 400:
                raise ServiceNowError(
                    f"GET {name} failed: {resp.status_code} {resp.text[:300]}"
                )
            batch = resp.json().get("result", [])
            if not batch:
                return
            for row in batch:
                yield row
            if len(batch) < page_size:
                return
            offset += page_size

    @staticmethod
    def display(field) -> str:
        """Pull display_value from a ServiceNow field that may be a dict or scalar."""
        if isinstance(field, dict):
            return field.get("display_value") or field.get("value") or ""
        return field or ""

    @staticmethod
    def value(field) -> str:
        if isinstance(field, dict):
            return field.get("value") or ""
        return field or ""
