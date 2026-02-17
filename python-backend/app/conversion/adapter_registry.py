"""Node Adapter Registry."""

from typing import Dict, Any, Optional

from .adapters.base import NodeAdapter
from .adapters.form_input_adapter import FormInputAdapter
from .adapters.approval_gate_adapter import ApprovalGateAdapter
from .adapters.file_upload_adapter import FileUploadAdapter


class AdapterRegistry:
    """Registry for node adapters."""

    _adapters = [
        FormInputAdapter(),
        ApprovalGateAdapter(),
        FileUploadAdapter(),
    ]

    @classmethod
    def get_adapter(cls, node_type: str) -> Optional[NodeAdapter]:
        """Get adapter for node type."""
        for adapter in cls._adapters:
            if adapter.can_adapt(node_type):
                return adapter
        return None

    @classmethod
    def adapt_node(cls, node: Dict[str, Any]) -> Dict[str, Any]:
        """Adapt a node if adapter exists."""
        node_type = node.get("type", "")
        adapter = cls.get_adapter(node_type)

        if adapter:
            return adapter.adapt(node)

        return node
