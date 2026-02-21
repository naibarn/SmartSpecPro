"""Write to Console Executor - emit a debug/info message to the workflow console panel."""
import json
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

# Cap message size to prevent oversized SSE payloads
_MAX_MESSAGE_BYTES = 10_000


class WriteToConsoleExecutor:
    """Executor for write_to_console nodes.

    Returns the message and level as output so the frontend ConsolePanel
    can pick them up from the node_complete SSE event's `output` field.
    """

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Write a message to the workflow console panel.

        The returned output dict is forwarded to the frontend via the
        node_complete SSE event. ConsolePanel reads output.message and
        output.level to display the log entry.

        Args:
            data: Node execution data — config.message, config.level
            context: Execution context

        Returns:
            dict with ``message`` and ``level`` for downstream / console display
        """
        message = data.inputs.get("message") or data.config.get("message", "")
        level = (data.inputs.get("level") or data.config.get("level", "info")).lower()

        # Normalise level to known values
        if level not in ("debug", "info", "warning", "error"):
            level = "info"

        # Serialize structured types to JSON string; coerce others to str
        if isinstance(message, (dict, list)):
            try:
                message_str = json.dumps(message, ensure_ascii=False, default=str)
            except (TypeError, ValueError):
                message_str = str(message)
        elif not isinstance(message, str):
            message_str = str(message)
        else:
            message_str = message

        # Normalize embedded control chars that could forge log entries
        message_str = message_str.replace("\r\n", " ").replace("\r", " ").replace("\n", " ").replace("\0", "")

        # Enforce size cap (UTF-8 bytes) to prevent oversized SSE payloads
        encoded = message_str.encode("utf-8")
        if len(encoded) > _MAX_MESSAGE_BYTES:
            message_str = encoded[:_MAX_MESSAGE_BYTES].decode("utf-8", errors="ignore") + " …[truncated]"

        return {
            "message": message_str,
            "level": level,
        }
