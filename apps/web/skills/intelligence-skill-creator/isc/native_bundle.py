from __future__ import annotations

import json
import os
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping

from .artifact_validation import ArtifactValidationResult
from .frontmatter import parse_skill_frontmatter
from .models import EvaluationReport, TestResult

NATIVE_TARGET_PLATFORM = "agents_python"
NATIVE_REQUIRED_FILES = (
    "SKILL.md",
    "scripts/run.sh",
    "scripts/verify.sh",
    "references/input_contract.md",
    "references/output_contract.md",
    "references/maintenance.md",
    "MODEL_COMPATIBILITY.md",
    "skill.lock.json",
)


@dataclass(frozen=True)
class NativeBundleValidation:
    ok: bool
    results: list[ArtifactValidationResult]


def _coerce_text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _sanitize_skill_name(value: Any) -> str:
    skill_name = _coerce_text(value)
    if skill_name in {"", ".", ".."}:
        raise ValueError("skill_name must be a non-empty bundle slug.")
    if any(sep in skill_name for sep in ("/", "\\", os.sep)):
        raise ValueError("skill_name must not contain path separators.")
    return skill_name


def _as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value is None:
        return []
    text = str(value).strip()
    return [text] if text else []


def _yaml_quote(value: str) -> str:
    if value == "":
        return '""'
    if any(ch in value for ch in ":#\n\r\t") or value.strip() != value:
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return value


def _render_frontmatter(items: Mapping[str, Any]) -> str:
    lines: list[str] = ["---"]
    for key, value in items.items():
        if value is None:
            continue
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {_yaml_quote(str(item))}")
            continue
        if isinstance(value, bool):
            lines.append(f"{key}: {'true' if value else 'false'}")
            continue
        if isinstance(value, (int, float)):
            lines.append(f"{key}: {value}")
            continue
        lines.append(f"{key}: {_yaml_quote(str(value))}")
    lines.append("---")
    return "\n".join(lines)


def _simple_frontmatter_parser(text: str) -> dict[str, Any]:
    if not text.startswith("---"):
        return {}

    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}

    data: dict[str, Any] = {}
    active_key: str | None = None
    active_list: list[str] = []

    for raw_line in lines[1:]:
        line = raw_line.rstrip()
        if line.strip() == "---":
            if active_key is not None:
                data[active_key] = active_list[:]
            break
        if not line.strip():
            continue
        if line.startswith("  - ") and active_key is not None:
            active_list.append(line[4:].strip().strip('"').strip("'"))
            continue
        if ":" not in line:
            continue
        if active_key is not None:
            data[active_key] = active_list[:]
            active_key = None
            active_list = []
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if not value:
            active_key = key
            active_list = []
            continue
        lowered = value.lower()
        if lowered in {"true", "false"}:
            data[key] = lowered == "true"
            continue
        if value.startswith("[") and value.endswith("]"):
            parsed = [part.strip().strip('"').strip("'") for part in value[1:-1].split(",") if part.strip()]
            data[key] = parsed
            continue
        data[key] = value.strip('"').strip("'")
    return data


