"""Security-focused tests for the Kilo job manager command validation."""

import pytest

from app.kilo.job_manager import _validate_command


class TestValidateCommand:
    def test_accepts_simple_workflow_command(self):
        # Minimal valid command: starts with '/' and targets a .md workflow
        _validate_command("/my-workflow.md")

    def test_accepts_command_with_arguments(self):
        _validate_command("/my-workflow.md --flag value")

    @pytest.mark.parametrize("bad_cmd", [
        "my-workflow.md",            # does not start with /
        "/not-markdown",             # first token does not end with .md
    ])
    def test_rejects_invalid_structure(self, bad_cmd: str):
        with pytest.raises(ValueError):
            _validate_command(bad_cmd)

    @pytest.mark.parametrize("token", [";", "|", "&", "`", "$(", "${", ">", "<"])
    def test_rejects_disallowed_tokens(self, token: str):
        cmd = f"/my-workflow.md echo test {token} rm -rf /"
        with pytest.raises(ValueError):
            _validate_command(cmd)
