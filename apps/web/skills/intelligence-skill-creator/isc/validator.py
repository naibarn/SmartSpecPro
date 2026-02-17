from __future__ import annotations
import re
from dataclasses import dataclass
from typing import List

@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    errors: List[str]
    warnings: List[str]

_DIFF_PLUS = re.compile(r"^\+\+\+\s+(?P<path>\S+)")
_DIFF_MINUS = re.compile(r"^---\s+(?P<path>\S+)")

def _norm(p: str) -> str:
    if p.startswith("a/") or p.startswith("b/"):
        return p[2:]
    return p

def extract_paths(unified_diff: str) -> List[str]:
    paths=[]
    for ln in unified_diff.splitlines():
        m = _DIFF_PLUS.match(ln) or _DIFF_MINUS.match(ln)
        if not m:
            continue
        p=_norm(m.group("path"))
        if p == "/dev/null":
            continue
        paths.append(p)
    seen=set(); out=[]
    for p in paths:
        if p in seen:
            continue
        seen.add(p); out.append(p)
    return out

def validate_patch(
    skill_name: str,
    unified_diff: str,
    restrict_under_skills: bool = True,
    disallow_new_deps_in_skill_py: bool = True,
    require_respond_signature: bool = True,
) -> ValidationResult:
    errors=[]; warnings=[]
    if not unified_diff.strip():
        return ValidationResult(True, [], ["empty diff"])

    paths = extract_paths(unified_diff)
    if restrict_under_skills:
        for p in paths:
            if not p.startswith(f"skills/{skill_name}/"):
                errors.append(f"Disallowed path touched: {p}")

    for p in paths:
        if p.endswith("tests.json"):
            warnings.append("Patch edits tests.json (ensure user-approved for test expansion).")

    if disallow_new_deps_in_skill_py:
        banned = ["requests","numpy","pandas","torch","tensorflow","openai","anthropic"]
        for b in banned:
            if re.search(rf"^\+\s*import\s+{re.escape(b)}\b", unified_diff, re.MULTILINE) or                re.search(rf"^\+\s*from\s+{re.escape(b)}\b", unified_diff, re.MULTILINE):
                errors.append(f"New external dependency not allowed in skill.py: {b}")

    if require_respond_signature:
        if re.search(r"^\-\s*def\s+respond\s*\(", unified_diff, re.MULTILINE):
            warnings.append("respond() signature modified/removed; verify it still matches required API.")

    return ValidationResult(len(errors)==0, errors, warnings)
