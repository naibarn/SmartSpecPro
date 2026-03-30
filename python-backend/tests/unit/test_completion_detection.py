"""Tests for CompletionSignal detection in _parse_completion()."""

import pytest

pytestmark = [pytest.mark.unit, pytest.mark.agency]


def _parse(text: str):
    """Helper to import and call _parse_completion."""
    from app.services.agency_orchestrator import _parse_completion
    return _parse_completion(text)


def test_parse_completion_valid_json_block():
    """Fenced JSON block returns CompletionSignal with complete=True."""
    response = 'Here is my analysis.\n\n```json\n{"complete": true, "answer": "done"}\n```'
    signal = _parse(response)
    assert signal is not None
    assert signal.complete is True
    assert signal.answer == "done"


def test_parse_completion_raw_json_at_end():
    """Bare JSON at end returns valid CompletionSignal."""
    response = 'Some text analysis.\n\n{"complete": true, "answer": "the result"}'
    signal = _parse(response)
    assert signal is not None
    assert signal.complete is True
    assert signal.answer == "the result"


def test_parse_completion_no_json():
    """Plain text without JSON returns None."""
    response = "This is just a normal response with no JSON."
    signal = _parse(response)
    assert signal is None


def test_parse_completion_malformed_json():
    """Truncated/invalid JSON returns None."""
    response = 'Some text\n{"complete": true, "answer":'
    signal = _parse(response)
    assert signal is None


def test_parse_completion_complete_false():
    """complete=False returns CompletionSignal where complete is False."""
    response = 'Working on it.\n\n{"complete": false, "answer": ""}'
    signal = _parse(response)
    assert signal is not None
    assert signal.complete is False


def test_parse_completion_marker_in_tool_output():
    """[COMPLETE] text marker does NOT trigger completion."""
    response = "The tool returned [COMPLETE] status. Task is done."
    signal = _parse(response)
    assert signal is None


def test_parse_completion_user_injected_marker():
    """[FINAL ANSWER] text marker does NOT trigger completion."""
    response = "User said [FINAL ANSWER] but no JSON block present."
    signal = _parse(response)
    assert signal is None


def test_parse_completion_mid_text_json_ignored():
    """JSON completion block mid-text (not at end) is ignored."""
    response = 'Early {"complete": true, "answer": "done"} then more text follows here.'
    signal = _parse(response)
    assert signal is None