def normalize_skill_plan(plan: Mapping[str, Any] | None) -> dict[str, Any]:
    source = dict(plan or {})
    skill_name = _sanitize_skill_name(source.get("skill_name") or source.get("name") or source.get("skillName") or "generated-skill")
    skill_title = _coerce_text(source.get("skill_title") or source.get("title") or source.get("skillTitle") or skill_name.replace("-", " ").title(), skill_name)
    description = _coerce_text(source.get("description") or source.get("summary") or source.get("purpose") or f"Native skill bundle for {skill_title}")
    version = _coerce_text(source.get("version") or "1.0.0", "1.0.0")
    inputs = source.get("inputs") if isinstance(source.get("inputs"), list) else []
    outputs = source.get("outputs") if isinstance(source.get("outputs"), list) else []
    workflow = source.get("workflow") if isinstance(source.get("workflow"), list) else source.get("logic_steps") if isinstance(source.get("logic_steps"), list) else []
    guardrails = source.get("guardrails") if isinstance(source.get("guardrails"), list) else []
    verification = _coerce_text(source.get("verification") or source.get("verify_command") or "scripts/verify.sh")
    final_checklist = source.get("final_response_checklist") if isinstance(source.get("final_response_checklist"), list) else []

    return {
        "skill_name": skill_name,
        "skill_title": skill_title,
        "description": description,
        "version": version,
        "inputs": inputs,
        "outputs": outputs,
        "workflow": workflow,
        "guardrails": guardrails,
        "verification": verification,
        "final_response_checklist": final_checklist,
        "target_platform": NATIVE_TARGET_PLATFORM,
        "mirror_skill_md": bool(source.get("mirror_skill_md", True)),
        "model_compatibility": source.get("model_compatibility") if isinstance(source.get("model_compatibility"), dict) else {},
    }


def build_native_skill_markdown(plan: Mapping[str, Any] | None) -> str:
    normalized = normalize_skill_plan(plan)
    frontmatter = _render_frontmatter(
        {
            "name": normalized["skill_name"],
            "description": normalized["description"],
            "version": normalized["version"],
            "target_platform": NATIVE_TARGET_PLATFORM,
        }
    )

    def _format_block(title: str, lines: Iterable[str]) -> str:
        body = "\n".join(f"- {line}" for line in lines) if lines else "- None"
        return f"## {title}\n\n{body}\n"

    inputs = [
        f"{item.get('name', item.get('id', 'input'))}: {item.get('description', item.get('help', 'Describe the input'))}"
        for item in normalized["inputs"]
        if isinstance(item, dict)
    ]
    outputs = [
        f"{item.get('name', item.get('id', 'output'))}: {item.get('description', item.get('help', 'Describe the output'))}"
        for item in normalized["outputs"]
        if isinstance(item, dict)
    ]
    workflow = [str(step).strip() for step in normalized["workflow"] if str(step).strip()]
    guardrails = [str(step).strip() for step in normalized["guardrails"] if str(step).strip()]
    final_checklist = [str(step).strip() for step in normalized["final_response_checklist"] if str(step).strip()]

    exact_commands = [
        "scripts/run.sh",
        normalized["verification"],
    ]

    sections = [
        frontmatter,
        "# " + normalized["skill_title"],
        "## When To Use\n\nUse this skill when the task should run through the native OpenAI Agents Python bundle contract.\n",
        _format_block("Inputs", inputs),
        _format_block("Workflow", workflow),
        "## Exact Commands\n\n" + "\n".join(f"- `{command}`" for command in exact_commands) + "\n",
        _format_block("Guardrails", guardrails),
        "## Verification\n\n- Run `scripts/verify.sh` before finalizing any run.\n",
        _format_block("Final Response Checklist", final_checklist),
    ]
    return "\n".join(section.rstrip() for section in sections).strip() + "\n"


def build_model_compatibility_doc(plan: Mapping[str, Any] | None) -> str:
    normalized = normalize_skill_plan(plan)
    compatibility = normalized["model_compatibility"]
    hard_min = _as_list(compatibility.get("hard_minimum") if isinstance(compatibility, dict) else None)
    recommended = _as_list(compatibility.get("recommended") if isinstance(compatibility, dict) else None)
    optional = _as_list(compatibility.get("optional") if isinstance(compatibility, dict) else None)
    caveats = _as_list(compatibility.get("caveats") if isinstance(compatibility, dict) else None)
    tier = _coerce_text(compatibility.get("tier") if isinstance(compatibility, dict) else None, "Tier B - Recommended")

    return "\n".join(
        [
            "# Model Compatibility",
            "",
            f"Support tier: {tier}",
            "",
            "## Hard Minimum",
            *(f"- {item}" for item in hard_min or ["tool calling", "multi-step tool loop", "reliable instruction following", "plain-text final output"]),
            "",
            "## Recommended",
            *(f"- {item}" for item in recommended or ["strong tool selection", "context tolerance", "structured summarization"]),
            "",
            "## Optional Features",
            *(f"- {item}" for item in optional or ["structured outputs", "handoffs", "multimodal input", "hosted search"]),
            "",
            "## Caveats",
            *(f"- {item}" for item in caveats or ["Keep provider-specific settings explicit."]),
            "",
        ]
    ).strip() + "\n"


