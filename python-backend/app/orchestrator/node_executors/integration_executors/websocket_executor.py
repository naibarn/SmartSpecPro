"""WebSocket Client Executor - Connect to WebSocket servers."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class WebSocketClientExecutor:
    """
    WebSocket client for real-time communication.

    Modes:
    - send: Send a message
    - receive: Receive messages (with timeout)
    - request_reply: Send and wait for response
    """

    DEFAULT_TIMEOUT = 30
    MAX_MESSAGE_SIZE = 1024 * 1024  # 1MB

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Execute WebSocket operation."""
        url = data.inputs.get("url")
        mode = data.inputs.get("mode", "send")
        message = data.inputs.get("message")
        headers = data.inputs.get("headers", {})
        timeout = data.inputs.get("timeout", self.DEFAULT_TIMEOUT)

        if not url:
            raise ValueError("WebSocket URL is required")

        # Validate URL
        if not url.startswith(("ws://", "wss://")):
            raise ValueError("URL must use ws:// or wss:// scheme")

        message_text = "" if message is None else str(message)

        try:
            import websockets
        except ImportError:
            # Stub implementation without websockets library
            logger.warning("websockets library not installed, using stub")
            return {
                "success": False,
                "error": "WebSocket support not available - websockets library required",
                "url": url,
                "mode": mode,
            }

        async with websockets.connect(
            url, extra_headers=headers, max_size=self.MAX_MESSAGE_SIZE
        ) as ws:
            if mode == "send":
                await ws.send(message_text)
                return {
                    "success": True,
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                }

            elif mode == "receive":
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=timeout)
                    return {
                        "success": True,
                        "message": msg,
                        "received_at": datetime.now(timezone.utc).isoformat(),
                    }
                except asyncio.TimeoutError:
                    return {
                        "success": False,
                        "error": f"Receive timeout after {timeout}s",
                    }

            elif mode == "request_reply":
                await ws.send(message_text)
                try:
                    reply = await asyncio.wait_for(ws.recv(), timeout=timeout)
                    return {
                        "success": True,
                        "sent": message_text,
                        "reply": reply,
                        "received_at": datetime.now(timezone.utc).isoformat(),
                    }
                except asyncio.TimeoutError:
                    return {
                        "success": False,
                        "error": f"No reply received within {timeout}s",
                    }

            else:
                raise ValueError(f"Unknown mode: {mode}")
