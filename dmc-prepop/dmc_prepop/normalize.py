"""Hostname normaliser shared across SCCM/SCOM/SCOM DW outputs.

Lowercase, strip whitespace, strip trailing '$' (AD computer accounts), strip
domain suffix to NetBIOS form. The same transform is applied everywhere so
downstream joins work across sources.
"""
from __future__ import annotations


def normalise_hostname(value) -> str:
    if value is None:
        return ""
    s = str(value).strip().lower()
    if not s:
        return ""
    if s.endswith("$"):
        s = s[:-1]
    if "." in s:
        s = s.split(".", 1)[0]
    return s
