"""Tests for agency structured-result envelope parsing."""

import pytest

from app.services.agency_result_envelope import parse_agency_result_envelope


pytestmark = [pytest.mark.unit, pytest.mark.agency]


def test_parse_valid_envelope_block_uses_summary_as_text_fallback():
    raw = """
```agency-result
{
  "version": "1.0",
  "intent": "research_report",
  "summary": "Research preview ready.",
  "payload": {
    "title": "Market scan"
  },
  "artifacts": [
    {
      "artifact_type": "research_report",
      "title": "Market scan"
    }
  ],
  "references": [
    {
      "source_title": "Source A",
      "source_id": "src-1",
      "support_summary": "Supports the conclusion."
    }
  ],
  "metrics": {
    "citation_count": 1
  }
}
```
""".strip()

    outcome = parse_agency_result_envelope(raw)

    assert outcome.found is True
    assert outcome.valid is True
    assert outcome.error is None
    assert outcome.text_response == "Research preview ready."
    assert outcome.envelope is not None
    assert outcome.envelope.intent == "research_report"


def test_parse_invalid_envelope_preserves_text_fallback():
    raw = """
The agent produced a malformed envelope.

```agency-result
{
  "version": "1.0",
  "intent": "not_supported",
  "summary": "Bad payload"
}
```
""".strip()

    outcome = parse_agency_result_envelope(raw)

    assert outcome.found is True
    assert outcome.valid is False
    assert outcome.envelope is None
    assert outcome.text_response.startswith("The agent produced a malformed envelope.")
    assert "intent" in (outcome.error or "")


def test_parse_text_only_response_keeps_original_text():
    raw = "Plain text only response from a legacy agency."

    outcome = parse_agency_result_envelope(raw)

    assert outcome.found is False
    assert outcome.valid is False
    assert outcome.envelope is None
    assert outcome.error is None
    assert outcome.text_response == raw
