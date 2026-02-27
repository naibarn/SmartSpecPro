"""Tests for PII redaction."""
import pytest

pytestmark = [pytest.mark.unit, pytest.mark.agency]


class TestRedactPII:
    """Tests for redact_pii() function."""

    def test_redacts_email(self):
        """Redacts email addresses: user@example.com -> [EMAIL]."""
        from app.services.agency_pii import redact_pii

        content = "Contact me at user@example.com for details."
        result, was_redacted = redact_pii(content)
        assert "[EMAIL]" in result
        assert "user@example.com" not in result
        assert was_redacted is True

    def test_redacts_phone(self):
        """Redacts phone numbers: +1-555-123-4567 -> [PHONE]."""
        from app.services.agency_pii import redact_pii

        content = "Call me at +1-555-123-4567."
        result, was_redacted = redact_pii(content)
        assert "[PHONE]" in result
        assert "+1-555-123-4567" not in result
        assert was_redacted is True

    def test_redacts_ssn(self):
        """Redacts SSN patterns: 123-45-6789 -> [SSN]."""
        from app.services.agency_pii import redact_pii

        content = "SSN is 123-45-6789."
        result, was_redacted = redact_pii(content)
        assert "[SSN]" in result
        assert "123-45-6789" not in result
        assert was_redacted is True

    def test_does_not_corrupt_json(self):
        """Does NOT corrupt JSON objects in content."""
        from app.services.agency_pii import redact_pii

        content = '{"key": "value", "count": 42}'
        result, was_redacted = redact_pii(content)
        assert result == content
        assert was_redacted is False

    def test_does_not_corrupt_urls(self):
        """Does NOT corrupt URLs."""
        from app.services.agency_pii import redact_pii

        content = "Visit https://api.example.com/v2/resource?id=123"
        result, was_redacted = redact_pii(content)
        assert "https://api.example.com/v2/resource?id=123" in result

    def test_does_not_corrupt_version_numbers(self):
        """Does NOT corrupt version numbers like v3.12.0."""
        from app.services.agency_pii import redact_pii

        content = "Upgrade to Python v3.12.0"
        result, was_redacted = redact_pii(content)
        assert "v3.12.0" in result

    def test_does_not_corrupt_uuids(self):
        """Does NOT corrupt UUID strings."""
        from app.services.agency_pii import redact_pii

        content = "ID: 550e8400-e29b-41d4-a716-446655440000"
        result, was_redacted = redact_pii(content)
        assert "550e8400-e29b-41d4-a716-446655440000" in result

    def test_returns_true_when_pii_found(self):
        """Returns (content, was_redacted=True) when PII is found."""
        from app.services.agency_pii import redact_pii

        _, was_redacted = redact_pii("Email: test@example.com")
        assert was_redacted is True

    def test_returns_false_when_no_pii(self):
        """Returns (content, was_redacted=False) when no PII present."""
        from app.services.agency_pii import redact_pii

        content = "This is a normal sentence with no personal data."
        result, was_redacted = redact_pii(content)
        assert result == content
        assert was_redacted is False

    def test_redacts_phone_parentheses_format(self):
        """Redacts phone in (555) 123-4567 format."""
        from app.services.agency_pii import redact_pii

        content = "Call (555) 123-4567 for info."
        result, was_redacted = redact_pii(content)
        assert "[PHONE]" in result
        assert "(555) 123-4567" not in result
        assert was_redacted is True

    def test_redacts_multiple_pii_types(self):
        """Redacts mixed PII types in one string."""
        from app.services.agency_pii import redact_pii

        content = "Email user@test.com, SSN 123-45-6789, phone +1-555-123-4567."
        result, was_redacted = redact_pii(content)
        assert "[EMAIL]" in result
        assert "[SSN]" in result
        assert "[PHONE]" in result
        assert was_redacted is True

    def test_empty_string(self):
        """Empty string returns empty, no redaction."""
        from app.services.agency_pii import redact_pii

        result, was_redacted = redact_pii("")
        assert result == ""
        assert was_redacted is False
