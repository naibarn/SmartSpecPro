#!/usr/bin/env python3
"""Inventory Cargo license metadata for the Moli normal/build dependency closure."""

from __future__ import annotations

import argparse
import json
from collections import deque
from datetime import UTC, datetime
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cargo_metadata", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    metadata = json.loads(args.cargo_metadata.read_text(encoding="utf-8"))
    packages = {package["id"]: package for package in metadata["packages"]}
    nodes = {node["id"]: node for node in metadata["resolve"]["nodes"]}
    roots = [package["id"] for package in metadata["packages"] if package["name"] == "moli" and package.get("source") is None]
    if len(roots) != 1:
        raise SystemExit(f"expected one local moli binary package, found {len(roots)}")
    reachable: set[str] = set()
    pending = deque(roots)
    while pending:
        package_id = pending.popleft()
        if package_id in reachable:
            continue
        reachable.add(package_id)
        for dependency in nodes.get(package_id, {}).get("deps", []):
            if any(kind.get("kind") in (None, "build") for kind in dependency.get("dep_kinds", [])):
                pending.append(dependency["pkg"])

    inventory = []
    for package_id in sorted(reachable):
        package = packages[package_id]
        inventory.append({
            "name": package["name"],
            "version": package["version"],
            "source": package.get("source"),
            "license": package.get("license"),
            "license_file": package.get("license_file"),
        })
    missing = [item for item in inventory if not item["license"] and not item["license_file"]]
    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source": "Cargo metadata license/license_file fields",
        "package_count": len(inventory),
        "missing_license_metadata_count": len(missing),
        "unique_license_expressions": sorted({item["license"] for item in inventory if item["license"]}),
        "packages": inventory,
        "limitations": [
            "Metadata is a license inventory, not a legal compatibility decision.",
            "File-level exceptions, bundled notices, fonts, fixtures, and native/system library notices require source-tree notice review.",
            "Target-specific platform and feature resolution were not filtered.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"inventory packages={len(inventory)} missing-license-metadata={len(missing)}")


if __name__ == "__main__":
    main()
