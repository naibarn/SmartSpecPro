"""Security controls for browser automation tool outputs.

Tests:
- HTML script tags stripped from extracted text (using bleach)
- Tool outputs sanitized before function_call_output
- fill action on input[type=password] -> value not in audit log
- fill action on input[name*=token] -> value not in audit log
- fill action on normal input -> value preserved in audit log
"""
import pytest

from app.services.tools.browser_tool import redact_action_for_audit, sanitize_tool_output


class TestSanitizeToolOutput:
    """Tests for sanitize_tool_output() — HTML stripping for prompt injection prevention."""

    def test_strips_script_tags(self):
        raw = "Hello <script>alert('xss')</script> World"
        result = sanitize_tool_output(raw)
        assert "<script>" not in result
        assert "alert" not in result
        assert "Hello" in result
        assert "World" in result

    def test_strips_img_onerror(self):
        raw = '<img onerror="evil()" src="x"> Some text'
        result = sanitize_tool_output(raw)
        assert "onerror" not in result
        assert "evil" not in result
        assert "Some text" in result

    def test_strips_iframe_and_object(self):
        raw = '<iframe src="evil.com"></iframe><object data="bad"></object> Safe content'
        result = sanitize_tool_output(raw)
        assert "<iframe" not in result
        assert "<object" not in result
        assert "Safe content" in result

    def test_strips_style_tags(self):
        raw = "<style>body{display:none}</style> Visible text"
        result = sanitize_tool_output(raw)
        assert "<style>" not in result
        assert "Visible text" in result

    def test_preserves_plain_text(self):
        raw = "This is just plain text with no HTML"
        result = sanitize_tool_output(raw)
        assert result == raw

    def test_truncates_long_output(self):
        raw = "A" * 60_000
        result = sanitize_tool_output(raw)
        assert len(result) <= 50_001  # 50k + truncation notice allowance

    def test_handles_empty_string(self):
        assert sanitize_tool_output("") == ""

    def test_strips_all_html_tags(self):
        raw = "<b>bold</b> <i>italic</i> <p>paragraph</p>"
        result = sanitize_tool_output(raw)
        assert "<b>" not in result
        assert "<i>" not in result
        assert "<p>" not in result
        assert "bold" in result
        assert "italic" in result
        assert "paragraph" in result


class TestRedactActionForAudit:
    """Tests for redact_action_for_audit() — sensitive field value redaction."""

    def test_password_input_redacted(self):
        action = {"type": "fill", "selector": "input[type=password]", "value": "s3cret"}
        result = redact_action_for_audit(action)
        assert result["value"] == "[REDACTED]"
        # Original unchanged
        assert action["value"] == "s3cret"

    def test_password_type_quoted_redacted(self):
        action = {"type": "fill", "selector": 'input[type="password"]', "value": "s3cret"}
        result = redact_action_for_audit(action)
        assert result["value"] == "[REDACTED]"

    def test_token_name_redacted(self):
        action = {"type": "fill", "selector": "input[name=api_token]", "value": "tok_abc123"}
        result = redact_action_for_audit(action)
        assert result["value"] == "[REDACTED]"

    def test_secret_name_redacted(self):
        action = {"type": "fill", "selector": "input[name=client_secret]", "value": "sec_xyz"}
        result = redact_action_for_audit(action)
        assert result["value"] == "[REDACTED]"

    def test_key_name_redacted(self):
        action = {"type": "fill", "selector": "input[name=api_key]", "value": "key_123"}
        result = redact_action_for_audit(action)
        assert result["value"] == "[REDACTED]"

    def test_apikey_name_redacted(self):
        action = {"type": "fill", "selector": "input[name=apikey]", "value": "key_123"}
        result = redact_action_for_audit(action)
        assert result["value"] == "[REDACTED]"

    def test_credential_name_redacted(self):
        action = {"type": "fill", "selector": "input[name=credential]", "value": "cred_123"}
        result = redact_action_for_audit(action)
        assert result["value"] == "[REDACTED]"

    def test_password_id_redacted(self):
        action = {"type": "fill", "selector": "#password-field", "value": "s3cret"}
        result = redact_action_for_audit(action)
        assert result["value"] == "[REDACTED]"

    def test_token_id_redacted(self):
        action = {"type": "fill", "selector": "input[id=auth_token]", "value": "tok_abc"}
        result = redact_action_for_audit(action)
        assert result["value"] == "[REDACTED]"

    def test_normal_input_preserved(self):
        action = {"type": "fill", "selector": "input[name=username]", "value": "john"}
        result = redact_action_for_audit(action)
        assert result["value"] == "john"

    def test_email_input_preserved(self):
        action = {"type": "fill", "selector": "input[name=email]", "value": "john@example.com"}
        result = redact_action_for_audit(action)
        assert result["value"] == "john@example.com"

    def test_click_action_unchanged(self):
        action = {"type": "click", "selector": "button.submit"}
        result = redact_action_for_audit(action)
        assert result == action

    def test_type_action_password_redacted(self):
        action = {"type": "type", "selector": "input[type=password]", "value": "s3cret"}
        result = redact_action_for_audit(action)
        assert result["value"] == "[REDACTED]"

    def test_returns_shallow_copy(self):
        action = {"type": "fill", "selector": "input[name=username]", "value": "john"}
        result = redact_action_for_audit(action)
        assert result is not action
        assert result == action

    def test_secret_id_redacted(self):
        action = {"type": "fill", "selector": "input[id=secret_input]", "value": "mysecret"}
        result = redact_action_for_audit(action)
        assert result["value"] == "[REDACTED]"
