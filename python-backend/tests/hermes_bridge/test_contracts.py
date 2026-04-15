from pydantic import ValidationError

from hermes_bridge.contracts import HermesBridgeRegistration, HermesBridgeRuntimeMetadata


def test_hermes_bridge_runtime_metadata_requires_api_server_url_when_enabled() -> None:
    try:
        HermesBridgeRuntimeMetadata(
            hermes_version="0.3.0",
            profile_name="default",
            api_server_enabled=True,
            terminal_backend="local",
            gateway_platforms=["telegram"],
            supports_delegated_http=True,
            supports_bound_connector=True,
            supports_callbacks=True,
            host_platform="linux",
            host_execution_mode="native",
        )
    except ValidationError as exc:
        assert "api_server_base_url is required" in str(exc)
    else:
        raise AssertionError("Expected HermesBridgeRuntimeMetadata to reject missing api_server_base_url")


def test_hermes_bridge_registration_locks_v1_identity_shape() -> None:
    registration = HermesBridgeRegistration(
        external_reference="hermes://profiles/default",
        display_name="Hermes Personal Agent",
        metadata=HermesBridgeRuntimeMetadata(
            hermes_version="0.3.0",
            profile_name="default",
            llm_routing_mode="pinned_provider",
            preferred_provider_id=12,
            preferred_provider_name="OpenRouter",
            api_server_enabled=True,
            api_server_base_url=" HTTPS://Hermes.Example.com/ ",
            remote_endpoint_policy_exception_id="hermes-remote-allow-001",
            terminal_backend="local",
            gateway_platforms=["telegram", "discord"],
            supports_delegated_http=True,
            supports_delegated_mcp=False,
            supports_bound_connector=True,
            supports_callbacks=True,
            host_platform="linux",
            host_execution_mode="native",
        ),
    )

    assert registration.runtime_type == "hermes_agent_gateway"
    assert registration.worker_mode == "per_user"
    assert registration.runtime_mode == "external_managed"
    assert registration.metadata.api_server_base_url == "https://hermes.example.com"
    assert registration.metadata.remote_endpoint_policy_exception_id == "hermes-remote-allow-001"
    assert registration.metadata.preferred_provider_id == 12
    assert registration.metadata.llm_routing_mode == "pinned_provider"


def test_hermes_bridge_runtime_metadata_requires_pinned_provider_when_set() -> None:
    try:
        HermesBridgeRuntimeMetadata(
            hermes_version="0.3.0",
            profile_name="default",
            llm_routing_mode="pinned_provider",
            api_server_enabled=True,
            api_server_base_url="http://127.0.0.1:9001",
            terminal_backend="local",
            gateway_platforms=["telegram"],
            supports_delegated_http=True,
            supports_bound_connector=True,
            supports_callbacks=True,
            host_platform="linux",
            host_execution_mode="native",
        )
    except ValidationError as exc:
        assert "preferred_provider_id" in str(exc)
    else:
        raise AssertionError("Expected pinned provider routing to require preferred_provider_id")


def test_hermes_bridge_runtime_metadata_rejects_remote_api_server_without_audited_exception() -> None:
    try:
        HermesBridgeRuntimeMetadata(
            hermes_version="0.3.0",
            profile_name="default",
            api_server_enabled=True,
            api_server_base_url="https://hermes.example.com",
            terminal_backend="local",
            gateway_platforms=["telegram"],
            supports_delegated_http=True,
            supports_bound_connector=True,
            supports_callbacks=True,
            host_platform="linux",
            host_execution_mode="native",
        )
    except ValidationError as exc:
        assert "loopback" in str(exc)
    else:
        raise AssertionError("Expected remote Hermes endpoint to require an audited exception")