def build_skill_lock(plan: Mapping[str, Any] | None) -> dict[str, Any]:
    normalized = normalize_skill_plan(plan)
    outputs = [
        "SKILL.md",
        "scripts/run.sh",
        "scripts/verify.sh",
        "references/input_contract.md",
        "references/output_contract.md",
        "references/maintenance.md",
        "MODEL_COMPATIBILITY.md",
    ]
    if normalized["mirror_skill_md"]:
        outputs.append("skill.md")

    return {
        "name": normalized["skill_name"],
        "version": normalized["version"],
        "target_platform": NATIVE_TARGET_PLATFORM,
        "entrypoints": {
            "run": "scripts/run.sh",
            "verify": "scripts/verify.sh",
        },
        "outputs": outputs,
        "supported_modes": ["create", "improve", "maintenance"],
        "compatibility_mirror_policy": "mirror-skill-md" if normalized["mirror_skill_md"] else "no-mirror",
    }


def build_native_skill_files(plan: Mapping[str, Any] | None) -> dict[str, str]:
    normalized = normalize_skill_plan(plan)
    skill_md = build_native_skill_markdown(normalized)
    lock = json.dumps(build_skill_lock(normalized), ensure_ascii=False, indent=2) + "\n"
    compatibility = build_model_compatibility_doc(normalized)

    run_script = """#!/usr/bin/env bash
set -euo pipefail
echo "[native-skill] run: ${0##*/}"
echo "[native-skill] bundle=$(cd \"$(dirname \"$0\")/..\" && pwd)"
"""
    verify_script = """#!/usr/bin/env bash
set -euo pipefail
echo "[native-skill] verify: ${0##*/}"
echo "[native-skill] bundle=$(cd \"$(dirname \"$0\")/..\" && pwd)"
"""

    input_contract = "\n".join(
        [
            "# Input Contract",
            "",
            "Describe the expected request payload here.",
            "",
            "- Inputs should be explicit and path-constrained.",
            "- Inputs should be deterministic and non-interactive.",
        ]
    ) + "\n"
    output_contract = "\n".join(
        [
            "# Output Contract",
            "",
            "Describe the expected artifact and response payload shape here.",
            "",
            "- Outputs must be written to declared paths only.",
            "- Outputs must be safe to resume and inspect.",
        ]
    ) + "\n"
    maintenance = "\n".join(
        [
            "# Maintenance Notes",
            "",
            "- Safe changes may be auto-applied.",
            "- Breaking changes require approval.",
            "- Verification runs before finalize.",
        ]
    ) + "\n"

    files = {
        "SKILL.md": skill_md,
        "scripts/run.sh": run_script,
        "scripts/verify.sh": verify_script,
        "references/input_contract.md": input_contract,
        "references/output_contract.md": output_contract,
        "references/maintenance.md": maintenance,
        "MODEL_COMPATIBILITY.md": compatibility,
        "skill.lock.json": lock,
    }
    if normalized["mirror_skill_md"]:
        files["skill.md"] = skill_md
    return files


