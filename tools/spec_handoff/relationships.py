"""Evidence-cited candidate predecessor/successor graph from explicit text."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from .inventory import inventory

_RELATION = re.compile(r"\b(supersed\w*|predecessor\w*|successor\w*|replac\w*|merg\w*|absorb\w*)\b", re.I)
_SPEC_REF = re.compile(r"\b(?:spec(?:ification)?\s*(?:#|no\.?\s*)?|#)(\d{1,4})\b", re.I)
_REQ_REF = re.compile(r"\b((?:REQ|FR|NFR|AC|R)[-_ ]?\d+[A-Z0-9._-]*)\b", re.I)


def build_relationship_graph(repo: Path, discovered: dict[str, Any] | None = None) -> dict[str, Any]:
    repo = repo.resolve()
    discovered = discovered or inventory(repo)
    canonical_ids = {str(row["spec_id"]) for row in discovered["records"] if row["root_kind"] == "CANONICAL" and row["record_kind"] == "CANONICAL_SPEC" and row.get("spec_id")}
    edges = []
    for record in discovered["records"]:
        if record["root_kind"] != "CANONICAL" or record["record_kind"] != "CANONICAL_SPEC" or not record.get("spec_id"):
            continue
        spec_path = repo / record["path"] / "spec.md"
        try:
            text = spec_path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        for number, line in enumerate(text.splitlines(), start=1):
            relations = list(_RELATION.finditer(line))
            if not relations:
                continue
            refs = sorted(set(_SPEC_REF.findall(line)))
            reqs = sorted(set(value.upper().replace(" ", "-") for value in _REQ_REF.findall(line)))
            for target_id in refs:
                if target_id not in canonical_ids or target_id == str(record["spec_id"]):
                    continue
                relation = relations[0].group(1).lower()
                if relation.startswith("supersed") or relation.startswith("replac") or relation.startswith("absorb") or relation.startswith("merg"):
                    from_id, to_id = target_id, str(record["spec_id"])
                    direction = "SUCCESSOR_CANDIDATE"
                else:
                    from_id, to_id = str(record["spec_id"]), target_id
                    direction = "RELATIONSHIP_CANDIDATE"
                source_digest = record.get("digest")
                edges.append({"predecessor_spec_id": from_id, "referencing_spec_id": str(record["spec_id"]), "referenced_spec_id": target_id, "successor_spec_id": to_id if direction == "SUCCESSOR_CANDIDATE" else None, "direction": direction, "relation_text": relation, "requirement_ids": reqs, "source": f"{spec_path.relative_to(repo).as_posix()}#L{number}", "source_digest": source_digest, "confidence": "LOW"})
    unique = {(edge["source"], edge["referenced_spec_id"], edge["relation_text"]): edge for edge in edges}
    result = sorted(unique.values(), key=lambda edge: (edge["predecessor_spec_id"], edge["successor_spec_id"] or "", edge["source"]))
    return {"schema_version": 1, "canonical_spec_ids": sorted(canonical_ids), "edges": result, "edge_count": len(result), "authority_note": "Text matches are candidates only; no edge independently proves authority, current relevance, or requirement closure."}
