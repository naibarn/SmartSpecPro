"""Image Generation node executor."""
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class ImageExecutor:
    """Executor for Image Generation nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict:
        """Execute image generation."""
        # TODO: Integrate with MediaTaskService
        prompt = data.inputs.get("prompt", "")

        return {
            "imageUrl": f"https://placeholder.com/generated-image.png",
            "metadata": {
                "provider": data.config.get("provider", "openai"),
                "size": data.config.get("size", "1024x1024"),
                "prompt": prompt,
            },
        }