def write_native_skill_bundle(bundle_dir: Path, plan: Mapping[str, Any] | None, overwrite: bool = True) -> list[Path]:
    bundle_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for relative_path, content in build_native_skill_files(plan).items():
        out_path = bundle_dir / relative_path
        out_path.parent.mkdir(parents=True, exist_ok=True)
        if out_path.exists() and not overwrite:
            continue
        out_path.write_text(content, encoding="utf-8")
        written.append(out_path)
        if out_path.suffix in {".sh"}:
            current_mode = out_path.stat().st_mode
            out_path.chmod(current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return written


def parse_native_skill_lock(bundle_dir: Path) -> dict[str, Any] | None:
    lock_path = bundle_dir / "skill.lock.json"
    if not lock_path.exists():
      return None
    try:
        raw = json.loads(lock_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return raw if isinstance(raw, dict) else None


def parse_frontmatter(text: str) -> dict[str, Any]:
    return parse_skill_frontmatter(text)


def is_native_skill_bundle(bundle_dir: Path) -> bool:
    if not bundle_dir.exists():
        return False
    lock = parse_native_skill_lock(bundle_dir)
    if lock and lock.get("target_platform") == NATIVE_TARGET_PLATFORM:
        return True
    skill_md = bundle_dir / "SKILL.md"
    if not skill_md.exists():
        return False
    frontmatter = parse_frontmatter(skill_md.read_text(encoding="utf-8"))
    return frontmatter.get("target_platform") == NATIVE_TARGET_PLATFORM


def _check_required_files(bundle_dir: Path) -> list[ArtifactValidationResult]:
    results: list[ArtifactValidationResult] = []
    for relative_path in NATIVE_REQUIRED_FILES:
        exists = (bundle_dir / relative_path).exists()
        results.append(
            ArtifactValidationResult(
                artifact=relative_path,
                errors=[] if exists else [f"Missing required native bundle file: {relative_path}"],
                warnings=[],
            )
        )
    return results


def _check_frontmatter(bundle_dir: Path) -> ArtifactValidationResult:
    skill_md = bundle_dir / "SKILL.md"
    if not skill_md.exists():
        return ArtifactValidationResult("SKILL.md", ["SKILL.md is missing."], [])

    frontmatter = parse_frontmatter(skill_md.read_text(encoding="utf-8"))
    errors: list[str] = []
    for key in ("name", "description", "version", "target_platform"):
        if not _coerce_text(frontmatter.get(key)):
            errors.append(f"SKILL.md frontmatter missing or empty: {key}")
    if frontmatter.get("target_platform") != NATIVE_TARGET_PLATFORM:
        errors.append(f"SKILL.md target_platform must be {NATIVE_TARGET_PLATFORM}.")
    return ArtifactValidationResult("SKILL.md", errors, [])


def _check_script(bundle_dir: Path, relative_path: str) -> ArtifactValidationResult:
    script_path = bundle_dir / relative_path
    errors: list[str] = []
    if not script_path.exists():
        errors.append(f"{relative_path} is missing.")
    else:
        mode = script_path.stat().st_mode
        if not (mode & stat.S_IXUSR):
            errors.append(f"{relative_path} must be executable.")
        content = script_path.read_text(encoding="utf-8")
        if not content.startswith("#!/usr/bin/env bash"):
            errors.append(f"{relative_path} must start with a bash shebang.")
        if "set -euo pipefail" not in content:
            errors.append(f"{relative_path} must enable strict shell mode.")
    return ArtifactValidationResult(relative_path, errors, [])


def _check_lock(bundle_dir: Path) -> ArtifactValidationResult:
    lock_path = bundle_dir / "skill.lock.json"
    if not lock_path.exists():
        return ArtifactValidationResult("skill.lock.json", ["skill.lock.json is missing."], [])
    errors: list[str] = []
    try:
        data = json.loads(lock_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return ArtifactValidationResult("skill.lock.json", [f"skill.lock.json is invalid JSON: {exc}"], [])
    if not isinstance(data, dict):
        return ArtifactValidationResult("skill.lock.json", ["skill.lock.json must be a JSON object."], [])
    if data.get("target_platform") != NATIVE_TARGET_PLATFORM:
        errors.append(f"skill.lock.json target_platform must be {NATIVE_TARGET_PLATFORM}.")
    entrypoints = data.get("entrypoints")
    if not isinstance(entrypoints, dict):
        errors.append("skill.lock.json entrypoints must be an object.")
    else:
        if entrypoints.get("run") != "scripts/run.sh":
            errors.append("skill.lock.json entrypoints.run must be scripts/run.sh.")
        if entrypoints.get("verify") != "scripts/verify.sh":
            errors.append("skill.lock.json entrypoints.verify must be scripts/verify.sh.")
    outputs = data.get("outputs")
    if not isinstance(outputs, list) or "SKILL.md" not in outputs:
        errors.append("skill.lock.json outputs must include SKILL.md.")
    return ArtifactValidationResult("skill.lock.json", errors, [])


def validate_native_skill_bundle(bundle_dir: Path) -> list[ArtifactValidationResult]:
    results = _check_required_files(bundle_dir)
    results.append(_check_frontmatter(bundle_dir))
    results.append(_check_script(bundle_dir, "scripts/run.sh"))
    results.append(_check_script(bundle_dir, "scripts/verify.sh"))
    results.append(_check_lock(bundle_dir))
    for ref in ("references/input_contract.md", "references/output_contract.md", "references/maintenance.md", "MODEL_COMPATIBILITY.md"):
        path = bundle_dir / ref
        results.append(
            ArtifactValidationResult(
                artifact=ref,
                errors=[] if path.exists() else [f"{ref} is missing."],
                warnings=[],
            )
        )
    return results


def evaluate_native_skill_bundle(bundle_dir: Path) -> EvaluationReport:
    validations = validate_native_skill_bundle(bundle_dir)
    results = [
        TestResult(
            test_id=result.artifact,
            passed=result.ok,
            output="pass" if result.ok else "fail",
            missing=[],
            reasons=result.errors,
            categories=["contract/native-bundle"] if not result.ok else [],
        )
        for result in validations
    ]
    passed = sum(1 for result in results if result.passed)
    total = len(results)
    return EvaluationReport(
        skill_name=bundle_dir.name,
        total=total,
        passed=passed,
        pass_rate=(passed / total) if total else 0.0,
        results=results,
        dimension_failures={},
    )


def derive_native_skill_plan_from_legacy(skill_dir: Path) -> dict[str, Any]:
    legacy_path = skill_dir / "SKILL.md"
    if not legacy_path.exists():
        legacy_path = skill_dir / "skill.md"
    frontmatter = parse_frontmatter(legacy_path.read_text(encoding="utf-8")) if legacy_path.exists() else {}
    skill_name = _coerce_text(frontmatter.get("name"), skill_dir.name)
    description = _coerce_text(frontmatter.get("description"), f"Native skill bundle for {skill_name}")
    version = _coerce_text(frontmatter.get("version"), "1.0.0")
    return {
        "skill_name": skill_name,
        "skill_title": skill_name.replace("-", " ").title(),
        "description": description,
        "version": version,
        "workflow": ["discover", "inspect", "plan", "execute", "verify", "summarize", "finalize"],
        "guardrails": [
            "Use scripts/run.sh and scripts/verify.sh as the declared entrypoints.",
            "Confine writes to declared output paths.",
            "Do not finalize before verification passes.",
        ],
        "final_response_checklist": [
            "Verification command completed successfully.",
            "Outputs are written to declared paths only.",
            "No secrets were persisted.",
        ],
    }


def migrate_legacy_skill_bundle(source_dir: Path, target_dir: Path | None = None) -> list[Path]:
    plan = derive_native_skill_plan_from_legacy(source_dir)
    bundle_dir = target_dir or source_dir
    return write_native_skill_bundle(bundle_dir, plan, overwrite=True)
