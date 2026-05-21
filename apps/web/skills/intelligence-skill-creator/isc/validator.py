from __future__ import annotations
import re
import json
from dataclasses import dataclass
from typing import Any, List

from .artifact_validation import (
    validate_json_schema_document,
    validate_skill_markdown,
    validate_tests_document,
    validate_ui_schema_document,
)
from .proposals import normalize_relative_patch_path

@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    errors: List[str]
    warnings: List[str]

def _append_artifact_result(
    errors: list[str],
    warnings: list[str],
    path: str,
    result: Any,
) -> None:
    for error in result.errors:
        errors.append(f"{path}: {error}")
    for warning in result.warnings:
        warnings.append(f"{path}: {warning}")


def _load_json_artifact(path: str, content: str, errors: list[str]) -> Any | None:
    try:
        return json.loads(content)
    except Exception as exc:
        errors.append(f"{path}: invalid JSON: {exc}")
        return None


def _infer_patch_language(paths: list[str]) -> str:
    for path in paths:
        normalized = path.replace("\\", "/")
        if normalized.endswith(("skill.js", "skill.mjs", "index.mjs")) or normalized.startswith("src/"):
            return "javascript"
    return "python"


def _has_unsafe_relative_path(value: str) -> bool:
    if not isinstance(value, str) or not value.strip():
        return True
    normalized = value.replace("\\", "/").strip()
    return normalized.startswith("/") or normalized.startswith("../") or "/../" in normalized or normalized == ".."


def _validate_skill_lock(path: str, content: str, errors: list[str]) -> None:
    data = _load_json_artifact(path, content, errors)
    if data is None:
        return
    if not isinstance(data, dict):
        errors.append(f"{path}: skill.lock.json must be a JSON object.")
        return

    entrypoints = data.get("entrypoints")
    if entrypoints is not None:
        if not isinstance(entrypoints, dict):
            errors.append(f"{path}: entrypoints must be an object.")
        else:
            for key, value in entrypoints.items():
                if _has_unsafe_relative_path(value):
                    errors.append(f"{path}: entrypoints.{key} must be a safe relative path.")

    outputs = data.get("outputs")
    if outputs is not None:
        if not isinstance(outputs, list):
            errors.append(f"{path}: outputs must be an array.")
        else:
            for index, value in enumerate(outputs):
                if _has_unsafe_relative_path(value):
                    errors.append(f"{path}: outputs[{index}] must be a safe relative path.")

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
    language = _infer_patch_language(paths)

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
        if not isinstance(content, str):
            errors.append(f"{p}: patch content must be a string.")
            continue
        normalized_path = p.replace("\\", "/")

        if normalized_path in ("SKILL.md", "skill.md"):
            _append_artifact_result(
                errors,
                warnings,
                p,
                validate_skill_markdown(content, language=language),
            )
        elif normalized_path in ("schemas/input.schema.json", "schemas/output.schema.json"):
            schema = _load_json_artifact(p, content, errors)
            if isinstance(schema, dict):
                _append_artifact_result(
                    errors,
                    warnings,
                    p,
                    validate_json_schema_document(schema, artifact=normalized_path),
                )
        elif normalized_path == "schemas/ui.schema.json":
            ui_schema = _load_json_artifact(p, content, errors)
            if isinstance(ui_schema, dict):
                _append_artifact_result(errors, warnings, p, validate_ui_schema_document(ui_schema))
        elif normalized_path in ("tests/tests.json", "tests.json"):
            tests_document = _load_json_artifact(p, content, errors)
            tests = tests_document.get("tests") if isinstance(tests_document, dict) else tests_document
            if tests_document is not None:
                _append_artifact_result(errors, warnings, p, validate_tests_document(tests))
        elif normalized_path == "skill.lock.json":
            _validate_skill_lock(p, content, errors)

        if disallow_new_deps_in_skill_py and p.endswith("skill.py"):
            banned = ["requests","numpy","pandas","torch","tensorflow","openai","anthropic"]
            for b in banned:
                if re.search(rf"^\s*import\s+{re.escape(b)}\b", content, re.MULTILINE) or \
                   re.search(rf"^\s*from\s+{re.escape(b)}\b", content, re.MULTILINE):
                    errors.append(f"New external dependency not allowed in skill.py: {b}")

        if require_respond_signature and p.endswith("skill.py"):
            if not re.search(r"def\s+respond\s*\(", content):
                errors.append("respond() signature missing; it must still match the required API.")
        if require_respond_signature and (p.endswith("skill.js") or p.endswith("skill.mjs") or p.endswith("index.mjs")):
            if not re.search(r"(async\s+function\s+respond\s*\(|export\s+async\s+function\s+respond\s*\(|module\.exports\s*=\s*\{\s*respond\s*\})", content):
                errors.append("respond() signature missing in JavaScript skill; expected async respond export.")

    return ValidationResult(len(errors)==0, errors, warnings)
