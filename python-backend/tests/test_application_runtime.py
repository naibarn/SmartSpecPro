"""HTTP runtime ownership is explicit and independent of job admission."""
import pytest
from app.core.application_runtime import get_application_runtime_profile

@pytest.mark.unit
def test_standard_and_production_readonly_debug_profiles_remain_compatible():
    assert get_application_runtime_profile("production", {}).owns_background_work
    assert not get_application_runtime_profile("production", {}).initialize_schema
    assert get_application_runtime_profile("development", {}).initialize_schema
    shared = get_application_runtime_profile("development", {"SMARTSPEC_DEV_DATABASE_MODE": "production-readonly"})
    assert not shared.owns_background_work
    assert not shared.initialize_schema

@pytest.mark.unit
def test_on_demand_http_api_does_not_own_schema_seed_or_background_watchers():
    profile = get_application_runtime_profile("production", {"SMARTAIHUB_APPLICATION_RUNTIME": "cloudflare-http", "CLOUDFLARE_CONTAINER_POLICY": "on-demand"})
    assert profile.mode == "cloudflare-http"
    assert not profile.owns_background_work
    assert not profile.initialize_schema

@pytest.mark.unit
@pytest.mark.parametrize("environment,values", [
    ("production", {"SMARTAIHUB_APPLICATION_RUNTIME": "unknown"}),
    ("development", {"SMARTAIHUB_APPLICATION_RUNTIME": "cloudflare-http", "CLOUDFLARE_CONTAINER_POLICY": "on-demand"}),
    ("production", {"SMARTAIHUB_APPLICATION_RUNTIME": "cloudflare-http"}),
    ("production", {"SMARTAIHUB_APPLICATION_RUNTIME": "cloudflare-http", "CLOUDFLARE_CONTAINER_POLICY": "always-on"}),
])
def test_invalid_or_unbounded_http_modes_fail_startup(environment, values):
    with pytest.raises(ValueError, match="APPLICATION_RUNTIME_CONFIGURATION_DENIED"):
        get_application_runtime_profile(environment, values)
