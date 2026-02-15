"""
Google OAuth scope verification guard.

Checks that a user's granted OAuth scopes include the required scope
before making Google API calls. Prevents scope-mismatch errors.
"""

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.oauth import OAuthConnection

logger = logging.getLogger(__name__)

DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly"
DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
DOCS_READONLY_SCOPE = "https://www.googleapis.com/auth/documents.readonly"
SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"


class ScopeMissingError(Exception):
    """Raised when the user's OAuth grant does not include a required scope."""

    def __init__(self, required_scope: str, granted_scopes: list[str]):
        self.required_scope = required_scope
        self.granted_scopes = granted_scopes
        super().__init__(
            f"Required scope '{required_scope}' not in granted scopes: {granted_scopes}"
        )


async def verify_scopes(
    user_id: int,
    required_scopes: list[str],
    db: AsyncSession,
) -> None:
    """
    Verify that the user's Google OAuth connection has the required scopes.

    Raises ScopeMissingError if any required scope is not granted.
    Raises ValueError if no Google connection exists.
    """
    result = await db.execute(
        select(OAuthConnection).where(
            OAuthConnection.user_id == user_id,
            OAuthConnection.provider == "google",
        )
    )
    conn = result.scalar_one_or_none()

    if not conn:
        raise ValueError("No Google connection found for this user")

    granted = conn.scopes.split(",") if conn.scopes else []

    for scope in required_scopes:
        if scope not in granted:
            raise ScopeMissingError(scope, granted)


def has_scope(scopes_str: Optional[str], required: str) -> bool:
    """Quick check if a scope string contains the required scope."""
    if not scopes_str:
        return False
    return required in scopes_str.split(",")
