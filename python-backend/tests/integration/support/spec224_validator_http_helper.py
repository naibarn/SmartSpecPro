"""Loopback-only process host for the existing Spec 224 validation route."""

import asyncio
import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.routing import APIRoute

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from app.api.approvals import router  # noqa: E402


async def main() -> None:
    if len(sys.argv) != 2:
        raise RuntimeError("SPEC224_VALIDATOR_PORT_REQUIRED")
    port = int(sys.argv[1])
    if not 1 <= port <= 65535 or not os.environ.get("SMARTSPEC_WEB_GATEWAY_TOKEN"):
        raise RuntimeError("SPEC224_VALIDATOR_TEST_CONFIGURATION_INVALID")

    app = FastAPI()
    target = "/api/v1/approvals/internal/spec224-recovery-grants/validate"
    route = next(
        (item for item in router.routes if isinstance(item, APIRoute) and item.path == target),
        None,
    )
    if route is None:
        raise RuntimeError("SPEC224_CANONICAL_VALIDATOR_ROUTE_NOT_FOUND")
    app.router.routes.append(route)

    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error", access_log=False)
    )
    task = asyncio.create_task(server.serve())
    while not server.started and not task.done():
        await asyncio.sleep(0.01)
    if task.done():
        await task
        raise RuntimeError("SPEC224_VALIDATOR_SERVER_FAILED_TO_START")
    print("SPEC224_VALIDATOR_READY", flush=True)
    await task


asyncio.run(main())
