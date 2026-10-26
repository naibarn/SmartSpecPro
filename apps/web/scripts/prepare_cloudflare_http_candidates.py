#!/usr/bin/env python3
"""Prepare paired immutable Node/Python image inputs; never publish or activate.

This is local artifact preparation, not an image publication/job/grant receipt.
The existing canonical image executor still owns builds and registry writes.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import tempfile

from build_cloudflare_http_image import BASES, CONNECTOR
from linux_backend_release import ReleaseError, validate_build_result
from package_cloudflare_http_image import prepare_context as prepare_node
from package_cloudflare_python_http_image import prepare_context as prepare_python


def prepare_candidates(build_result: Path, output: Path) -> dict:
    record, _, _ = validate_build_result(build_result)
    source_sha = record["source_revision"]
    artifact_digest = record["artifact"]["artifact_digest"]
    if output.exists() or output.is_symlink():
        raise ReleaseError("HTTP_IMAGE_OUTPUT_ALREADY_EXISTS")
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".http-candidates-", dir=output.parent))
    try:
        pair = {}
        for runtime, prepare in (("node-http", prepare_node), ("python-http", prepare_python)):
            proof = prepare(build_result, stage / runtime, BASES[runtime], CONNECTOR)
            if (proof.get("sourceSha") != source_sha or proof.get("packagerSourceSha") != source_sha
                or proof.get("canonicalArtifactDigest") != artifact_digest
                or proof.get("runtime") != runtime or proof.get("providerMutations") != 0
                or proof.get("publish") is not False):
                raise ReleaseError("HTTP_IMAGE_CANDIDATE_PAIR_SOURCE_DENIED")
            pair[runtime] = {key: value for key, value in proof.items() if key != "context"}
            pair[runtime]["context"] = runtime
        result = {
            "schemaVersion": "cloudflare-http-candidate-pair-v1",
            "sourceSha": source_sha, "canonicalArtifactDigest": artifact_digest,
            "images": pair, "providerMutations": 0, "containerStarts": 0,
            "publicationStatus": "NOT_PUBLISHED", "runtimeAcceptance": "NOT_TESTED",
            "productionTrafficChanged": False,
        }
        (stage / "candidate-pair.json").write_text(json.dumps(result, indent=2) + "\n")
        os.rename(stage, output)
        return {**result, "output": str(output)}
    finally:
        if stage.exists():
            shutil.rmtree(stage)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-result", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare_candidates(args.build_result, args.output.absolute())))
