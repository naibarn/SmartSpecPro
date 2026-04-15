from __future__ import annotations

from urllib.parse import urlparse, urlunparse

from pydantic import BaseModel, ConfigDict, Field, model_validator


LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]"}


def validate_hermes_api_server_url(base_url: str, *, allow_remote: bool = False) -> str:
    parsed = urlparse(base_url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Hermes API server URL must use http or https")
    if not parsed.hostname:
        raise ValueError("Hermes API server URL must include a hostname")
    if parsed.username or parsed.password:
        raise ValueError("Hermes API server URL must not embed credentials")
    if not allow_remote and parsed.hostname.lower() not in LOOPBACK_HOSTS:
        raise ValueError("Hermes API server URL must resolve to loopback unless remote policy is explicitly allowed")
    if allow_remote and parsed.hostname.lower() not in LOOPBACK_HOSTS and parsed.scheme != "https":
        raise ValueError("Hermes remote API server URL must use https when remote policy is explicitly allowed")
    hostname = parsed.hostname.lower()
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"
    if parsed.port is not None:
        hostname = f"{hostname}:{parsed.port}"
    path = parsed.path or ""
    if path == "/":
        path = ""
    return urlunparse((parsed.scheme.lower(), hostname, path, "", "", ""))


class HermesTransportConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: str = Field(min_length=1)
    api_key: str = Field(min_length=1)
    allow_remote: bool = False
    policy_exception_id: str | None = None

    @model_validator(mode="after")
    def validate_transport(self) -> "HermesTransportConfig":
        self.base_url = validate_hermes_api_server_url(self.base_url, allow_remote=self.allow_remote)
        if self.allow_remote and not self.policy_exception_id:
            raise ValueError("policy_exception_id is required when allow_remote is true")
        return self
