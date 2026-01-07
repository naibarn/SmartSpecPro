from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional

class ControlPlaneSettings(BaseSettings):
    control_plane_url: str = Field("http://localhost:7070", env="CONTROL_PLANE_URL")
    control_plane_api_key: str = Field("", env="CONTROL_PLANE_API_KEY")

    # If set, orchestrator endpoints require this key and will only accept localhost
    orchestrator_api_key: str = Field("", env="ORCHESTRATOR_API_KEY")

    # Workspace sandbox
    workspace_root: str = Field("", env="WORKSPACE_ROOT")  # if empty, uses repo root
    max_report_bytes: int = Field(10 * 1024 * 1024, env="MAX_REPORT_BYTES")

settings = ControlPlaneSettings()
