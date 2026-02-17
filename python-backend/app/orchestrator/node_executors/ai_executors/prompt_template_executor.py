"""Prompt Template Executor - Generate prompts from templates."""

import logging
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class PromptTemplateExecutor:
    """
    Generate prompts from templates with variable substitution.

    Supports multiple template formats:
    - mustache: {{variable}}
    - fstring: {variable}
    - jinja2: {{ variable }}
    """

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Render prompt template."""
        template = data.inputs.get("template", "")
        variables = data.inputs.get("variables", {})
        format_type = data.inputs.get("format", "mustache")

        if format_type == "mustache":
            result = self._render_mustache(template, variables)
        elif format_type == "fstring":
            result = self._render_fstring(template, variables)
        elif format_type == "jinja2":
            result = self._render_jinja2(template, variables)
        else:
            raise ValueError(f"Unknown format: {format_type}")

        return {
            "prompt": result,
            "template": template,
            "variables_used": list(variables.keys()),
            "token_estimate": self._estimate_tokens(result),
        }

    def _render_mustache(self, template: str, variables: dict) -> str:
        """Render Mustache template."""
        try:
            import chevron
            return chevron.render(template, variables)
        except ImportError:
            # Fallback: simple variable substitution
            result = template
            for key, value in variables.items():
                result = result.replace(f"{{{{{key}}}}}", str(value))
            return result

    def _render_fstring(self, template: str, variables: dict) -> str:
        """Render Python f-string style template."""
        return template.format(**variables)

    def _render_jinja2(self, template: str, variables: dict) -> str:
        """Render Jinja2 template."""
        from jinja2 import Template
        return Template(template).render(**variables)

    def _estimate_tokens(self, text: str) -> int:
        """Rough token estimation for budgeting."""
        return int(len(text.split()) * 1.3)  # Rough estimate
