"""Approval Gate Adapter."""

from typing import Dict, Any

from .base import NodeAdapter


class ApprovalGateAdapter(NodeAdapter):
    """
    Transform approval_gate node to chat approval.

    Strategy: Interactive approval request
    - Bot presents approval request with details
    - User responds with approve/reject
    - Optional: Request more information
    """

    def can_adapt(self, node_type: str) -> bool:
        return node_type == "approval_gate"

    def adapt(self, node: Dict[str, Any]) -> Dict[str, Any]:
        config = node.get("config", {})

        return {
            "type": "chat_approval",
            "original_type": "approval_gate",
            "config": {
                "prompt_template": config.get("message", "Please review the following:"),
                "details_data_path": config.get("details_data", ""),
                "timeout_seconds": config.get("timeout", 3600),
                "approval_options": {
                    "approve": {"label": "Approve", "value": "approved"},
                    "reject": {"label": "Reject", "value": "rejected"},
                    "request_info": {
                        "label": "Request More Info",
                        "value": "more_info",
                    },
                },
                "escalation": {
                    "enabled": config.get("escalate_on_timeout", False),
                    "escalate_to": config.get("escalate_to"),
                },
            },
        }
