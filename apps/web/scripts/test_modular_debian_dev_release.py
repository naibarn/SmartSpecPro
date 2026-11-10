from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).with_name("modular_debian_dev_release.py")
SPEC = importlib.util.spec_from_file_location("modular_debian_dev_release", SCRIPT)
assert SPEC and SPEC.loader
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


def target_map():
    return {
        "targets": {
            "modular-debian-dev": {
                "domain": "aimarkethubs.com",
                "environment": "development",
                "application": "smartsihub-modular-core",
                "runtime": "debian-systemd-with-local-workerd",
                "service": "smartsihub-core-dev.service",
                "port": 3200,
                "database": "smartspec",
                "deploymentAuthority": "delegated-development",
                "status": "prepared",
                "handover": {
                    "currentService": "smartspec-dev-web.service",
                    "currentPort": 3100,
                    "preserveUntilCoreHealthy": True,
                },
            },
            "modular-cloudflare-prod": {"domain": "smartsihub.com"},
        },
    }


def ingress():
    return [
        {"hostname": "aimarkethubs.com", "path": "^/v1/core(/.*)?$", "service": "https://127.0.0.1:3200", "originRequest": {"httpHostHeader": "aimarkethubs.com", "noTLSVerify": True}},
        {"hostname": "aimarkethubs.com", "path": "^/(api/chat|modules/chat)(/.*)?$", "service": "https://127.0.0.1:3201", "originRequest": {"httpHostHeader": "aimarkethubs.com", "noTLSVerify": True}},
        {"hostname": "aimarkethubs.com", "service": "https://127.0.0.1:3202", "originRequest": {"httpHostHeader": "aimarkethubs.com", "noTLSVerify": True}},
        {"service": "http_status:404"},
    ]


class ModularDebianReleasePolicyTests(unittest.TestCase):
    def test_selects_only_the_explicit_modular_development_target(self):
        self.assertEqual(release.resolve_target(target_map(), "modular-debian-dev")["domain"], "aimarkethubs.com")
        with self.assertRaisesRegex(release.ReleaseError, "TARGET_NOT_SUPPORTED"):
            release.resolve_target(target_map(), "modular-cloudflare-prod")

    def test_rejects_domain_or_legacy_rollback_mismatch(self):
        targets = target_map()
        targets["targets"]["modular-debian-dev"]["domain"] = "smartsihub.com"
        with self.assertRaisesRegex(release.ReleaseError, "REGISTRY_MISMATCH"):
            release.resolve_target(targets, "modular-debian-dev")

        targets = target_map()
        targets["targets"]["modular-debian-dev"]["handover"]["currentPort"] = 3000
        with self.assertRaisesRegex(release.ReleaseError, "ROLLBACK_TARGET_MISMATCH"):
            release.resolve_target(targets, "modular-debian-dev")

    def test_validates_routes_and_tls_host_forwarding(self):
        active = {"tunnel": "dev-tunnel", "credentials-file": "/private/tunnel.json"}
        candidate = {**active, "ingress": ingress()}
        release.validate_tunnel_configuration(candidate, active)

        candidate["ingress"][0]["service"] = "https://127.0.0.1:3000"
        with self.assertRaisesRegex(release.ReleaseError, "TUNNEL_ROUTE_MISMATCH"):
            release.validate_tunnel_configuration(candidate, active)

    def test_rejects_a_different_tunnel_identity(self):
        with self.assertRaisesRegex(release.ReleaseError, "TUNNEL_IDENTITY_MISMATCH"):
            release.validate_tunnel_configuration(
                {"tunnel": "other", "credentials-file": "/private/tunnel.json", "ingress": ingress()},
                {"tunnel": "dev-tunnel", "credentials-file": "/private/tunnel.json"},
            )


if __name__ == "__main__":
    unittest.main()
