"""Exercise the actual API lifespan without a database or provider connection."""
import ast
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.core.application_runtime import get_application_runtime_profile


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("request_mode", [False, True])
async def test_production_api_preserves_external_schema_and_keeps_provider_bootstrap(request_mode):
    # Load the actual lifespan body only, so this safety test cannot import or
    # execute retired routers, table creation, seeds or checkpoint migrations.
    source = Path(__file__).resolve().parents[2] / "app/main.py"
    tree = ast.parse(source.read_text())
    fn = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "lifespan")
    init_db, seed, checkpointer = AsyncMock(), AsyncMock(), AsyncMock()
    close_db, initialize = AsyncMock(), AsyncMock()
    manager = SimpleNamespace(disconnect_all=AsyncMock())
    watcher = SimpleNamespace(start=AsyncMock(), stop=AsyncMock())
    checkpoint_cleanup = AsyncMock()

    @asynccontextmanager
    async def session():
        yield object()

    def module(name, **attrs):
        item = ModuleType(name)
        item.__dict__.update(attrs)
        return item

    modules = {
        "app.core.seed": module("app.core.seed", run_seed=seed),
        "app.llm_proxy.unified_client": module("app.llm_proxy.unified_client", unified_client=SimpleNamespace(initialize=initialize)),
        "app.core.database": module("app.core.database", AsyncSessionLocal=session),
        "app.core.checkpointer": module("app.core.checkpointer", get_postgres_checkpointer=checkpointer, cleanup_checkpointers=checkpoint_cleanup),
        "app.services.mcp_client_manager": module("app.services.mcp_client_manager", get_mcp_client_manager=lambda: manager),
        "app.services.mcp_config_watcher": module("app.services.mcp_config_watcher", McpConfigWatcher=lambda: watcher),
        "app.services.posthog_service": module("app.services.posthog_service", shutdown_posthog=MagicMock()),
        "sentry_sdk": module("sentry_sdk", flush=MagicMock()),
    }
    namespace = {
        "asynccontextmanager": asynccontextmanager, "FastAPI": object,
        "settings": SimpleNamespace(ENVIRONMENT="production", APP_VERSION="test", DEBUG=False, SMARTSPEC_USE_WEB_GATEWAY=False),
        "logger": MagicMock(), "ConfigValidator": SimpleNamespace(validate_and_report=MagicMock()),
        "get_application_runtime_profile": lambda environment: get_application_runtime_profile(
            environment, {"SMARTAIHUB_APPLICATION_RUNTIME": "cloudflare-http", "CLOUDFLARE_CONTAINER_POLICY": "on-demand"} if request_mode else {}
        ), "init_db": init_db, "close_db": close_db,
    }
    exec(compile(ast.Module(body=[fn], type_ignores=[]), str(source), "exec"), namespace)
    with patch.dict("sys.modules", modules):
        async with namespace["lifespan"](SimpleNamespace(state=SimpleNamespace())):
            await asyncio.sleep(0)
    init_db.assert_not_called()
    seed.assert_not_called()
    checkpointer.assert_not_called()
    checkpoint_cleanup.assert_not_called()
    initialize.assert_awaited_once()
    if request_mode:
        watcher.start.assert_not_called()
        watcher.stop.assert_not_called()
    else:
        watcher.start.assert_awaited_once()
        watcher.stop.assert_awaited_once()
    manager.disconnect_all.assert_awaited_once()
    close_db.assert_awaited_once()


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize("request_mode,expected_path", [(False, "/health"), (True, "/healthz")])
async def test_gateway_startup_probe_cannot_reenter_the_starting_python_api(request_mode, expected_path):
    source = Path(__file__).resolve().parents[2] / "app/main.py"
    tree = ast.parse(source.read_text())
    fn = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "_check_gateway_reachability")
    get = AsyncMock(return_value=SimpleNamespace(status_code=200))

    @asynccontextmanager
    async def client(**_kwargs):
        yield SimpleNamespace(get=get)

    namespace = {
        "settings": SimpleNamespace(ENVIRONMENT="production"), "logger": MagicMock(),
        "get_application_runtime_profile": lambda _environment: SimpleNamespace(mode="cloudflare-http" if request_mode else "standard"),
        "httpx": SimpleNamespace(AsyncClient=client, TimeoutException=TimeoutError, ConnectError=ConnectionError),
    }
    exec(compile(ast.Module(body=[fn], type_ignores=[]), str(source), "exec"), namespace)
    await namespace["_check_gateway_reachability"]("http://node.application.internal/")
    get.assert_awaited_once_with("http://node.application.internal" + expected_path)
