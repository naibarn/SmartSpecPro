"""Custom exception hierarchy for the Automation Copilot pipeline."""

from __future__ import annotations


class AutomationError(Exception):
    """Base exception for all automation-related errors."""

    def __init__(self, message: str = "", details: dict | None = None) -> None:
        self.message = message
        self.details = details
        super().__init__(message)

    def __str__(self) -> str:
        return self.message


class SSRFBlockedError(AutomationError):
    def __init__(self, message: str = "URL blocked by SSRF protection", details: dict | None = None) -> None:
        super().__init__(message, details)


class DomainNotAllowedError(AutomationError):
    def __init__(self, message: str = "Domain not in tenant allowed list", details: dict | None = None) -> None:
        super().__init__(message, details)


class BrowserCapacityError(AutomationError):
    def __init__(self, message: str = "Browser capacity limit reached", details: dict | None = None) -> None:
        super().__init__(message, details)


class BrowserLaunchError(AutomationError):
    pass


class PageLoadError(AutomationError):
    pass


class SelectorNotFoundError(AutomationError):
    pass


class ScriptGenerationError(AutomationError):
    pass


class HealingExhaustedError(AutomationError):
    pass


class InsufficientCreditsError(AutomationError):
    def __init__(self, message: str = "Insufficient credits for this operation", details: dict | None = None) -> None:
        super().__init__(message, details)


class FeatureDisabledError(AutomationError):
    def __init__(self, message: str = "Automation Copilot feature is disabled", details: dict | None = None) -> None:
        super().__init__(message, details)


class CancellationRequestedError(AutomationError):
    pass


class BrowserPolicyDeniedError(AutomationError):
    pass
