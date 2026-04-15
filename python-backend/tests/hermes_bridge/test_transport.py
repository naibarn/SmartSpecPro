from pydantic import ValidationError

from hermes_bridge.transport import HermesTransportConfig, validate_hermes_api_server_url


def test_transport_rejects_remote_endpoint_without_policy() -> None:
    try:
        HermesTransportConfig(
            base_url="https://hermes.example.com",
            api_key="test-key",
        )
    except ValidationError as exc:
        assert "loopback" in str(exc)
    else:
        raise AssertionError("Expected remote Hermes endpoint to be rejected by default")


def test_transport_requires_api_key_and_policy_exception_for_remote_access() -> None:
    try:
        HermesTransportConfig(
            base_url="https://hermes.example.com",
            api_key="",
            allow_remote=True,
        )
    except ValidationError as exc:
        assert "api_key" in str(exc) or "policy_exception_id" in str(exc)
    else:
        raise AssertionError("Expected missing API key or policy exception to fail validation")


def test_transport_allows_remote_endpoint_with_audited_policy_exception() -> None:
    config = HermesTransportConfig(
        base_url=" HTTPS://Hermes.Example.com/ ",
        api_key="test-key",
        allow_remote=True,
        policy_exception_id="hermes-remote-allow-001",
    )

    assert config.base_url == "https://hermes.example.com"
    assert config.policy_exception_id == "hermes-remote-allow-001"


def test_transport_rejects_remote_http_even_with_audited_policy_exception() -> None:
    try:
        HermesTransportConfig(
            base_url="http://hermes.example.com",
            api_key="test-key",
            allow_remote=True,
            policy_exception_id="hermes-remote-allow-001",
        )
    except ValidationError as exc:
        assert "https" in str(exc)
    else:
        raise AssertionError("Expected remote Hermes HTTP endpoint to be rejected")


def test_validate_hermes_api_server_url_allows_loopback() -> None:
    assert validate_hermes_api_server_url("http://127.0.0.1:9001") == "http://127.0.0.1:9001"


def test_validate_hermes_api_server_url_normalizes_scheme_host_and_slash() -> None:
    assert validate_hermes_api_server_url(" HTTP://127.0.0.1:9001/ ") == "http://127.0.0.1:9001"
