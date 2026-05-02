"""Runtime kill switch for local Playwright/Chromium features."""

from __future__ import annotations

import os

from app.services.automation_exceptions import BrowserLaunchError

_FALSE_VALUES = {"0", "false", "no", "off", "disabled"}


def is_playwright_enabled() -> bool:
    """Return whether local Playwright-backed features may launch Chromium."""
    raw = os.getenv("SMARTSPEC_PLAYWRIGHT_ENABLED", "true")
    return raw.strip().lower() not in _FALSE_VALUES


def require_playwright_enabled() -> None:
    """Fail closed before importing or launching Playwright."""
    if not is_playwright_enabled():
        raise BrowserLaunchError("Playwright features are disabled by SMARTSPEC_PLAYWRIGHT_ENABLED=false")
