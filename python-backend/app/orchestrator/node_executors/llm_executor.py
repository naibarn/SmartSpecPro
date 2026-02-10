"""LLM Call node executor."""
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class LLMExecutor:
    """Executor for LLM Call nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict:
        """Execute LLM call."""
        # TODO: Integrate with existing LLM Gateway
        # For now, return stub response
        prompt = data.inputs.get("prompt", "")
        model = data.config.get("model", "gpt-4o-mini")

        return {
            "response": f"[LLM Response to: {prompt[:50]}...]",
            "usage": {
                "prompt_tokens": len(prompt.split()),
                "completion_tokens": 10,
                "total_tokens": len(prompt.split()) + 10,
            },
        }
