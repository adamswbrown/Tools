"""Azure authentication using DefaultAzureCredential.

Supports:
- Azure CLI login (az login)
- Managed identity
- Service principal (via environment variables)
"""

from __future__ import annotations

import logging
from typing import Optional

from azure.identity import DefaultAzureCredential

logger = logging.getLogger(__name__)

_credential: Optional[DefaultAzureCredential] = None


class AzureAuthError(Exception):
    """Raised when Azure authentication fails."""


def get_credential() -> DefaultAzureCredential:
    """Return a cached DefaultAzureCredential instance.

    The credential is created once and reused. DefaultAzureCredential
    automatically tries multiple authentication methods in order:
    1. Environment variables (service principal)
    2. Managed identity
    3. Azure CLI
    4. Azure PowerShell
    5. Interactive browser (if available)

    Returns:
        An authenticated DefaultAzureCredential.

    Raises:
        AzureAuthError: If the credential cannot be created.
    """
    global _credential
    if _credential is not None:
        return _credential

    try:
        _credential = DefaultAzureCredential()
        logger.info("Azure credential initialized via DefaultAzureCredential")
        return _credential
    except Exception as exc:
        raise AzureAuthError(
            f"Failed to initialize Azure credentials: {exc}. "
            "Ensure you are logged in via 'az login', have a managed identity, "
            "or have set AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET."
        ) from exc


def get_access_token(scope: str = "https://management.azure.com/.default") -> str:
    """Obtain a bearer token for the Azure Resource Manager API.

    Args:
        scope: The OAuth scope to request. Defaults to the ARM scope.

    Returns:
        A bearer access token string.

    Raises:
        AzureAuthError: If the token cannot be obtained.
    """
    credential = get_credential()
    try:
        token = credential.get_token(scope)
        logger.debug("Obtained access token, expires at %s", token.expires_on)
        return token.token
    except Exception as exc:
        raise AzureAuthError(f"Failed to obtain access token: {exc}") from exc
