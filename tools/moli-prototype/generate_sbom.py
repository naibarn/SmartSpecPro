#!/usr/bin/env python3
"""Generate a CycloneDX component inventory from a pinned Moli Cargo.lock."""

from __future__ import annotations

import argparse
import hashlib
import json
import tomllib
from datetime import UTC, datetime
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cargo_lock", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--cargo-metadata", type=Path, required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--source-archive-sha256", required=True)
    args = parser.parse_args()

    lock_bytes = args.cargo_lock.read_bytes()
    lock = tomllib.loads(lock_bytes.decode("utf-8"))
    packages = lock.get("package", [])
    metadata = json.loads(args.cargo_metadata.read_text(encoding="utf-8"))
    package_by_id = {package["id"]: package for package in metadata["packages"]}
    nodes = {node["id"]: node for node in metadata["resolve"]["nodes"]}
    roots = [
        package["id"]
        for package in metadata["packages"]
        if package["name"] == "moli" and package.get("source") is None
    ]
    if len(roots) != 1:
        raise SystemExit(f"expected one local moli binary package, found {len(roots)}")
    reachable: set[str] = set()
    pending = [roots[0]]
    while pending:
        package_id = pending.pop()
        if package_id in reachable:
            continue
        reachable.add(package_id)
        node = nodes.get(package_id)
        if node is None:
            continue
        for dependency in node.get("deps", []):
            kinds = dependency.get("dep_kinds", [])
            if any(kind.get("kind") in (None, "build") for kind in kinds):
                pending.append(dependency["pkg"])
    active_ids = reachable
    active_packages = [package_by_id[package_id] for package_id in active_ids if package_id in package_by_id]
    active_names_versions = {(package["name"], package["version"]) for package in active_packages}
    packages = [package for package in packages if (package["name"], package["version"]) in active_names_versions]
    package_id_by_name_version = {
        (package["name"], package["version"]): package["id"] for package in active_packages
    }
    components = []
    for package in packages:
        name, version = package["name"], package["version"]
        component = {
            "type": "library",
            "bom-ref": package_id_by_name_version.get((name, version), f"pkg:cargo/{name}@{version}"),
            "name": name,
            "version": version,
            "purl": f"pkg:cargo/{name}@{version}",
        }
        if package.get("checksum"):
            component["hashes"] = [{"alg": "SHA-256", "content": package["checksum"]}]
        source = package.get("source", "")
        if source.startswith("registry+"):
            component["externalReferences"] = [{
                "type": "distribution",
                "url": f"https://crates.io/crates/{name}/{version}",
            }]
        elif source.startswith("git+"):
            component["externalReferences"] = [{
                "type": "vcs",
                "url": source[4:].split("#", 1)[0],
            }]
        components.append(component)

    dependencies = []
    for package in active_packages:
        node = nodes.get(package["id"], {})
        deps = []
        for dependency in node.get("deps", []):
            kinds = dependency.get("dep_kinds", [])
            if dependency["pkg"] in active_ids and any(kind.get("kind") in (None, "build") for kind in kinds):
                deps.append(dependency["pkg"])
        if deps:
            dependencies.append({"ref": package["id"], "dependsOn": sorted(set(deps))})

    bom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": "urn:uuid:spec208-moli-v1.1.15-lock-inventory",
        "version": 1,
        "metadata": {
            "timestamp": datetime.now(UTC).isoformat(),
            "tools": [{"vendor": "SmartSpecPro", "name": "Moli Cargo.lock SBOM generator", "version": "1"}],
            "component": {"type": "application", "name": "lexmount/moli", "version": "1.1.15", "purl": "pkg:github/lexmount/moli@v1.1.15"},
            "properties": [
                {"name": "source.commit", "value": args.source_commit},
                {"name": "source.archive.sha256", "value": args.source_archive_sha256},
                {"name": "Cargo.lock.sha256", "value": hashlib.sha256(lock_bytes).hexdigest()},
                {"name": "inventory.package_count", "value": str(len(components))},
                {"name": "inventory.scope", "value": "normal/build dependency closure from the moli package in Cargo metadata; platform selection remains unfiltered"},
            ],
        },
        "components": components,
        "dependencies": dependencies,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(bom, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(components)} components to {args.output}")


if __name__ == "__main__":
    main()
