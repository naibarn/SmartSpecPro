"""RAG Query node executor."""
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


class RAGExecutor:
    """Executor for RAG Query nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict:
        """Execute RAG query."""
        # TODO: Integrate with HybridRAG service
        query = data.inputs.get("query", "")

        return {
            "documents": [
                {"text": "Document 1 content", "score": 0.95},
                {"text": "Document 2 content", "score": 0.88},
            ],
            "context": "Document 1 content\n\nDocument 2 content",
            "metadata": {"total_results": 2, "search_mode": "hybrid"},
        }
