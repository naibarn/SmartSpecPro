"""Extract narrowly scoped author-declared status/relationship claims.

Claims remain evidence, never lifecycle or authority decisions. In particular,
completion.md and release-gate.md assertions cannot complete a Spec on their own.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

_STATUS = re.compile(r"^\s*(?:\*\*)?(?:specification\s+)?(?:implementation\s+)?status\s*(?:\*\*)?\s*:\s*(.*?)\s*$", re.I)
_RELATION = re.compile(r"^\s*(?:\*\*)?(supersedes|superseded\s+by|replaces|replaced\s+by|merged\s+into|retired\s+by)\s*(?:\*\*)?\s*:\s*(.*?)\s*$", re.I)
_SPEC_IDS = re.compile(r"\b(?:spec(?:ification)?|feature)\s*(?:#|no\.?\s*)?(\d{1,4})\b", re.I)
_ARTIFACTS = ("completion.md", "release-gate.md", "status.md")


def _claims_from_file(path: Path, repo: Path, *, header_only: bool) -> list[dict[str, Any]]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return []
    lines = text.splitlines()
    candidates = lines[:80] if header_only else lines[:160]
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    result: list[dict[str, Any]] = []
    for number, line in enumerate(candidates, 1):
        if header_only and re.match(r"^\s*##\s", line):
            # A subtitle may immediately follow the H1 title; later H2s are
            # body sections, where Status-like tokens commonly describe data.
            if number > 3:
                break
        match = _STATUS.match(line)
        if match and match.group(1):
            result.append({
                "claim_kind": "DECLARED_STATUS",
                "value": match.group(1).strip(" `*_"),
                "source": path.relative_to(repo).as_posix(),
                "line": number,
                "source_digest": digest,
                "excerpt": line.strip()[:240],
                "authority": "AUTHOR_ASSERTION_CANDIDATE",
                "confidence": "LOW",
            })
        relation = _RELATION.match(line)
        if relation:
            relation_name = re.sub(r"\s+", "_", relation.group(1).upper())
            result.append({
                "claim_kind": "DECLARED_RELATIONSHIP",
                "relation": relation_name,
                "target_spec_ids": sorted(set(_SPEC_IDS.findall(relation.group(2)))),
                "value": relation.group(2).strip(),
                "source": path.relative_to(repo).as_posix(),
                "line": number,
                "source_digest": digest,
                "excerpt": line.strip()[:240],
                "authority": "AUTHOR_ASSERTION_CANDIDATE",
                "confidence": "LOW",
            })
    return result


def collect_declared_claims(spec_dir: Path, repo: Path) -> list[dict[str, Any]]:
    """Collect top-level declarations plus scoped lifecycle-artifact claims."""
    claims = _claims_from_file(spec_dir / "spec.md", repo, header_only=True)
    for name in _ARTIFACTS:
        candidate = spec_dir / name
        if candidate.is_file() and not candidate.is_symlink():
            claims.extend(_claims_from_file(candidate, repo, header_only=False))
    for path in sorted(spec_dir.rglob("deep_implement_config.json")):
        if path.is_symlink() or "handoff" in path.parts:
            continue
        try:
            config = json.loads(path.read_text(encoding="utf-8"))
            states = config.get("sections_state", {})
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
        except (OSError, UnicodeError, json.JSONDecodeError, AttributeError):
            continue
        if not isinstance(states, dict):
            continue
        for section, state in sorted(states.items()):
            if not isinstance(state, dict):
                continue
            commit = state.get("commit_hash")
            claims.append({
                "claim_kind": "SECTION_STATUS_ASSERTION",
                "section": str(section),
                "value": str(state.get("status", "UNKNOWN")),
                "commit_hash": str(commit) if commit else None,
                "commit_hash_length": len(str(commit)) if commit else 0,
                "source": path.relative_to(repo).as_posix(),
                "line": None,
                "source_digest": digest,
                "excerpt": f"sections_state.{section}: {state.get('status', 'UNKNOWN')}; commit_hash={commit or 'missing'}"[:240],
                "authority": "AUTHOR_ASSERTION_CANDIDATE",
                "confidence": "LOW",
            })
    claims.sort(key=lambda row: (row["source"], row["line"], row["claim_kind"]))
    return claims


def resolve_claim_targets(claims: list[dict[str, Any]], inventory_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Attach all matching inventory identities without selecting authority."""
    canonical = [row for row in inventory_records if row.get("root_kind") == "CANONICAL" and row.get("record_kind") == "CANONICAL_SPEC"]
    output = []
    for original in claims:
        claim = dict(original)
        if claim.get("claim_kind") == "DECLARED_RELATIONSHIP":
            matches = []
            for target_id in claim.get("target_spec_ids", []):
                exact = [row for row in canonical if str(row.get("spec_id")) == target_id]
                matches.extend(exact or [row for row in canonical if str(row.get("spec_id", "")).lstrip("0") == target_id.lstrip("0")])
            by_key = {row["record_key"]: row for row in matches}
            targets = [by_key[key] for key in sorted(by_key)]
            claim["target_candidates"] = [{"record_key": row["record_key"], "path": row["path"], "spec_id": row.get("spec_id"), "title": row.get("title")} for row in targets]
            claim["target_ambiguous"] = len(targets) != 1
            value = claim.get("value", "").casefold()
            partial_terms = any(word in value for word in ("only where", "partially", "partial", "subset", "some requirements")) or bool(re.search(r"\bwhere\b.{0,80}\bconflict", value))
            claim["scope_signal"] = "PARTIAL_SCOPE_EXPLICIT" if partial_terms else "SCOPE_UNSPECIFIED"
        output.append(claim)
    return output
