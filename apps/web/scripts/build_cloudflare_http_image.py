#!/usr/bin/env python3
"""Build one fixed canonical API image locally. Never run or publish containers."""
import argparse
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time

from linux_backend_release import ReleaseError
from package_cloudflare_http_image import prepare_context as prepare_node
from package_cloudflare_python_http_image import prepare_context as prepare_python

BASES = {
    "node-http": "docker.io/library/node@sha256:ea11b74b986d520137cdef9a5346e447a00f275ecc4abc0055b7151226231e09",
    "python-http": "docker.io/library/python@sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a",
}
CONNECTOR = "docker.io/cloudflare/cloudflared@sha256:e6aba36f47b17ba21c62404f826e7be09f089dc0d8978732752204a75d9d7375"


def image_build_command(context: Path, runtime: str, tag: str, source_sha: str, job_id: str, plan_digest: str) -> list[str]:
    if (runtime not in BASES or not re.fullmatch(r"[a-f0-9]{40}", source_sha)
        or not re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", job_id)
        or not re.fullmatch(r"[a-f0-9]{64}", plan_digest)
        or not re.fullmatch(r"smartspec-staging-[a-f0-9]{12}-" + re.escape(runtime) + ":" + source_sha + "-" + job_id, tag)):
        raise ReleaseError("HTTP_IMAGE_BUILD_SCOPE_DENIED")
    # Cloudflare's own fixed recipe disables provenance index manifests. Keep
    # publishing one linux/amd64 manifest, not an index with attestations.
    key = "NODE_HTTP_IMAGE" if runtime == "node-http" else "PYTHON_HTTP_IMAGE"
    return ["docker", "buildx", "build", "--platform", "linux/amd64", "--load", "--provenance=false", "--sbom=false",
            "--metadata-file", str(context.parent / "build-metadata.json"),
            "--build-arg", f"{key}={BASES[runtime]}", "--build-arg", f"ACCESS_CONNECTOR_IMAGE={CONNECTOR}",
            "--build-arg", f"SOURCE_SHA={source_sha}", "--label", f"org.smartaihub.packager.revision={source_sha}",
            "--label", f"org.smartaihub.provision.job={job_id}", "--label", f"org.smartaihub.provision.plan={plan_digest}",
            "--tag", tag, "--file", str(context / "Containerfile"), str(context)]


def inspect_built_image(value: dict, runtime: str, source_sha: str, job_id: str, plan_digest: str) -> dict:
    if runtime not in BASES:
        raise ReleaseError("HTTP_IMAGE_BUILD_SCOPE_DENIED")
    expected = ["node", "--import=tsx", "scripts/cloudflare-http-entrypoint.mjs"] if runtime == "node-http" else ["python", "-m", "app.core.cloudflare_http_entrypoint"]
    config = value.get("Config", {})
    labels = config.get("Labels", {})
    if (not re.fullmatch(r"sha256:[a-f0-9]{64}", value.get("Id", "")) or value.get("Architecture") != "amd64" or value.get("Os") != "linux"
        or config.get("User") != ("node" if runtime == "node-http" else "app") or config.get("Cmd") != expected
        or labels.get("org.opencontainers.image.revision") != source_sha or labels.get("org.smartaihub.packager.revision") != source_sha
        or labels.get("org.smartaihub.provision.job") != job_id or labels.get("org.smartaihub.provision.plan") != plan_digest
        or type(value.get("Size")) is not int or not 0 < value["Size"] <= 1073741824
        or not isinstance(value.get("RootFS", {}).get("Layers"), list) or not 0 < len(value["RootFS"]["Layers"]) <= 40):
        raise ReleaseError("HTTP_IMAGE_BUILD_READBACK_DENIED")
    if runtime == "node-http":
        # A successful build/registry push is not runtime compatibility. The
        # pinned base must satisfy the same canonical Node minimum as the app.
        minimum = tuple(map(int, (Path(__file__).parents[3] / ".nvmrc").read_text().strip().split(".")))
        versions = [item.removeprefix("NODE_VERSION=") for item in config.get("Env", []) if item.startswith("NODE_VERSION=")]
        if len(versions) != 1 or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", versions[0]):
            raise ReleaseError("HTTP_IMAGE_NODE_RUNTIME_UNSUPPORTED")
        version = tuple(map(int, versions[0].split(".")))
        if version < minimum or version[0] != minimum[0]:
            raise ReleaseError("HTTP_IMAGE_NODE_RUNTIME_UNSUPPORTED")
    return {"imageId": value["Id"], "imageBytes": value["Size"], "layers": len(value["RootFS"]["Layers"]),
            "platform": "linux/amd64", "sourceSha": source_sha, "runtime": runtime, "jobId": job_id, "planDigest": plan_digest}


