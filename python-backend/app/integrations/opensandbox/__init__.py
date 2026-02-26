"""OpenSandbox integration module for SmartSpecPro."""
from .client import (
    OpenSandboxBackendAdapter,
    OpenSandboxClient,
    RetryableHTTPError,
    SandboxAPIError,
    SandboxProvisionError,
)
from .config import OpenSandboxSettings, opensandbox_settings
from .lifecycle import SandboxLifecycleManager
from .mock_backend import MockSandboxBackend, SandboxBackend
from .models import (
    CommandResult,
    FileEntry,
    SandboxConfig,
    SandboxJobRequest,
    SandboxJobResponse,
    SandboxStatus,
)

__all__ = [
    "OpenSandboxSettings",
    "opensandbox_settings",
    "SandboxConfig",
    "SandboxStatus",
    "CommandResult",
    "FileEntry",
    "SandboxJobRequest",
    "SandboxJobResponse",
    "OpenSandboxClient",
    "SandboxAPIError",
    "RetryableHTTPError",
    "SandboxProvisionError",
    "SandboxLifecycleManager",
    "OpenSandboxBackendAdapter",
    "SandboxBackend",
    "MockSandboxBackend",
]


def get_sandbox_backend() -> SandboxBackend:
    """Return the appropriate sandbox backend based on configuration.

    If OPENSANDBOX_ENABLED is True and OPENSANDBOX_BASE_URL is set, returns
    an adapter around OpenSandboxClient. Otherwise returns MockSandboxBackend.
    """
    if opensandbox_settings.is_enabled:
        client = OpenSandboxClient(opensandbox_settings)
        return OpenSandboxBackendAdapter(client)
    return MockSandboxBackend()
