from __future__ import annotations
from importlib import metadata
from packaging.version import Version
class MissingAgentsSDKError(RuntimeError): pass
MIN_OPENAI_AGENTS_VERSION=Version("0.22.0"); MAX_OPENAI_AGENTS_VERSION=Version("0.23")
def supported_sdk_range()->str: return f">={MIN_OPENAI_AGENTS_VERSION},<{MAX_OPENAI_AGENTS_VERSION}"
def installed_sdk_version()->str:
    try: return metadata.version("openai-agents")
    except metadata.PackageNotFoundError: return "unknown"
def require_openai_agents_sdk():
    try: import agents
    except ModuleNotFoundError as exc: raise MissingAgentsSDKError("OpenAI Agents SDK is required for Agent reasoning. Install openai-agents"+supported_sdk_range()) from exc
    installed_raw=installed_sdk_version()
    if installed_raw == "unknown": return agents
    installed=Version(installed_raw)
    if not (MIN_OPENAI_AGENTS_VERSION <= installed < MAX_OPENAI_AGENTS_VERSION): raise MissingAgentsSDKError(f"Unsupported openai-agents {installed}; validated {supported_sdk_range()}")
    return agents
