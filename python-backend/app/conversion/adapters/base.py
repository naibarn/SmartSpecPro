"""Base class for node adapters."""

from abc import ABC, abstractmethod
from typing import Dict, Any


class NodeAdapter(ABC):
    """Base class for node adapters."""

    @abstractmethod
    def can_adapt(self, node_type: str) -> bool:
        """Check if this adapter can handle the node type."""
        pass

    @abstractmethod
    def adapt(self, node: Dict[str, Any]) -> Dict[str, Any]:
        """Transform node to chat-compatible format."""
        pass
