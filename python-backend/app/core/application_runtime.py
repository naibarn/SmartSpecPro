"""Explicit ownership for standard services and on-demand HTTP containers."""
from dataclasses import dataclass
import os
from collections.abc import Mapping


@dataclass(frozen=True)
class ApplicationRuntimeProfile:
    mode: str
    owns_background_work: bool
    initialize_schema: bool


def get_application_runtime_profile(
    environment: str, environ: Mapping[str, str] | None = None
) -> ApplicationRuntimeProfile:
    values = os.environ if environ is None else environ
    mode = values.get("SMARTAIHUB_APPLICATION_RUNTIME", "standard")
    if mode == "standard":
        shared_debug = (
            environment == "development"
            and values.get("SMARTSPEC_DEV_DATABASE_MODE") == "shared-production"
        )
        return ApplicationRuntimeProfile(
            mode, not shared_debug, environment != "production" and not shared_debug
        )
    if (
        mode != "cloudflare-http"
        or environment != "production"
        or values.get("CLOUDFLARE_CONTAINER_POLICY") != "on-demand"
    ):
        raise ValueError("APPLICATION_RUNTIME_CONFIGURATION_DENIED")
    return ApplicationRuntimeProfile(mode, False, False)
