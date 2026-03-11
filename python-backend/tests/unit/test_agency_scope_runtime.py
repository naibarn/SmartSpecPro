"""Regression tests for run-scoped agency retrieval-scope handling."""

import os

os.environ["DEBUG"] = "false"

from app.services.agency_service import AgencyService


def test_apply_retrieval_scope_instruction_appends_library_only_guidance():
    prompt = "Base system prompt."
    run_metadata = {
        "retrieval_scope": {
            "effectiveMode": "library_only",
        }
    }

    result = AgencyService._apply_retrieval_scope_instruction(prompt, run_metadata)

    assert "Base system prompt." in result
    assert "restricted to tenant-authorized library sources only" in result
    assert "Do not use web search" in result


def test_apply_retrieval_scope_instruction_leaves_prompt_unchanged_without_scope():
    prompt = "Base system prompt."

    result = AgencyService._apply_retrieval_scope_instruction(prompt, None)

    assert result == prompt
