"""Isolated entrypoint checks; never import app lifespan or load local .env."""
import asyncio
from datetime import datetime, timezone
import unittest
from unittest.mock import AsyncMock, patch
from urllib.parse import urlsplit

from app.core.cloudflare_http_entrypoint import (
    DatabaseConnectorEventLoop, connector_configuration,
)


class ConnectorConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 21, tzinfo=timezone.utc).timestamp()
        self.env = {
            "ENVIRONMENT": "production", "SMARTAIHUB_APPLICATION_RUNTIME": "cloudflare-http",
            "CLOUDFLARE_CONTAINER_POLICY": "on-demand",
            "DATABASE_CONNECTOR_HOSTNAME": "database.private.example",
            "DATABASE_URL": "postgresql+asyncpg://user:encoded%40password@database.private.example:5432/app",
            "DATABASE_SSL_MODE": "verify-full", "DATABASE_SSL_CA": "runtime-injected-ca",
            "DATABASE_ACCESS_CLIENT_ID": "fixture-client", "DATABASE_ACCESS_CLIENT_SECRET": "fixture-secret",
            "TUNNEL_SERVICE_TOKEN_ID": "stale-token", "TUNNEL_SERVICE_TOKEN_SECRET": "stale-secret",
            "APP_SECRET": "application-only-fixture", "CLOUDFLARE_APPLICATION_EXPIRES_AT": "2026-10-21T00:01:00Z",
        }

    def test_preserves_original_tls_hostname_and_separates_child_secrets(self):
        result = connector_configuration(self.env, self.now)
        database = urlsplit(result.application_env["DATABASE_URL"])
        self.assertEqual(database.hostname, "database.private.example")
        self.assertEqual(database.port, 15432)
        self.assertEqual(database.password, "encoded%40password")
        self.assertEqual(result.application_env["APP_SECRET"], "application-only-fixture")
        self.assertNotIn("APP_SECRET", result.connector_env)
        for key in ("DATABASE_ACCESS_CLIENT_ID", "DATABASE_ACCESS_CLIENT_SECRET", "TUNNEL_SERVICE_TOKEN_ID", "TUNNEL_SERVICE_TOKEN_SECRET"):
            self.assertNotIn(key, result.application_env)
        self.assertEqual(result.connector_env["TUNNEL_SERVICE_URL"], "127.0.0.1:15432")
        self.assertEqual(self.env["DATABASE_URL"].split(":")[-1], "5432/app")

    def test_denies_missing_expired_unbounded_mismatched_and_weak_inputs(self):
        mutations = [
            {"ENVIRONMENT": "development"}, {"CLOUDFLARE_CONTAINER_POLICY": "always"},
            {"SMARTAIHUB_APPLICATION_RUNTIME": "standard"}, {"DATABASE_SSL_MODE": "require"},
            {"DATABASE_SSL_CA": ""}, {"DATABASE_ACCESS_CLIENT_SECRET": "token with whitespace"},
            {"DATABASE_CONNECTOR_HOSTNAME": "wrong.private.example"},
            {"DATABASE_URL": self.env["DATABASE_URL"] + "?sslmode=require"},
            {"CLOUDFLARE_APPLICATION_EXPIRES_AT": "2026-10-20T23:59:59Z"},
            {"CLOUDFLARE_APPLICATION_EXPIRES_AT": "2026-10-21T00:10:01Z"},
            {"CLOUDFLARE_APPLICATION_EXPIRES_AT": "2026-10-21T00:01:00"},
        ]
        for mutation in mutations:
            with self.subTest(mutation=tuple(mutation)):
                with self.assertRaisesRegex(ValueError, "^APPLICATION_CONNECTOR_CONFIGURATION_DENIED$"):
                    connector_configuration({**self.env, **mutation}, self.now)


class ConnectorDnsTests(unittest.TestCase):
    def test_only_exact_database_host_and_port_resolve_to_loopback(self):
        async def run():
            loop = asyncio.get_running_loop()
            with patch.object(asyncio.SelectorEventLoop, "getaddrinfo", new_callable=AsyncMock) as resolver:
                await loop.getaddrinfo("database.private.example", 15432)
                self.assertEqual(resolver.call_args.args, ("127.0.0.1", 15432))
                await loop.getaddrinfo("database.private.example", 443)
                self.assertEqual(resolver.call_args.args, ("database.private.example", 443))
                await loop.getaddrinfo("other.example", 15432)
                self.assertEqual(resolver.call_args.args, ("other.example", 15432))
        asyncio.run(run(), loop_factory=lambda: DatabaseConnectorEventLoop("database.private.example"))


if __name__ == "__main__":
    unittest.main()