def validate_build_metadata(value: dict, observed: dict) -> dict:
    config_digest = value.get("containerimage.config.digest", "")
    manifest_digest = value.get("containerimage.digest", "")
    descriptor = value.get("containerimage.descriptor", {})
    if (not re.fullmatch(r"sha256:[a-f0-9]{64}", config_digest)
        or not re.fullmatch(r"sha256:[a-f0-9]{64}", manifest_digest)
        or descriptor.get("digest") != manifest_digest
        or descriptor.get("mediaType") not in ("application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json")
        or observed.get("Id") not in (config_digest, manifest_digest)
        or (observed.get("Descriptor") and observed["Descriptor"].get("digest") != manifest_digest)):
        raise ReleaseError("HTTP_IMAGE_BUILD_METADATA_DENIED")
    # Docker's containerd store uses the manifest ID; the classic store uses
    # the config ID. Neither can be substituted for the other at publication.
    return {"configDigest": config_digest, "manifestDigest": manifest_digest}


def build_image(build_result: Path, output: Path, runtime: str, tag: str, source_sha: str, job_id: str, plan_digest: str, build_budget_seconds: int = 180) -> dict:
    if build_budget_seconds not in (180, 360):
        raise ReleaseError("HTTP_IMAGE_BUILD_BUDGET_DENIED")
    started = time.monotonic()
    output.parent.mkdir(parents=True, exist_ok=True)
    available = os.statvfs(output.parent)
    if available.f_bavail * available.f_frsize < 8 * 1024**3:
        raise ReleaseError("HTTP_IMAGE_BUILD_RESOURCE_BLOCKED")
    context = output / "context"
    # No provider or app credential enters the image builder environment.
    environment = {key: value for key, value in os.environ.items() if key in {"PATH", "HOME", "TMPDIR", "XDG_CACHE_HOME", "DOCKER_HOST", "DOCKER_CONTEXT"}}
    command = image_build_command(context, runtime, tag, source_sha, job_id, plan_digest)
    existing = subprocess.run(["docker", "image", "inspect", tag], env=environment, capture_output=True, timeout=10)
    if existing.returncode == 0:
        # A retry may replace only this exact canonical job's local build tag.
        # Never overwrite an unrelated developer image with the same name.
        inspect_built_image(json.loads(existing.stdout)[0], runtime, source_sha, job_id, plan_digest)
    proof = (prepare_node if runtime == "node-http" else prepare_python)(build_result, context, BASES[runtime], CONNECTOR)
    if proof["sourceSha"] != source_sha or proof["packagerSourceSha"] != source_sha:
        raise ReleaseError("HTTP_IMAGE_BUILD_SOURCE_MISMATCH")
    output.mkdir(parents=True, exist_ok=True)
    log_path = output / "build.log"
    with os.fdopen(os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as log:
        child = subprocess.Popen(command, env=environment, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
        def terminate_owned_build(signum, _frame):
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait(timeout=5)
            raise SystemExit(128 + signum)
        previous_handlers = {sig: signal.signal(sig, terminate_owned_build) for sig in (signal.SIGTERM, signal.SIGINT)}
        try:
            status = child.wait(timeout=max(1, build_budget_seconds - (time.monotonic() - started)))
        except subprocess.TimeoutExpired:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait(timeout=5)
            raise ReleaseError("HTTP_IMAGE_BUILD_DEADLINE_EXCEEDED") from None
        finally:
            for sig, handler in previous_handlers.items():
                signal.signal(sig, handler)
    if status != 0:
        raise ReleaseError("HTTP_IMAGE_BUILD_FAILED")
    observed = json.loads(subprocess.check_output(["docker", "image", "inspect", tag], env=environment, timeout=10))[0]
    result = inspect_built_image(observed, runtime, source_sha, job_id, plan_digest)
    result.update(validate_build_metadata(json.loads((output / "build-metadata.json").read_text()), observed))
    result.update(schemaVersion="cloudflare-http-image-build-v1", canonicalArtifactDigest=proof["canonicalArtifactDigest"],
                  packagerSourceSha=proof["packagerSourceSha"], localTag=tag, providerMutations=0, containerStarts=0)
    (output / "image-build.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-result", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--runtime", choices=tuple(BASES), required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--plan-digest", required=True)
    parser.add_argument("--build-budget-seconds", type=int, choices=(180, 360), default=180)
    args = parser.parse_args()
    try:
        print(json.dumps(build_image(args.build_result, args.output.absolute(), args.runtime, args.tag, args.source_sha, args.job_id, args.plan_digest, args.build_budget_seconds)))
    except ReleaseError as exc:
        # Only a fixed public diagnostic may cross into job error output.
        code = str(exc)
        if not re.fullmatch(r"HTTP_IMAGE_[A-Z_]{4,100}", code):
            code = "HTTP_IMAGE_BUILD_FAILED"
        print(json.dumps({"schemaVersion": "cloudflare-http-image-build-error-v1", "diagnosticCode": code}))
        raise SystemExit(1) from None
