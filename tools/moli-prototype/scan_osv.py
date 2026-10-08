#!/usr/bin/env python3
"""Query OSV for every crates.io package/version pinned in a Cargo.lock."""

from __future__ import annotations

import argparse
from collections import deque
import json
import tomllib
import urllib.request
from datetime import UTC, datetime
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cargo_lock", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--cargo-metadata", type=Path, required=True)
    args = parser.parse_args()
    lock = tomllib.loads(args.cargo_lock.read_text(encoding="utf-8"))
    metadata = json.loads(args.cargo_metadata.read_text(encoding="utf-8"))
    package_by_id = {package["id"]: package for package in metadata["packages"]}
    nodes = {node["id"]: node for node in metadata["resolve"]["nodes"]}
    roots = [package["id"] for package in metadata["packages"] if package["name"] == "moli" and package.get("source") is None]
    if len(roots) != 1:
        raise SystemExit(f"expected one local moli binary package, found {len(roots)}")
    reachable: set[str] = set()
    pending = [roots[0]]
    while pending:
        package_id = pending.pop()
        if package_id in reachable:
            continue
        reachable.add(package_id)
        for dependency in nodes.get(package_id, {}).get("deps", []):
            if any(kind.get("kind") in (None, "build") for kind in dependency.get("dep_kinds", [])):
                pending.append(dependency["pkg"])
    active = {(package_by_id[i]["name"], package_by_id[i]["version"]) for i in reachable if i in package_by_id}
    packages = [p for p in lock.get("package", []) if p.get("source", "").startswith("registry+") and (p["name"], p["version"]) in active]
    paths: dict[tuple[str, str], list[str]] = {}
    pending_paths = deque([(roots[0], [roots[0]])])
    visited: set[str] = set()
    while pending_paths:
        package_id, path = pending_paths.popleft()
        if package_id in visited:
            continue
        visited.add(package_id)
        package = package_by_id.get(package_id)
        if package:
            paths[(package["name"], package["version"])] = [
                f"{package_by_id[item]['name']}@{package_by_id[item]['version']}"
                for item in path if item in package_by_id
            ]
        for dependency in nodes.get(package_id, {}).get("deps", []):
            if dependency["pkg"] in reachable and any(kind.get("kind") in (None, "build") for kind in dependency.get("dep_kinds", [])):
                pending_paths.append((dependency["pkg"], path + [dependency["pkg"]]))
    findings: list[dict[str, str | None]] = []
    errors: list[dict[str, str]] = []
    batch_size = 50
    for start in range(0, len(packages), batch_size):
        batch = packages[start : start + batch_size]
        payload = {"queries": [{"package": {"name": p["name"], "ecosystem": "crates.io"}, "version": p["version"]} for p in batch]}
        request = urllib.request.Request(
            "https://api.osv.dev/v1/querybatch",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "SmartSpecPro-SPEC-208-Moli-Audit"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                results = json.load(response).get("results", [])
            for package, result in zip(batch, results):
                for vuln in result.get("vulns", []):
                    findings.append({
                        "package": package["name"],
                        "version": package["version"],
                        "id": vuln.get("id"),
                        "modified": vuln.get("modified"),
                        "summary": vuln.get("summary"),
                        "dependency_path": paths.get((package["name"], package["version"]), []),
                    })
        except Exception as exc:  # keep a partial report with explicit query gaps
            errors.append({"batch_start": str(start), "error": f"{type(exc).__name__}: {str(exc)[:200]}"})

    report = {
        "scanner": "OSV querybatch API",
        "queried_at": datetime.now(UTC).isoformat(),
        "ecosystem": "crates.io",
        "pinned_registry_package_versions": len(packages),
        "batch_size": batch_size,
        "findings": findings,
        "query_errors": errors,
        "limitations": [
            "The dependency closure follows normal/build edges from the Moli package in Cargo metadata; target-specific platform and feature selection are not filtered.",
            "OSV results cover registry crates only; git dependencies and native/system libraries require separate review.",
            "This report does not replace cargo-audit or a signed upstream artifact verification.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"queried {len(packages)} versions; findings={len(findings)} errors={len(errors)}")


if __name__ == "__main__":
    main()
