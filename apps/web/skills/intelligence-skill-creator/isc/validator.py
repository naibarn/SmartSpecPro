from __future__ import annotations
import re
from dataclasses import dataclass
from typing import List

@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    errors: List[str]
    warnings: List[str]

import json
from .proposals import normalize_relative_patch_path

def validate_patch(
    skill_name: str,
    patch_payload: str,
    restrict_under_skills: bool = True,
    disallow_new_deps_in_skill_py: bool = True,
    require_respond_signature: bool = True,
) -> ValidationResult:
    errors=[]; warnings=[]
    if not patch_payload.strip():
        return ValidationResult(True, [], ["empty patch"])

    try:
        data = json.loads(patch_payload)
    except Exception as e:
        return ValidationResult(False, [f"Invalid JSON patch: {e}"], [])

    paths = list(data.keys())

    for p in paths:
        try:
            normalize_relative_patch_path(p)
        except RuntimeError as e:
            errors.append(str(e))

    if restrict_under_skills:
        for p in paths:
            if p.startswith("skills/"):
                errors.append(
                    f"Patch path must be relative to skill '{skill_name}', not repo-root scoped: {p}"
                )

    for p in paths:
        if p.endswith("tests.json"):
            warnings.append("Patch edits tests.json (ensure user-approved for test expansion).")

        content = data[p]
        if disallow_new_deps_in_skill_py and p.endswith("skill.py"):
            banned = ["requests","numpy","pandas","torch","tensorflow","openai","anthropic"]
            for b in banned:
                if re.search(rf"^\s*import\s+{re.escape(b)}\b", content, re.MULTILINE) or \
                   re.search(rf"^\s*from\s+{re.escape(b)}\b", content, re.MULTILINE):
                    errors.append(f"New external dependency not allowed in skill.py: {b}")

        if require_respond_signature and p.endswith("skill.py"):
            if not re.search(r"def\s+respond\s*\(", content):
                errors.append("respond() signature missing; it must still match the required API.")

    return ValidationResult(len(errors)==0, errors, warnings)
