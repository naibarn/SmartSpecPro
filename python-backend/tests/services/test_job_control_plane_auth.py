import httpx

from app.services.job_control_plane import JobControlPlaneClient


def test_control_plane_uses_web_gateway_token_when_tokens_differ(monkeypatch):
    monkeypatch.delenv("SMARTSPEC_INTERNAL_TOKEN", raising=False)
    monkeypatch.delenv("INTERNAL_TOKEN", raising=False)
    monkeypatch.setenv("SMARTSPEC_PROXY_TOKEN", "proxy-token")
    monkeypatch.setenv("SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token")

    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json={"jobs": []})

    with httpx.Client(transport=httpx.MockTransport(handle)) as http_client:
        client = JobControlPlaneClient(
            base_url="http://control-plane",
            client=http_client,
        )
        assert client.ready(limit=1) == []

    assert len(requests) == 1
    assert requests[0].headers["x-internal-token"] == "gateway-token"


def test_control_plane_settings_fallback_prefers_web_gateway_token(monkeypatch):
    from app.core.config import settings

    monkeypatch.delenv("SMARTSPEC_INTERNAL_TOKEN", raising=False)
    monkeypatch.delenv("INTERNAL_TOKEN", raising=False)
    monkeypatch.delenv("SMARTSPEC_WEB_GATEWAY_TOKEN", raising=False)
    monkeypatch.delenv("SMARTSPEC_PROXY_TOKEN", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-token")
    monkeypatch.setattr(settings, "SMARTSPEC_PROXY_TOKEN", "proxy-token")

    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json={"jobs": []})

    with httpx.Client(transport=httpx.MockTransport(handle)) as http_client:
        client = JobControlPlaneClient(
            base_url="http://control-plane",
            client=http_client,
        )
        assert client.ready(limit=1) == []

    assert len(requests) == 1
    assert requests[0].headers["x-internal-token"] == "gateway-token"
