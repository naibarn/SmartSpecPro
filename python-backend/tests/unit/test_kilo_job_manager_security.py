"""Security-focused tests for the Kilo job manager command validation."""

import pytest

from app.kilo.job_manager import DEFAULT_WORKFLOW, _validate_command


class TestValidateCommand:
    def test_accepts_simple_workflow_command(self):
        # Minimal valid command: starts with '/' and targets a .md workflow
        _validate_command("/my-workflow.md")

    def test_accepts_command_with_arguments(self):
        _validate_command("/my-workflow.md --flag value")

    def test_routes_natural_language_to_default_copilot(self):
        command = "my-workflow.md"

        assert _validate_command(command) == f'{DEFAULT_WORKFLOW} "{command}"'

    def test_adds_markdown_extension_to_workflow_command(self):
        assert _validate_command("/not-markdown") == "/not-markdown.md"

    @pytest.mark.parametrize("token", [";", "|", "&", "`", "$(", "${", ">", "<"])
    def test_rejects_disallowed_tokens(self, token: str):
        cmd = f"/my-workflow.md echo test {token} rm -rf /"
        with pytest.raises(ValueError):
            _validate_command(cmd)
