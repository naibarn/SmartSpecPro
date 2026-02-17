"""File Upload Adapter."""

from typing import Dict, Any

from .base import NodeAdapter


class FileUploadAdapter(NodeAdapter):
    """
    Transform file_upload node to chat file attachment.

    Strategy: Request file via chat
    - Bot asks user to upload file
    - Accepts drag-drop or attachment
    - Validates file type and size
    """

    def can_adapt(self, node_type: str) -> bool:
        return node_type == "file_upload"

    def adapt(self, node: Dict[str, Any]) -> Dict[str, Any]:
        config = node.get("config", {})

        return {
            "type": "file_attachment",
            "original_type": "file_upload",
            "config": {
                "prompt": config.get("prompt", "Please upload a file:"),
                "accepted_types": config.get("accepted_types", []),
                "max_size_mb": config.get("max_size_mb", 10),
                "multiple": config.get("multiple", False),
                "validation_message": config.get(
                    "validation_message", "Invalid file. Please try again."
                ),
            },
        }
