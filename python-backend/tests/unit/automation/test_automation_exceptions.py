"""Tests for the automation exception hierarchy."""

import pytest

from app.services.automation_exceptions import (
    AutomationError,
    BrowserCapacityError,
    BrowserLaunchError,
    CancellationRequestedError,
    DomainNotAllowedError,
    FeatureDisabledError,
    HealingExhaustedError,
    InsufficientCreditsError,
    PageLoadError,
    ScriptGenerationError,
    SelectorNotFoundError,
    SSRFBlockedError,
)

ALL_EXCEPTION_CLASSES = [
    SSRFBlockedError,
    DomainNotAllowedError,
    BrowserCapacityError,
    BrowserLaunchError,
    PageLoadError,
    SelectorNotFoundError,
    ScriptGenerationError,
    HealingExhaustedError,
    InsufficientCreditsError,
    FeatureDisabledError,
    CancellationRequestedError,
]


class TestExceptionHierarchy:
    def test_all_exceptions_extend_automation_error(self):
        assert issubclass(AutomationError, Exception)
        for cls in ALL_EXCEPTION_CLASSES:
            assert issubclass(cls, AutomationError), f"{cls.__name__} must extend AutomationError"

    def test_exception_stores_message_and_details(self):
        err = AutomationError("msg", details={"key": "val"})
        assert err.message == "msg"
        assert err.details == {"key": "val"}

    def test_exception_details_defaults_to_none(self):
        err = AutomationError("msg")
        assert err.details is None

    def test_str_includes_message(self):
        err = SSRFBlockedError("blocked")
        assert "blocked" in str(err)

    @pytest.mark.parametrize(
        "cls,keyword",
        [
            (SSRFBlockedError, "SSRF"),
            (DomainNotAllowedError, "domain"),
            (BrowserCapacityError, "capacity"),
            (InsufficientCreditsError, "credits"),
            (FeatureDisabledError, "disabled"),
        ],
    )
    def test_specific_exceptions_have_correct_default_messages(self, cls, keyword):
        err = cls()
        assert keyword.lower() in str(err).lower()

    def test_all_eleven_classes_exist(self):
        import app.services.automation_exceptions as mod

        expected = [
            "SSRFBlockedError",
            "DomainNotAllowedError",
            "BrowserCapacityError",
            "BrowserLaunchError",
            "PageLoadError",
            "SelectorNotFoundError",
            "ScriptGenerationError",
            "HealingExhaustedError",
            "InsufficientCreditsError",
            "FeatureDisabledError",
            "CancellationRequestedError",
        ]
        for name in expected:
            assert hasattr(mod, name), f"Module missing {name}"
