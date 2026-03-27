from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional

class ControlPlaneSettings(BaseSettings):
    control_plane_url: str = Field(
        default="http://localhost:7070",
        validation_alias="CONTROL_PLANE_URL",
    )
    control_plane_api_key: str = Field(
        default="",
        validation_alias="CONTROL_PLANE_API_KEY",
    )

    # If set, orchestrator endpoints require this key and will only accept localhost
    orchestrator_api_key: str = Field(default="", validation_alias="ORCHESTRATOR_API_KEY")

    # Workspace sandbox
    workspace_root: str = Field(
        default="",
        validation_alias="WORKSPACE_ROOT",
    )  # if empty, uses repo root
    max_report_bytes: int = Field(
        default=10 * 1024 * 1024,
        validation_alias="MAX_REPORT_BYTES",
    )

settings = ControlPlaneSettings()
