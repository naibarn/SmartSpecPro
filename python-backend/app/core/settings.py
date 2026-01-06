from __future__ import annotations

import os
from pydantic import BaseModel


class Settings(BaseModel):
    # Website gateway (SmartSpecWeb) acting as OpenAI-compatible upstream and MCP server.
    WEB_GATEWAY_URL: str = os.getenv("SMARTSPEC_WEB_GATEWAY_URL", "").rstrip("/")
    WEB_GATEWAY_TOKEN: str = os.getenv("SMARTSPEC_WEB_GATEWAY_TOKEN", "")
    MCP_BASE_URL: str = os.getenv("SMARTSPEC_MCP_BASE_URL", "").rstrip("/")  # defaults to WEB_GATEWAY_URL

    # Optional: if set, proxy will forward to website gateway instead of direct provider.
    USE_WEB_GATEWAY: bool = os.getenv("SMARTSPEC_USE_WEB_GATEWAY", "1") != "0"


settings = Settings()
