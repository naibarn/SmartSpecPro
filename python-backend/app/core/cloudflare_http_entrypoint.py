"""Fixed request-only API process and bounded private PostgreSQL connector.

This entrypoint grants no deployment or job authority. The provider must also
enforce instance limits, finite idle time and an approved deployment expiry.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import os
import re
import signal
import subprocess
import sys
import threading
from collections.abc import Mapping
from urllib.parse import parse_qsl, urlsplit, urlunsplit

from app.core.application_runtime import get_application_runtime_profile

DENIED = "APPLICATION_CONNECTOR_CONFIGURATION_DENIED"
CONNECTOR_PORT = 15432
ACCESS_KEYS = (
    "DATABASE_ACCESS_CLIENT_ID", "DATABASE_ACCESS_CLIENT_SECRET",
    "TUNNEL_SERVICE_TOKEN_ID", "TUNNEL_SERVICE_TOKEN_SECRET",
)


@dataclass(frozen=True)
class ConnectorConfiguration:
    hostname: str
    expires_at: float
    application_env: dict[str, str]
    connector_env: dict[str, str]


def connector_configuration(
    environ: Mapping[str, str], now: float | None = None
) -> ConnectorConfiguration:
    """Validate exact immutable deployment inputs without opening a connection."""
    now = datetime.now(timezone.utc).timestamp() if now is None else now
    try:
        profile = get_application_runtime_profile(environ.get("ENVIRONMENT", ""), environ)
        if profile.mode != "cloudflare-http":
            raise ValueError()
        hostname = environ.get("DATABASE_CONNECTOR_HOSTNAME", "")
        if len(hostname) > 253 or not re.fullmatch(
            r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+", hostname
        ):
            raise ValueError()
        expiry = datetime.fromisoformat(environ.get("CLOUDFLARE_APPLICATION_EXPIRES_AT", "").replace("Z", "+00:00"))
        if expiry.tzinfo is None or not now < expiry.timestamp() <= now + 600:
            raise ValueError()
        if environ.get("DATABASE_SSL_MODE") != "verify-full" or not environ.get("DATABASE_SSL_CA"):
            raise ValueError()
        for key in ACCESS_KEYS[:2]:
            if not environ.get(key) or re.search(r"[\x00-\x20\x7f]", environ[key]):
                raise ValueError()
        database = urlsplit(environ["DATABASE_URL"])
        if (
            database.scheme not in {"postgres", "postgresql", "postgresql+asyncpg"}
            or database.hostname != hostname or not database.username or not database.password
            or len(database.path) < 2
            or any(key.lower().startswith("ssl") for key, _ in parse_qsl(database.query))
        ):
            raise ValueError()
        # Preserve the original DNS name for asyncpg's SNI and certificate
        # hostname checks. Only this loop's exact DB destination resolves locally.
        authority = database.netloc.rsplit("@", 1)[0]
        application_env = dict(environ)
        application_env["DATABASE_URL"] = urlunsplit(database._replace(
            scheme="postgresql+asyncpg", netloc=f"{authority}@{hostname}:{CONNECTOR_PORT}"
        ))
        for key in ACCESS_KEYS:
            application_env.pop(key, None)
        return ConnectorConfiguration(hostname, expiry.timestamp(), application_env, {
            "PATH": environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "TUNNEL_SERVICE_HOSTNAME": hostname,
            "TUNNEL_SERVICE_URL": f"127.0.0.1:{CONNECTOR_PORT}",
            "TUNNEL_SERVICE_TOKEN_ID": environ["DATABASE_ACCESS_CLIENT_ID"],
            "TUNNEL_SERVICE_TOKEN_SECRET": environ["DATABASE_ACCESS_CLIENT_SECRET"],
        })
    except (KeyError, ValueError, TypeError):
        raise ValueError(DENIED) from None


class DatabaseConnectorEventLoop(asyncio.SelectorEventLoop):
    """Resolve only the private DB endpoint to its local Access listener.

    No system DNS mutation, root privilege, global monkeypatch, or TLS override.
    asyncpg still supplies the original DNS name to loop.start_tls().
    """

    def __init__(self, hostname: str, port: int = CONNECTOR_PORT):
        super().__init__()
        self._database_hostname = hostname
        self._database_port = port

    async def getaddrinfo(self, host, port, *, family=0, type=0, proto=0, flags=0):
        if host == self._database_hostname and str(port) == str(self._database_port):
            host = "127.0.0.1"
        return await super().getaddrinfo(host, port, family=family, type=type, proto=proto, flags=flags)


async def serve_http() -> None:
    """Run a single API worker; SQL readiness is read-only, before app startup."""
    import asyncpg
    from app.core.application_database_tls import application_database_connect_args

    if get_application_runtime_profile(os.environ.get("ENVIRONMENT", "")).mode != "cloudflare-http":
        raise ValueError(DENIED)
    host, port = os.environ.get("HOST", "0.0.0.0"), int(os.environ.get("PORT", "8000"))
    if host not in {"0.0.0.0", "127.0.0.1"} or not 1024 <= port <= 65535:
        raise ValueError(DENIED)
    dsn = os.environ["DATABASE_URL"].replace("postgresql+asyncpg:", "postgresql:", 1)
    arguments = application_database_connect_args("production", database_url=dsn)
    ready = False
    for _ in range(5):
        try:
            connection = await asyncpg.connect(dsn, timeout=3, **arguments)
            try:
                ready = await connection.fetchval("SELECT 1") == 1
            finally:
                await connection.close(timeout=1)
            if ready:
                break
        except (OSError, asyncpg.PostgresError, asyncio.TimeoutError):
            await asyncio.sleep(0.2)
    if not ready:
        raise RuntimeError("APPLICATION_CONNECTOR_DATABASE_UNAVAILABLE")
    import uvicorn

    server = uvicorn.Server(uvicorn.Config(
        "app.main:app", host=host, port=port, workers=1, loop="asyncio",
        proxy_headers=False, timeout_graceful_shutdown=5,
    ))
    await server.serve()


def _kill_group(child: subprocess.Popen | None, sig: signal.Signals) -> None:
    # Descendants may still own the group after its leader exits.
    if child is not None:
        try:
            os.killpg(child.pid, sig)
        except ProcessLookupError:
            pass


def supervise(environ: Mapping[str, str] | None = None) -> None:
    configuration = connector_configuration(os.environ if environ is None else environ)
    connector = application = None
    stopped = threading.Event()

    def deadline() -> None:
        _kill_group(application, signal.SIGKILL)
        _kill_group(connector, signal.SIGKILL)
        # A hung asyncio task or shutdown hook must never retain paid compute.
        os.write(2, b"APPLICATION_CONNECTOR_DEADLINE_REACHED\n")
        os._exit(0)

    timer = threading.Timer(configuration.expires_at - datetime.now(timezone.utc).timestamp(), deadline)
    timer.daemon = True
    previous = {sig: signal.signal(sig, lambda *_: stopped.set()) for sig in (signal.SIGTERM, signal.SIGINT)}
    timer.start()
    try:
        connector = subprocess.Popen(
            ["/usr/local/bin/cloudflared", "access", "tcp", "--log-level", "error"],
            env=configuration.connector_env, stdin=subprocess.DEVNULL, start_new_session=True,
        )
        application = subprocess.Popen(
            [sys.executable, "-m", "app.core.cloudflare_http_entrypoint", "--serve"],
            env=configuration.application_env, stdin=subprocess.DEVNULL, start_new_session=True,
        )
        while not stopped.wait(0.1):
            if connector.poll() is not None or application.poll() is not None:
                raise RuntimeError("APPLICATION_CONNECTOR_PROCESS_STOPPED")
    finally:
        # Retain the hard timer until both process groups have stopped.
        for child in (application, connector):
            _kill_group(child, signal.SIGTERM)
        for child in (application, connector):
            if child is not None:
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    _kill_group(child, signal.SIGKILL)
                    child.wait(timeout=1)
        timer.cancel()
        for sig, handler in previous.items():
            signal.signal(sig, handler)


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--serve"]:
            hostname = urlsplit(os.environ["DATABASE_URL"]).hostname
            asyncio.run(serve_http(), loop_factory=lambda: DatabaseConnectorEventLoop(hostname))
        elif len(sys.argv) == 1:
            supervise()
        else:
            raise ValueError(DENIED)
    except Exception as exc:
        # Never echo credentials/DSNs from driver or child exceptions.
        print(f"APPLICATION_CONNECTOR_START_FAILED:{type(exc).__name__}", file=sys.stderr)
        sys.exit(1)
