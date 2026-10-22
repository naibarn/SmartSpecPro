"""Build an exact, non-acceptance crosswalk from the canonical Spec ledger."""

from __future__ import annotations

import json
import re
from pathlib import Path


SPEC_DIR = Path(__file__).resolve().parents[1]
SOURCE_SHA = "a3d615c11b814db8d2d2529211a3b560e54d01a2"
REFERENCE_PATTERN = re.compile(r"\bA(\d{1,2})(?:\s*[–-]\s*A?(\d{1,2}))?\b")


def acceptance_refs(text: str) -> list[str]:
    refs: set[int] = set()
    for start, end in REFERENCE_PATTERN.findall(text):
        first = int(start)
        last = int(end) if end else first
        refs.update(range(first, last + 1))
    return [f"A{number:02d}" for number in sorted(refs)]


def line_number(source: str) -> int | None:
    match = re.search(r"#L(\d+)$", source)
    return int(match.group(1)) if match else None


def build_crosswalk() -> dict:
    ledger = json.loads((SPEC_DIR / "handoff/requirement-ledger.json").read_text(encoding="utf-8"))
    source_lines = (SPEC_DIR / "spec.md").read_text(encoding="utf-8").splitlines()
    ledger_entries = []
    for item in ledger["requirements"]:
        line = line_number(item["authority_source"])
        exact_line = source_lines[line - 1] if line and line <= len(source_lines) else None
        ledger_entries.append(
            {
                "requirement_id": item["requirement_id"],
                "requirement_digest": item["requirement_digest"],
                "source_spec_digest": item["source_spec_digest"],
                "authority_source": item["authority_source"],
                "exact_source_line": exact_line,
                "exact_requirement_text": item["requirement_text"],
                "acceptance_references_found_in_exact_text": acceptance_refs(item["requirement_text"]),
                "final_state": item["final_state"],
                "implementation_status": item["implementation_status"],
            }
        )

    criteria = []
    for number in range(1, 69):
        criterion_id = f"A{number:02d}"
        matching_line = next(
            (i for i, text in enumerate(source_lines, start=1) if f"| {criterion_id} |" in text),
            None,
        )
        matched_entries = [
            entry
            for entry in ledger_entries
            if matching_line and line_number(entry["authority_source"]) == matching_line
        ]
        if number <= 20:
            source_status = "SOURCE_TEXT_UNAVAILABLE"
            exact_text = None
            source_ref = None
            matched_entries = []
        elif matching_line:
            source_status = "TEXT_PRESENT_IN_CUMULATIVE_SPEC; VERIFY_AGAINST_ORIGINAL_R1.0_WHERE_APPLICABLE"
            exact_text = source_lines[matching_line - 1]
            source_ref = f"spec.md#L{matching_line}"
        else:
            source_status = "SOURCE_TEXT_NOT_LOCATED"
            exact_text = None
            source_ref = None
        criteria.append(
            {
                "acceptance_id": criterion_id,
                "source_status": source_status,
                "source_ref": source_ref,
                "exact_source_text": exact_text,
                "canonical_ledger_requirement_ids": [entry["requirement_id"] for entry in matched_entries],
                "acceptance_state": "NOT_ASSESSED",
                "note": "No acceptance result is inferred from this crosswalk.",
            }
        )

    return {
        "schema": "spec310-acceptance-crosswalk.v1",
        "canonical_source_sha": SOURCE_SHA,
        "source_excerpt": {
            "name": "SPEC-310 R1.0 A01-A20",
            "status": "NOT_FOUND_IN_SCANNED_CANONICAL_OR_LOCAL_SOURCES",
            "text": None,
            "rule": "Do not reconstruct or infer missing source text.",
        },
        "criteria": criteria,
        "canonical_requirement_ledger": {
            "entry_count": len(ledger_entries),
            "entries": ledger_entries,
        },
        "acceptance_pass_count": 0,
        "documentation_is_not_acceptance_evidence": True,
    }


def render_markdown(crosswalk: dict) -> str:
    lines = [
        "# SPEC-310 Acceptance Source Crosswalk",
        "",
        f"**Source SHA:** `{crosswalk['canonical_source_sha']}`",
        "",
        f"**Canonical ledger entries:** {crosswalk['canonical_requirement_ledger']['entry_count']}",
        "",
        "**Acceptance status:** all rows `NOT_ASSESSED`; this artifact does not pass acceptance.",
        "",
        "## A01–A68 source map",
        "",
        "A01–A20 are deliberately unmapped because the original R1.0 excerpt was not found. No criterion text is inferred.",
        "A21–A68 are copied from the exact cumulative `spec.md` source line, but remain subject to reconciliation against original R1.0 wherever applicable.",
        "",
        "| Acceptance | Source state | Canonical ledger entry |",
        "|---|---|---|",
    ]
    for item in crosswalk["criteria"]:
        ledger_ids = ", ".join(item["canonical_ledger_requirement_ids"]) or "—"
        source = item["source_ref"] or "R1.0 source missing"
        lines.append(f"| {item['acceptance_id']} | {source_status_label(item['source_status'])} | {ledger_ids} |")
    lines.extend(
        [
            "",
            "## Complete canonical requirement-ledger crosswalk",
            "",
            "Every ledger entry is included below with its exact requirement text, digest, authority source, source-line text when available, acceptance references parsed from that exact text, and unchanged canonical states.",
            "",
            "| Requirement ID | Authority source | A references found in exact text | Final state | Requirement digest |",
            "|---|---|---|---|---|",
        ]
    )
    for item in crosswalk["canonical_requirement_ledger"]["entries"]:
        refs = ", ".join(item["acceptance_references_found_in_exact_text"]) or "—"
        lines.append(
            f"| {item['requirement_id']} | `{item['authority_source']}` | {refs} | {item['final_state']} | `{item['requirement_digest']}` |"
        )
    lines.extend(
        [
            "",
            "The machine-readable `acceptance-crosswalk.json` retains the exact full ledger text and exact source-line copy for every mapped criterion. R1.0 A01–A20 remain source gaps, not waived requirements.",
            "",
        ]
    )
    return "\n".join(lines)


def source_status_label(value: str) -> str:
    if value == "SOURCE_TEXT_UNAVAILABLE":
        return "R1.0 source text unavailable"
    if value.startswith("TEXT_PRESENT"):
        return "cumulative Spec line; R1.0 reconciliation pending"
    return value


def main() -> None:
    crosswalk = build_crosswalk()
    (SPEC_DIR / "acceptance-crosswalk.json").write_text(
        json.dumps(crosswalk, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (SPEC_DIR / "acceptance-crosswalk.md").write_text(render_markdown(crosswalk), encoding="utf-8")


if __name__ == "__main__":
    main()
