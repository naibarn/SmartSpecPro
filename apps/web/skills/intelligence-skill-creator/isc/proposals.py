from __future__ import annotations

import json
from pathlib import Path, PurePosixPath
from typing import Dict, Tuple

from .models import PatchProposal


def parse_patch_payload(patch_payload: str) -> Dict[str, str]:
    data = json.loads(patch_payload)
    if not isinstance(data, dict):
        raise RuntimeError("Patch payload must be a JSON object.")
    normalized: Dict[str, str] = {}
    for rel_path, content in data.items():
        if not isinstance(rel_path, str) or not rel_path.strip():
            raise RuntimeError("Patch payload contains an invalid file path key.")
        if not isinstance(content, str):
            raise RuntimeError(f"Patch content for {rel_path!r} must be a string.")
        normalized[rel_path] = content
    return normalized


def normalize_relative_patch_path(rel_path: str) -> PurePosixPath:
    path = PurePosixPath(rel_path)
    if path.is_absolute():
        raise RuntimeError(f"Absolute path not allowed in patch payload: {rel_path}")
    if any(part in ("", ".", "..") for part in path.parts):
        raise RuntimeError(f"Invalid relative path in patch payload: {rel_path}")
    return path


def apply_patch_payload(skill_dir: Path, patch_payload: str) -> list[Path]:
    changed: list[Path] = []
    for rel_path, content in parse_patch_payload(patch_payload).items():
        safe_path = normalize_relative_patch_path(rel_path)
        out_path = skill_dir.joinpath(*safe_path.parts)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(content, encoding="utf-8")
        changed.append(out_path)
    return changed


def save_patch_proposal(
    proposals_dir: Path,
    proposal: PatchProposal,
    metadata: dict | None = None,
) -> Tuple[Path, Path]:
    proposals_dir.mkdir(parents=True, exist_ok=True)
    stamp = proposal.created_at_iso.replace(":", "").replace("-", "")
    payload_path = proposals_dir / f"{stamp}.json"
    meta_path = proposals_dir / f"{stamp}.meta.json"

    payload_data = parse_patch_payload(proposal.patch_payload)
    payload_path.write_text(
        json.dumps(payload_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    meta = {
        "skill_name": proposal.skill_name,
        "created_at_iso": proposal.created_at_iso,
        "rationale": proposal.rationale,
        "proposal_file": str(payload_path),
    }
    if metadata:
        meta.update(metadata)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload_path, meta_path
