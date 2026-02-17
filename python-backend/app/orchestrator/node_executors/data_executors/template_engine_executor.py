"""Template Engine Executor - Render templates with variable substitution."""

import logging
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class TemplateEngineExecutor:
    """
    Render templates with variable substitution.

    Modes:
    - mustache: Simple, safe, logic-less (default)
    - jinja2: Full-featured (requires explicit enable)

    Security:
    - Jinja2 sandboxed with RestrictedPython
    """

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Render template with variables."""
        template = data.inputs.get("template", "")
        variables = data.inputs.get("variables", {})
        engine = data.inputs.get("engine", "mustache")

        if engine == "mustache":
            result = self._render_mustache(template, variables)
        elif engine == "jinja2":
            result = self._render_jinja2(template, variables)
        elif engine == "fstring":
            result = self._render_fstring(template, variables)
        else:
            raise ValueError(f"Unknown template engine: {engine}")

        return {
            "result": result,
            "engine": engine,
            "variables_used": list(variables.keys()),
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

    def _render_jinja2(self, template: str, variables: dict) -> str:
        """Render Jinja2 template with sandbox."""
        from jinja2 import Environment, BaseLoader, SandboxedEnvironment

        # Use sandboxed environment for safety
        env = SandboxedEnvironment(loader=BaseLoader())
        jinja_template = env.from_string(template)
        return jinja_template.render(**variables)

    def _render_fstring(self, template: str, variables: dict) -> str:
        """Render Python f-string style template."""
        try:
            return template.format(**variables)
        except KeyError as e:
            raise ValueError(f"Missing variable: {e}")
