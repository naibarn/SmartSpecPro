"""Fixed image recipes may build and inspect; they cannot execute workloads."""
from copy import deepcopy
from pathlib import Path
import unittest

from build_cloudflare_http_image import image_build_command, inspect_built_image, validate_build_metadata
from linux_backend_release import ReleaseError

SHA = "a" * 40
JOB = "11111111-1111-4111-8111-111111111111"
PLAN = "c" * 64
TAG = f"smartspec-staging-abcdef012345-node-http:{SHA}-{JOB}"


class FixedHttpImageBuildTests(unittest.TestCase):
    def test_containerd_manifest_id_is_not_mistaken_for_the_image_config_digest(self):
        config, manifest = "sha256:" + "c" * 64, "sha256:" + "d" * 64
        metadata = {"containerimage.config.digest": config, "containerimage.digest": manifest,
                    "containerimage.descriptor": {"digest": manifest, "mediaType": "application/vnd.oci.image.manifest.v1+json"}}
        for observed in ({"Id": config}, {"Id": manifest, "Descriptor": {"digest": manifest}}):
            self.assertEqual(validate_build_metadata(metadata, observed), {"configDigest": config, "manifestDigest": manifest})
        changed = deepcopy(metadata)
        changed["containerimage.descriptor"]["mediaType"] = "application/vnd.oci.image.index.v1+json"
        with self.assertRaisesRegex(ReleaseError, "BUILD_METADATA_DENIED"):
            validate_build_metadata(changed, {"Id": manifest})
    def test_fixed_single_architecture_recipe_cannot_select_a_command_or_unpinned_base(self):
        command = image_build_command(Path("/owned/context"), "node-http", TAG, SHA, JOB, PLAN)
        self.assertEqual(command[:3], ["docker", "buildx", "build"])
        self.assertIn("--provenance=false", command)
        self.assertIn("--sbom=false", command)
        self.assertNotIn("run", command)
        self.assertNotIn("exec", command)
        for value in ("attacker/image:latest", TAG + ";echo test", TAG.replace("node-http:", "python-http:")):
            with self.assertRaisesRegex(ReleaseError, "BUILD_SCOPE_DENIED"):
                image_build_command(Path("/owned/context"), "node-http", value, SHA, JOB, PLAN)

    def test_readback_requires_exact_source_job_plan_and_fixed_nonroot_entrypoint(self):
        value = {"Id": "sha256:" + "d" * 64, "Architecture": "amd64", "Os": "linux", "Size": 700_000_000,
                 "RootFS": {"Layers": ["fixture"]}, "Config": {"Env": ["NODE_VERSION=22.23.4"], "User": "node", "Cmd": ["node", "--import=tsx", "scripts/cloudflare-http-entrypoint.mjs"],
                 "Labels": {"org.opencontainers.image.revision": SHA, "org.smartaihub.packager.revision": SHA,
                            "org.smartaihub.provision.job": JOB, "org.smartaihub.provision.plan": PLAN}}}
        self.assertEqual(inspect_built_image(value, "node-http", SHA, JOB, PLAN)["imageBytes"], 700_000_000)
        for version in ("22.22.3", "23.0.0", "22.23.4-invalid", ""):
            changed = deepcopy(value)
            changed["Config"]["Env"] = [f"NODE_VERSION={version}"] if version else []
            with self.assertRaisesRegex(ReleaseError, "NODE_RUNTIME_UNSUPPORTED"):
                inspect_built_image(changed, "node-http", SHA, JOB, PLAN)
        changed = deepcopy(value)
        changed["Config"]["Env"].append("NODE_VERSION=22.22.3")
        with self.assertRaisesRegex(ReleaseError, "NODE_RUNTIME_UNSUPPORTED"):
            inspect_built_image(changed, "node-http", SHA, JOB, PLAN)
        for field, replacement in (("User", "root"), ("Cmd", ["sh"]), ("Labels", {})):
            changed = deepcopy(value)
            changed["Config"][field] = replacement
            with self.assertRaisesRegex(ReleaseError, "READBACK_DENIED"):
                inspect_built_image(changed, "node-http", SHA, JOB, PLAN)
        for field, replacement in (("Architecture", "arm64"), ("Size", 1073741825)):
            changed = {**value, field: replacement}
            with self.assertRaisesRegex(ReleaseError, "READBACK_DENIED"):
                inspect_built_image(changed, "node-http", SHA, JOB, PLAN)


if __name__ == "__main__":
    unittest.main()
