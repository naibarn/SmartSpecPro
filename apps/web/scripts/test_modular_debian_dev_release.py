from __future__ import annotations

import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch
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

    def test_requires_running_services_to_use_the_candidate_release(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            release_root = root / "candidate"
            proc_root = root / "proc"
            responses = []
            for index, suffix in enumerate(release.SERVICE_WORKING_DIRECTORIES.values(), start=101):
                working_directory = release_root / suffix
                working_directory.mkdir(parents=True)
                process_cwd = proc_root / str(index) / "cwd"
                process_cwd.parent.mkdir(parents=True)
                process_cwd.symlink_to(working_directory, target_is_directory=True)
                responses.extend((SimpleNamespace(stdout="active\n"), SimpleNamespace(stdout=f"{index}\n")))

            with patch.object(release, "run", side_effect=responses):
                release.verify_service_release_directories(release_root, proc_root=proc_root)

    def test_rejects_active_services_still_running_from_the_previous_release(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            candidate = root / "candidate/apps/saas-core"
            previous = root / "previous/apps/saas-core"
            process_cwd = root / "proc/101/cwd"
            candidate.mkdir(parents=True)
            previous.mkdir(parents=True)
            process_cwd.parent.mkdir(parents=True)
            process_cwd.symlink_to(previous, target_is_directory=True)

            with patch.object(release, "run", side_effect=(
                SimpleNamespace(stdout="active\n"),
                SimpleNamespace(stdout="101\n"),
            )):
                with self.assertRaisesRegex(release.ReleaseError, "SERVICE_RELEASE_PATH_MISMATCH:core"):
                    release.verify_service_release_directories(candidate.parent.parent, proc_root=root / "proc")

    def test_release_dropins_switch_to_candidate_and_restore_exact_previous_state(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            candidate = root / "candidate-release"
            rollback = candidate / "rollback/systemd"
            unit_dir = root / "systemd/user"
            existing = unit_dir / "smartsihub-core-dev.service.d/modular-release.conf"
            existing.parent.mkdir(parents=True)
            existing.write_text("[Service]\nWorkingDirectory=/previous/core\n", encoding="utf-8")

            release.write_service_release_dropins(candidate, rollback, unit_dir=unit_dir)

            self.assertIn(str(candidate / "apps/saas-core"), existing.read_text(encoding="utf-8"))
            self.assertTrue((rollback / "smartsihub-core-dev.service.modular-release.conf").is_file())
            self.assertTrue((rollback / "smartsihub-chat-dev.service.modular-release.conf.absent").is_file())
            self.assertIn(
                str(candidate / "modules/chat"),
                (unit_dir / "smartsihub-chat-dev.service.d/modular-release.conf").read_text(encoding="utf-8"),
            )

            release.restore_service_release_dropins(rollback, unit_dir=unit_dir)

            self.assertEqual(existing.read_text(encoding="utf-8"), "[Service]\nWorkingDirectory=/previous/core\n")
            self.assertFalse((unit_dir / "smartsihub-chat-dev.service.d/modular-release.conf").exists())


if __name__ == "__main__":
    unittest.main()
