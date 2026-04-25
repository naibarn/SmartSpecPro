from __future__ import annotations

import hashlib
import json
import os
import re
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
NATIVE_SUBAGENT_MANIFEST_FILE = "subagents.json"
NATIVE_ORCHESTRATOR_DOC_FILE = "agents/orchestrator.md"
NATIVE_SUBAGENT_REFERENCE_FILE = "references/subagents.md"
NATIVE_SUBAGENT_SPECIALIST_DIR = "agents/specialists"


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


def _slugify(value: Any, default: str = "specialist") -> str:
    text = _coerce_text(value, default).lower()
    text = re.sub(r"[^a-z0-9_-]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-_")
    return text or default


def _as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if value is None:
        return []
    text = str(value).strip()
    return [text] if text else []


def _as_mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, Mapping):
        return {str(key): item for key, item in value.items()}
    return {}


def _coerce_mapping(value: Any) -> dict[str, Any]:
    return _as_mapping(value)


def _coerce_policy(value: Any, default: Any) -> Any:
    if isinstance(value, Mapping):
        return dict(value)
    if isinstance(value, list):
        return [item for item in value]
    text = _coerce_text(value)
    if text:
        return text
    return default


def _default_subagent_security_policy(subagents: list[Mapping[str, Any]]) -> dict[str, Any]:
    declared_modes = {
        _coerce_text(entry.get("mode") or entry.get("runtime_mode"), "tool")
        for entry in subagents
    }
    allowed_modes = ["tool"]
    if "handoff" in declared_modes:
        allowed_modes.append("handoff")
    fanout_limit = max(1, min(len(subagents) or 1, 8))
    return {
        "toolAllowlist": ["scripts/run.sh", "scripts/verify.sh", "echo", "cat", "ls", "pwd", "find"],
        "toolDenylist": ["rm", "curl", "wget", "ssh", "scp", "sudo", "bash", "sh", "python", "python3", "node"],
        "networkEgress": "none",
        "filesystemScopes": ["bundle", "workspace", "state", "out", "logs", ".agents"],
        "secretPolicy": {
            "redact": True,
            "persist": "never",
        },
        "fanoutLimit": fanout_limit,
        "maxConcurrency": min(fanout_limit, 2),
        "allowedInvocationModes": allowed_modes,
    }


def _normalize_bundle_relative_path(value: Any) -> str | None:
    text = _coerce_text(value)
    if not text:
        return None
    candidate = Path(text.replace("\\", "/"))
    if candidate.is_absolute():
        return None
    normalized = candidate.as_posix()
    if normalized in {"", ".", ".."}:
        return None
    if normalized.startswith("../") or "/../" in normalized:
        return None
    return normalized


def _bundle_has_subagent_surface(bundle: Mapping[str, Any]) -> bool:
    return bool(bundle.get("subagents"))


def _normalize_subagent_entry(entry: Any, index: int, skill_name: str) -> dict[str, Any]:
    data = _coerce_mapping(entry)
    name = _coerce_text(
        data.get("name") or data.get("slug") or data.get("id") or data.get("title"),
        f"specialist-{index + 1}",
    )
    entrypoint = _normalize_bundle_relative_path(
        data.get("entrypoint")
        or data.get("entry_point")
        or data.get("path")
        or f"{NATIVE_SUBAGENT_SPECIALIST_DIR}/{_slugify(name) or f'specialist-{index + 1}'}.md",
    ) or f"{NATIVE_SUBAGENT_SPECIALIST_DIR}/{_slugify(name) or f'specialist-{index + 1}'}.md"
    tool_boundary = _as_list(data.get("toolBoundary") or data.get("tool_boundary") or data.get("tool_boundary_paths")) or ["scripts/run.sh", "scripts/verify.sh"]
    handoff_policy = _coerce_policy(data.get("handoffPolicy") or data.get("handoff_policy"), {"mode": "never"})
    checkpoint_policy = _coerce_policy(data.get("checkpointPolicy") or data.get("checkpoint_policy"), {"mode": "per-run"})
    verification_command = _coerce_text(
        data.get("verificationCommand") or data.get("verification_command") or data.get("verification"),
        "scripts/verify.sh",
    )
    fallback_behavior = _coerce_text(
        data.get("fallbackBehavior") or data.get("fallback_behavior") or data.get("fallback"),
        "return-error",
    )
    mode = _coerce_text(data.get("mode") or data.get("runtime_mode") or data.get("runtimeMode"), "tool")
    runtime_mode = _coerce_text(data.get("runtime_mode") or data.get("runtimeMode") or mode, mode)
    owner = _coerce_text(data.get("owner"), skill_name)

    return {
        "name": name,
        "role": _coerce_text(data.get("role"), "specialist"),
        "owner": owner,
        "runtime_mode": runtime_mode,
        "mode": mode,
        "entrypoint": entrypoint,
        "toolBoundary": tool_boundary,
        "tool_boundary": tool_boundary,
        "handoffPolicy": handoff_policy,
        "handoff_policy": handoff_policy,
        "inputs": data.get("inputs") if isinstance(data.get("inputs"), list) else [],
        "outputs": data.get("outputs") if isinstance(data.get("outputs"), list) else [],
        "checkpointPolicy": checkpoint_policy,
        "checkpoint_policy": checkpoint_policy,
        "verificationCommand": verification_command,
        "verification_command": verification_command,
        "fallbackBehavior": fallback_behavior,
        "fallback_behavior": fallback_behavior,
    }


def _normalize_orchestrator_entry(plan: Mapping[str, Any]) -> dict[str, Any]:
    skill_name = _coerce_text(plan.get("skill_name"), "generated-skill")
    orchestrator = _coerce_mapping(plan.get("orchestrator"))
    name = _coerce_text(orchestrator.get("name"), skill_name)
    entrypoint = _normalize_bundle_relative_path(
        orchestrator.get("entrypoint") or orchestrator.get("path") or NATIVE_ORCHESTRATOR_DOC_FILE,
    ) or NATIVE_ORCHESTRATOR_DOC_FILE
    tool_boundary = _as_list(orchestrator.get("toolBoundary") or orchestrator.get("tool_boundary"))
    handoff_policy = _coerce_policy(orchestrator.get("handoffPolicy") or orchestrator.get("handoff_policy"), {"mode": "never"})
    checkpoint_policy = _coerce_policy(
        orchestrator.get("checkpointPolicy") or orchestrator.get("checkpoint_policy"),
        {"mode": "parent-run"},
    )
    verification_command = _coerce_text(
        orchestrator.get("verificationCommand") or orchestrator.get("verification_command"),
        "scripts/verify.sh",
    )
    fallback_behavior = _coerce_text(
        orchestrator.get("fallbackBehavior") or orchestrator.get("fallback_behavior"),
        "escalate-to-parent",
    )

    return {
        "name": name,
        "role": _coerce_text(orchestrator.get("role"), "orchestrator"),
        "owner": _coerce_text(orchestrator.get("owner"), skill_name),
        "runtime_mode": _coerce_text(orchestrator.get("runtime_mode") or orchestrator.get("runtimeMode"), "tool"),
        "mode": _coerce_text(orchestrator.get("mode"), "orchestrator"),
        "entrypoint": entrypoint,
        "toolBoundary": tool_boundary,
        "tool_boundary": tool_boundary,
        "handoffPolicy": handoff_policy,
        "handoff_policy": handoff_policy,
        "checkpointPolicy": checkpoint_policy,
        "checkpoint_policy": checkpoint_policy,
        "verificationCommand": verification_command,
        "verification_command": verification_command,
        "fallbackBehavior": fallback_behavior,
        "fallback_behavior": fallback_behavior,
    }


def _normalize_routing_rules(plan: Mapping[str, Any], subagents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    declared_subagents = {entry["name"] for entry in subagents}
    raw_routing = plan.get("routing")
    if isinstance(raw_routing, dict):
        raw_items: list[Any] = [
            {"from": key, "to": value} if not isinstance(value, Mapping) else {"from": key, **dict(value)}
            for key, value in raw_routing.items()
        ]
    elif isinstance(raw_routing, list):
        raw_items = list(raw_routing)
    else:
        raw_items = []

    routing: list[dict[str, Any]] = []
    for index, item in enumerate(raw_items):
        data = _coerce_mapping(item)
        target = _coerce_text(
            data.get("to") or data.get("target") or data.get("subagent") or data.get("destination"),
            "",
        )
        if not target and len(subagents) == 1:
            target = subagents[0]["name"]
        routing.append(
            {
                "from": _coerce_text(data.get("from") or data.get("source") or data.get("owner"), "orchestrator"),
                "to": target,
                "mode": _coerce_text(data.get("mode") or data.get("runtime_mode"), "tool"),
                "purpose": _coerce_text(data.get("purpose") or data.get("reason"), ""),
                "order": index,
            }
        )

    if not routing and subagents:
        routing = [
            {
                "from": "orchestrator",
                "to": entry["name"],
                "mode": entry["mode"],
                "purpose": _coerce_text(entry.get("role"), "specialist"),
                "order": index,
            }
            for index, entry in enumerate(subagents)
        ]

    return [
        {key: value for key, value in item.items() if value not in ("", None)}
        for item in routing
        if item.get("to") in declared_subagents or not declared_subagents
    ]


def _has_subagent_bundle(plan: Mapping[str, Any]) -> bool:
    return isinstance(plan.get("subagents"), list) and bool(plan.get("subagents"))


def _build_subagent_manifest(plan: Mapping[str, Any]) -> dict[str, Any] | None:
    if not _has_subagent_bundle(plan):
        return None

    subagents = [_normalize_subagent_entry(entry, index, _coerce_text(plan.get("skill_name"), "generated-skill")) for index, entry in enumerate(plan.get("subagents", []))]
    orchestrator = _normalize_orchestrator_entry(plan)
    routing = _normalize_routing_rules(plan, subagents)

    return {
        "version": _coerce_text(plan.get("subagent_manifest_version"), "1"),
        "orchestrator": orchestrator,
        "subagents": subagents,
        "routing": routing,
        "checkpointPolicy": _coerce_policy(plan.get("checkpointPolicy") or plan.get("checkpoint_policy"), {"mode": "parent-run"}),
        "verificationPolicy": _coerce_policy(plan.get("verificationPolicy") or plan.get("verification_policy"), {"command": "scripts/verify.sh"}),
        "fallbackPolicy": _coerce_policy(plan.get("fallbackPolicy") or plan.get("fallback_policy"), {"behavior": "escalate-to-parent"}),
        "securityPolicy": _coerce_policy(
            plan.get("securityPolicy") or plan.get("security_policy"),
            _default_subagent_security_policy(subagents),
        ),
    }


def _build_subagent_reference_doc(plan: Mapping[str, Any], manifest: Mapping[str, Any]) -> str:
    orchestrator = _coerce_mapping(manifest.get("orchestrator"))
    subagents = [dict(entry) for entry in manifest.get("subagents", []) if isinstance(entry, Mapping)]
    routing = [dict(entry) for entry in manifest.get("routing", []) if isinstance(entry, Mapping)]

    lines = [
        "# Subagent Topology",
        "",
        "This bundle declares a machine-readable `subagents.json` manifest.",
        "",
        "## Orchestrator",
        f"- Name: {orchestrator.get('name', _coerce_text(plan.get('skill_name'), 'generated-skill-orchestrator'))}",
        f"- Role: {orchestrator.get('role', 'orchestrator')}",
        f"- Entry point: `{orchestrator.get('entrypoint', NATIVE_ORCHESTRATOR_DOC_FILE)}`",
        "",
        "## Specialists",
    ]
    if not subagents:
        lines.append("- None")
    else:
        for entry in subagents:
            lines.append(f"- {entry.get('name', 'specialist')} ({entry.get('mode', 'tool')}): `{entry.get('entrypoint', NATIVE_SUBAGENT_SPECIALIST_DIR)}`")
    lines.extend(
        [
            "",
            "## Routing",
        ]
    )
    if not routing:
        lines.append("- None")
    else:
        for route in routing:
            target = route.get("to") or route.get("target") or route.get("subagent")
            lines.append(f"- {route.get('from', 'orchestrator')} -> {target}")
    lines.extend(
        [
            "",
            "## Policies",
            f"- Checkpoint policy: {_coerce_text(manifest.get('checkpointPolicy'), 'required')}",
            f"- Verification policy: {_coerce_text(manifest.get('verificationPolicy'), 'required')}",
            f"- Fallback policy: {_coerce_text(manifest.get('fallbackPolicy'), 'required')}",
            f"- Security policy: {_coerce_text(manifest.get('securityPolicy'), 'required')}",
            "",
        ]
    )
    return "\n".join(lines)


def _build_orchestrator_doc(plan: Mapping[str, Any], manifest: Mapping[str, Any]) -> str:
    orchestrator = _coerce_mapping(manifest.get("orchestrator"))
    subagents = [dict(entry) for entry in manifest.get("subagents", []) if isinstance(entry, Mapping)]
    specialist_names = ", ".join(entry.get("name", "specialist") for entry in subagents) or "none"

    return "\n".join(
        [
            "# Orchestrator",
            "",
            f"- Name: {orchestrator.get('name', _coerce_text(plan.get('skill_name'), 'generated-skill-orchestrator'))}",
            f"- Role: {orchestrator.get('role', 'orchestrator')}",
            f"- Entry point: `{orchestrator.get('entrypoint', NATIVE_ORCHESTRATOR_DOC_FILE)}`",
            f"- Owned by: {orchestrator.get('owner', _coerce_text(plan.get('skill_name'), 'generated-skill'))}",
            f"- Specialist coverage: {specialist_names}",
            "",
            "## Operating Notes",
            "- Keep the orchestrator in control by default.",
            "- Use specialists as bounded tools before escalating ownership.",
            "- Verify checkpoints before finalizing the run.",
            "",
        ]
    )


def _build_specialist_doc(plan: Mapping[str, Any], manifest_entry: Mapping[str, Any]) -> str:
    return "\n".join(
        [
            f"# {manifest_entry.get('name', 'specialist')}",
            "",
            f"- Role: {manifest_entry.get('role', 'specialist')}",
            f"- Mode: {manifest_entry.get('mode', 'tool')}",
            f"- Entry point: `{manifest_entry.get('entrypoint', NATIVE_SUBAGENT_SPECIALIST_DIR)}`",
            f"- Owner: {manifest_entry.get('owner', _coerce_text(plan.get('skill_name'), 'generated-skill'))}",
            f"- Tool boundary: {', '.join(manifest_entry.get('toolBoundary', [])) or 'none'}",
            f"- Handoff policy: {_coerce_text(manifest_entry.get('handoffPolicy'), 'never')}",
            f"- Checkpoint policy: {_coerce_text(manifest_entry.get('checkpointPolicy'), 'required')}",
            f"- Verification command: {_coerce_text(manifest_entry.get('verificationCommand'), 'scripts/verify.sh')}",
            f"- Fallback behavior: {_coerce_text(manifest_entry.get('fallbackBehavior'), 'return-error')}",
            "",
        ]
    )


def _subagent_output_paths(plan: Mapping[str, Any], manifest: Mapping[str, Any] | None) -> list[str]:
    if not manifest:
        return []

    outputs = [NATIVE_SUBAGENT_MANIFEST_FILE, NATIVE_ORCHESTRATOR_DOC_FILE, NATIVE_SUBAGENT_REFERENCE_FILE]
    outputs.extend(
        entry["entrypoint"]
        for entry in manifest.get("subagents", [])
        if isinstance(entry, Mapping) and _normalize_bundle_relative_path(entry.get("entrypoint"))
    )
    return outputs


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
    category = _coerce_text(source.get("category") or "automation", "automation")
    execution_mode = _coerce_text(source.get("execution_mode") or "sandbox-command", "sandbox-command")
    inputs = source.get("inputs") if isinstance(source.get("inputs"), list) else []
    outputs = source.get("outputs") if isinstance(source.get("outputs"), list) else []
    workflow = source.get("workflow") if isinstance(source.get("workflow"), list) else source.get("logic_steps") if isinstance(source.get("logic_steps"), list) else []
    guardrails = source.get("guardrails") if isinstance(source.get("guardrails"), list) else []
    verification = _coerce_text(source.get("verification") or source.get("verify_command") or "scripts/verify.sh")
    final_checklist = source.get("final_response_checklist") if isinstance(source.get("final_response_checklist"), list) else []
    trigger_patterns = source.get("trigger_patterns") if isinstance(source.get("trigger_patterns"), list) else source.get("triggerPatterns") if isinstance(source.get("triggerPatterns"), list) else []
    subagents = source.get("subagents") if isinstance(source.get("subagents"), list) else []
    orchestrator = source.get("orchestrator") if isinstance(source.get("orchestrator"), Mapping) else {}
    routing = source.get("routing") if isinstance(source.get("routing"), (list, dict)) else []
    checkpoint_policy = source.get("checkpointPolicy") if isinstance(source.get("checkpointPolicy"), Mapping) else source.get("checkpoint_policy") if isinstance(source.get("checkpoint_policy"), Mapping) else {}
    verification_policy = source.get("verificationPolicy") if isinstance(source.get("verificationPolicy"), Mapping) else source.get("verification_policy") if isinstance(source.get("verification_policy"), Mapping) else {}
    fallback_policy = source.get("fallbackPolicy") if isinstance(source.get("fallbackPolicy"), Mapping) else source.get("fallback_policy") if isinstance(source.get("fallback_policy"), Mapping) else {}
    security_policy = source.get("securityPolicy") if isinstance(source.get("securityPolicy"), Mapping) else source.get("security_policy") if isinstance(source.get("security_policy"), Mapping) else {}

    return {
        "skill_name": skill_name,
        "skill_title": skill_title,
        "description": description,
        "version": version,
        "category": category,
        "execution_mode": execution_mode,
        "inputs": inputs,
        "outputs": outputs,
        "workflow": workflow,
        "guardrails": guardrails,
        "verification": verification,
        "final_response_checklist": final_checklist,
        "trigger_patterns": trigger_patterns,
        "subagents": subagents,
        "orchestrator": orchestrator,
        "routing": routing,
        "checkpointPolicy": checkpoint_policy,
        "verificationPolicy": verification_policy,
        "fallbackPolicy": fallback_policy,
        "securityPolicy": security_policy,
        "target_platform": NATIVE_TARGET_PLATFORM,
        "mirror_skill_md": bool(source.get("mirror_skill_md", True)),
        "model_compatibility": source.get("model_compatibility") if isinstance(source.get("model_compatibility"), dict) else {},
        "subagent_manifest_version": _coerce_text(source.get("subagent_manifest_version") or source.get("subagents_version"), "1"),
    }


def build_native_skill_markdown(plan: Mapping[str, Any] | None) -> str:
    normalized = normalize_skill_plan(plan)
    subagent_manifest = _build_subagent_manifest(normalized)
    frontmatter = _render_frontmatter(
        {
            "name": normalized["skill_name"],
            "description": normalized["description"],
            "version": normalized["version"],
            "category": normalized["category"],
            "execution_mode": normalized["execution_mode"],
            "target_platform": NATIVE_TARGET_PLATFORM,
            "bundle_topology": "subagent-aware" if subagent_manifest else "single-agent",
            "triggerPatterns": normalized["trigger_patterns"] or [
                normalized["skill_name"].replace("-", " "),
                normalized["skill_title"],
            ],
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
        "## OpenAI Agents SDK Compatibility\n\n"
        "- Mount this bundle into the Agents SDK `Skills` sandbox capability.\n"
        "- Keep `scripts/run.sh` and `scripts/verify.sh` deterministic and shell-safe.\n"
        "- Prefer structured outputs, explicit inputs, and resumable artifacts.\n",
        _format_block("Inputs", inputs),
        _format_block("Workflow", workflow),
        "## Exact Commands\n\n" + "\n".join(f"- `{command}`" for command in exact_commands) + "\n",
        _format_block("Guardrails", guardrails),
        "## Verification\n\n- Run `scripts/verify.sh` before finalizing any run.\n",
        _format_block("Final Response Checklist", final_checklist),
    ]
    if subagent_manifest:
        sections.extend(
            [
                "## Subagent Topology\n\n"
                f"- Machine-readable topology: `{NATIVE_SUBAGENT_MANIFEST_FILE}`\n"
                f"- Orchestrator docs: `{NATIVE_ORCHESTRATOR_DOC_FILE}`\n"
                f"- Specialist docs: `{NATIVE_SUBAGENT_SPECIALIST_DIR}/*.md`\n"
                f"- Routing policy: {len(subagent_manifest.get('routing', []))} rule(s)\n",
            ]
        )
    return "\n".join(section.rstrip() for section in sections).strip() + "\n"


def build_model_compatibility_doc(plan: Mapping[str, Any] | None) -> str:
    normalized = normalize_skill_plan(plan)
    subagent_manifest = _build_subagent_manifest(normalized)
    compatibility = normalized["model_compatibility"]
    hard_min = _as_list(compatibility.get("hard_minimum") if isinstance(compatibility, dict) else None)
    recommended = _as_list(compatibility.get("recommended") if isinstance(compatibility, dict) else None)
    optional = _as_list(compatibility.get("optional") if isinstance(compatibility, dict) else None)
    caveats = _as_list(compatibility.get("caveats") if isinstance(compatibility, dict) else None)
    tier = _coerce_text(compatibility.get("tier") if isinstance(compatibility, dict) else None, "Tier B - Recommended")
    if normalized["target_platform"] == NATIVE_TARGET_PLATFORM:
        tier = "Tier A - Agents SDK ready"
    support_tier = "Explicit subagent topology" if subagent_manifest else "Single-agent"

    return "\n".join(
        [
            "# Model Compatibility",
            "",
            f"Support tier: {tier}",
            f"Subagent support: {support_tier}",
            "",
            "## Agents SDK Notes",
            "- Compatible with OpenAI Agents SDK `Skills` sandbox mounting.",
            "- Best results come from explicit inputs, structured outputs, and deterministic scripts.",
            "- Handoffs and context injection should stay outside the bundle entry scripts.",
            *(["", "## Subagent Notes"] if subagent_manifest else []),
            *(["- Topology manifest: `subagents.json`", "- Keep routing and checkpoint policy in sync with `SKILL.md`."] if subagent_manifest else []),
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
    subagent_manifest = _build_subagent_manifest(normalized)
    outputs = [
        "SKILL.md",
        "scripts/run.sh",
        "scripts/verify.sh",
        "references/input_contract.md",
        "references/output_contract.md",
        "references/maintenance.md",
        "MODEL_COMPATIBILITY.md",
    ]
    if subagent_manifest:
        outputs.extend(_subagent_output_paths(normalized, subagent_manifest))
    if normalized["mirror_skill_md"]:
        outputs.append("skill.md")

    lock = {
        "name": normalized["skill_name"],
        "version": normalized["version"],
        "target_platform": NATIVE_TARGET_PLATFORM,
        "bundle_topology": "subagent-aware" if subagent_manifest else "single-agent",
        "entrypoints": {
            "run": "scripts/run.sh",
            "verify": "scripts/verify.sh",
        },
        "outputs": outputs,
        "supported_modes": ["create", "improve", "maintenance"],
        "compatibility_mirror_policy": "mirror-skill-md" if normalized["mirror_skill_md"] else "no-mirror",
        "subagent_manifest": NATIVE_SUBAGENT_MANIFEST_FILE if subagent_manifest else None,
    }
    if subagent_manifest:
        lock["subagent_manifest_sha256"] = _canonical_json_hash(subagent_manifest)
    return lock


def build_native_skill_files(plan: Mapping[str, Any] | None) -> dict[str, str]:
    normalized = normalize_skill_plan(plan)
    skill_md = build_native_skill_markdown(normalized)
    lock = json.dumps(build_skill_lock(normalized), ensure_ascii=False, indent=2) + "\n"
    compatibility = build_model_compatibility_doc(normalized)
    subagent_manifest = _build_subagent_manifest(normalized)

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
    if subagent_manifest:
        files[NATIVE_SUBAGENT_MANIFEST_FILE] = json.dumps(subagent_manifest, ensure_ascii=False, indent=2) + "\n"
        files[NATIVE_ORCHESTRATOR_DOC_FILE] = _build_orchestrator_doc(normalized, subagent_manifest)
        files[NATIVE_SUBAGENT_REFERENCE_FILE] = _build_subagent_reference_doc(normalized, subagent_manifest)
        for specialist in subagent_manifest.get("subagents", []):
            if not isinstance(specialist, Mapping):
                continue
            entrypoint = _normalize_bundle_relative_path(specialist.get("entrypoint")) or f"{NATIVE_SUBAGENT_SPECIALIST_DIR}/{_slugify(str(specialist.get('name', 'specialist')))}.md"
            files[entrypoint] = _build_specialist_doc(normalized, specialist)
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


def _check_required_files(bundle_dir: Path, required_files: Iterable[str]) -> list[ArtifactValidationResult]:
    results: list[ArtifactValidationResult] = []
    for relative_path in required_files:
        exists = (bundle_dir / relative_path).exists()
        results.append(
            ArtifactValidationResult(
                artifact=relative_path,
                errors=[] if exists else [f"Missing required native bundle file: {relative_path}"],
                warnings=[],
            )
        )
    return results


def _list_specialist_docs(bundle_dir: Path) -> list[str]:
    specialist_dir = bundle_dir / NATIVE_SUBAGENT_SPECIALIST_DIR
    if not specialist_dir.exists():
        return []
    return sorted(
        path.relative_to(bundle_dir).as_posix()
        for path in specialist_dir.rglob("*.md")
        if path.is_file()
    )


def _read_json_object(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def _canonical_json_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def parse_native_subagents_manifest(bundle_dir: Path) -> dict[str, Any] | None:
    return _read_json_object(bundle_dir / NATIVE_SUBAGENT_MANIFEST_FILE)


def _check_subagent_manifest(bundle_dir: Path) -> ArtifactValidationResult:
    manifest_path = bundle_dir / NATIVE_SUBAGENT_MANIFEST_FILE
    if not manifest_path.exists():
        return ArtifactValidationResult(NATIVE_SUBAGENT_MANIFEST_FILE, [], [])

    errors: list[str] = []
    manifest = parse_native_subagents_manifest(bundle_dir)
    if manifest is None:
        return ArtifactValidationResult(NATIVE_SUBAGENT_MANIFEST_FILE, [f"{NATIVE_SUBAGENT_MANIFEST_FILE} is missing or invalid JSON."], [])

    required_top_level = ("version", "orchestrator", "subagents", "routing", "checkpointPolicy", "verificationPolicy", "fallbackPolicy", "securityPolicy")
    for key in required_top_level:
        if key not in manifest or manifest.get(key) in (None, "", [], {}):
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} missing required top-level field: {key}")

    lock = parse_native_skill_lock(bundle_dir) or {}
    skill_md = bundle_dir / "SKILL.md"
    frontmatter = parse_frontmatter(skill_md.read_text(encoding="utf-8")) if skill_md.exists() else {}
    subagents = manifest.get("subagents")
    orchestrator = manifest.get("orchestrator")
    routing = manifest.get("routing")
    security_policy = manifest.get("securityPolicy")

    if manifest and lock:
        expected_hash = lock.get("subagent_manifest_sha256")
        if not isinstance(expected_hash, str) or not expected_hash.strip():
            errors.append("skill.lock.json must include subagent_manifest_sha256 for subagent-aware bundles.")
        else:
            actual_hash = _canonical_json_hash(manifest)
            if expected_hash.strip() != actual_hash:
                errors.append("skill.lock.json subagent_manifest_sha256 does not match subagents.json.")

    if not isinstance(subagents, list) or not subagents:
        errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} subagents must be a non-empty array.")
        subagents = []
    if not isinstance(orchestrator, dict):
        errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} orchestrator must be an object.")
        orchestrator = {}
    if not isinstance(routing, list) and not isinstance(routing, dict):
        errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} routing must be an array or object.")
    if frontmatter.get("name") and orchestrator.get("owner") and str(frontmatter.get("name")) != str(orchestrator.get("owner")):
        errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} orchestrator owner must match SKILL.md name.")

    for field in ("name", "role", "mode", "entrypoint", "checkpointPolicy", "verificationCommand", "fallbackBehavior"):
        if orchestrator.get(field) in (None, "", [], {}):
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} orchestrator missing required field: {field}")

    if orchestrator.get("entrypoint") and _normalize_bundle_relative_path(orchestrator.get("entrypoint")) != NATIVE_ORCHESTRATOR_DOC_FILE:
        errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} orchestrator entrypoint must be {NATIVE_ORCHESTRATOR_DOC_FILE}.")

    declared_names: set[str] = set()
    declared_entrypoints: set[str] = set()
    for index, raw_entry in enumerate(subagents):
        entry = raw_entry if isinstance(raw_entry, dict) else {}
        name = _coerce_text(entry.get("name") or entry.get("slug") or entry.get("id"), "")
        if not name:
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} subagents[{index}] is missing name.")
            continue
        declared_names.add(name)

        for field in ("role", "mode", "entrypoint", "toolBoundary", "handoffPolicy", "checkpointPolicy", "verificationCommand", "fallbackBehavior"):
            value = entry.get(field)
            if value in (None, "", [], {}):
                errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} subagents[{index}] missing required field: {field}")

        entrypoint = _normalize_bundle_relative_path(entry.get("entrypoint"))
        if not entrypoint:
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} subagents[{index}] entrypoint must stay inside the bundle.")
            continue
        if not entrypoint.startswith(f"{NATIVE_SUBAGENT_SPECIALIST_DIR}/"):
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} subagents[{index}] entrypoint must live under {NATIVE_SUBAGENT_SPECIALIST_DIR}/.")
        declared_entrypoints.add(entrypoint)
        if not (bundle_dir / entrypoint).exists():
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} subagents[{index}] entrypoint is missing: {entrypoint}")

    if isinstance(routing, list):
        for index, raw_rule in enumerate(routing):
            rule = raw_rule if isinstance(raw_rule, dict) else {}
            target = _coerce_text(rule.get("to") or rule.get("target") or rule.get("subagent"), "")
            if target and target not in declared_names:
                errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} routing[{index}] targets undeclared subagent: {target}")
    else:
        for key, value in routing.items():
            target = key if key in declared_names else _coerce_text(value if not isinstance(value, Mapping) else value.get("to") or value.get("target") or value.get("subagent"), "")
            if target and target not in declared_names:
                errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} routing rule targets undeclared subagent: {target}")

    if isinstance(manifest.get("checkpointPolicy"), (list, dict)) and not manifest.get("checkpointPolicy"):
        errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} checkpointPolicy must not be empty.")
    if isinstance(manifest.get("verificationPolicy"), (list, dict)) and not manifest.get("verificationPolicy"):
        errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} verificationPolicy must not be empty.")
    if isinstance(manifest.get("fallbackPolicy"), (list, dict)) and not manifest.get("fallbackPolicy"):
        errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} fallbackPolicy must not be empty.")
    if not isinstance(security_policy, dict) or not security_policy:
        errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} securityPolicy must be a non-empty object.")
    else:
        allowed_modes = security_policy.get("allowedInvocationModes")
        if not isinstance(allowed_modes, list) or not allowed_modes:
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} securityPolicy.allowedInvocationModes must be a non-empty array.")
            allowed_modes = []
        else:
            invalid_modes = sorted({str(item) for item in allowed_modes if str(item) not in {"tool", "handoff"}})
            if invalid_modes:
                errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} securityPolicy.allowedInvocationModes contains invalid mode(s): {', '.join(invalid_modes)}")

        for key in ("toolAllowlist", "toolDenylist", "filesystemScopes"):
            values = security_policy.get(key)
            if not isinstance(values, list):
                errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} securityPolicy.{key} must be an array.")
        if security_policy.get("networkEgress") not in {"none", "allowlisted", "restricted", "inherit"}:
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} securityPolicy.networkEgress is invalid.")
        secret_policy = security_policy.get("secretPolicy")
        if not isinstance(secret_policy, dict) or secret_policy.get("redact") is not True or secret_policy.get("persist") not in {"never", "redacted", "runtime-only"}:
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} securityPolicy.secretPolicy must redact secrets and declare a valid persist mode.")
        fanout_limit = security_policy.get("fanoutLimit")
        max_concurrency = security_policy.get("maxConcurrency")
        if not isinstance(fanout_limit, int) or not 1 <= fanout_limit <= 16:
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} securityPolicy.fanoutLimit must be between 1 and 16.")
        if not isinstance(max_concurrency, int) or not 1 <= max_concurrency <= 16:
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} securityPolicy.maxConcurrency must be between 1 and 16.")
        if isinstance(fanout_limit, int) and isinstance(max_concurrency, int) and max_concurrency > fanout_limit:
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} securityPolicy.maxConcurrency must not exceed fanoutLimit.")
        if isinstance(allowed_modes, list):
            for index, raw_entry in enumerate(subagents):
                if isinstance(raw_entry, dict):
                    mode = _coerce_text(raw_entry.get("mode"), "tool")
                    if mode in {"tool", "handoff"} and mode not in allowed_modes:
                        errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} subagents[{index}] mode is blocked by securityPolicy.allowedInvocationModes.")

    specialist_docs = _list_specialist_docs(bundle_dir)
    undeclared_docs = sorted(set(specialist_docs) - declared_entrypoints)
    if undeclared_docs:
        errors.append(
            f"{NATIVE_SUBAGENT_MANIFEST_FILE} contains undeclared specialist doc(s): {', '.join(undeclared_docs)}"
        )

    declared_outputs = set(lock.get("outputs") if isinstance(lock.get("outputs"), list) else [])
    for required_output in (
        NATIVE_SUBAGENT_MANIFEST_FILE,
        NATIVE_ORCHESTRATOR_DOC_FILE,
        NATIVE_SUBAGENT_REFERENCE_FILE,
        *declared_entrypoints,
    ):
        if required_output and required_output not in declared_outputs:
            errors.append(f"skill.lock.json outputs must include {required_output}.")

    return ArtifactValidationResult(NATIVE_SUBAGENT_MANIFEST_FILE, errors, [])


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
    if (bundle_dir / NATIVE_SUBAGENT_MANIFEST_FILE).exists():
        manifest = parse_native_subagents_manifest(bundle_dir)
        if manifest is None:
            errors.append(f"{NATIVE_SUBAGENT_MANIFEST_FILE} is invalid JSON.")
        elif data.get("subagent_manifest_sha256") != _canonical_json_hash(manifest):
            errors.append("skill.lock.json subagent_manifest_sha256 must match subagents.json.")
    return ArtifactValidationResult("skill.lock.json", errors, [])


def validate_native_skill_bundle(bundle_dir: Path) -> list[ArtifactValidationResult]:
    results = _check_required_files(bundle_dir, NATIVE_REQUIRED_FILES)
    results.append(_check_frontmatter(bundle_dir))
    results.append(_check_script(bundle_dir, "scripts/run.sh"))
    results.append(_check_script(bundle_dir, "scripts/verify.sh"))
    results.append(_check_lock(bundle_dir))
    has_subagent_surface = (
        (bundle_dir / NATIVE_SUBAGENT_MANIFEST_FILE).exists()
        or (bundle_dir / NATIVE_ORCHESTRATOR_DOC_FILE).exists()
        or (bundle_dir / NATIVE_SUBAGENT_REFERENCE_FILE).exists()
        or bool(_list_specialist_docs(bundle_dir))
    )
    if has_subagent_surface:
        results.extend(_check_required_files(bundle_dir, (NATIVE_SUBAGENT_MANIFEST_FILE, NATIVE_ORCHESTRATOR_DOC_FILE, NATIVE_SUBAGENT_REFERENCE_FILE)))
        results.append(_check_subagent_manifest(bundle_dir))
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


def derive_native_skill_plan_from_bundle(bundle_dir: Path) -> dict[str, Any]:
    lock = parse_native_skill_lock(bundle_dir) or {}
    manifest = parse_native_subagents_manifest(bundle_dir) or {}
    skill_md = bundle_dir / "SKILL.md"
    frontmatter = parse_frontmatter(skill_md.read_text(encoding="utf-8")) if skill_md.exists() else {}
    if not frontmatter and (bundle_dir / "skill.md").exists():
        frontmatter = parse_frontmatter((bundle_dir / "skill.md").read_text(encoding="utf-8"))

    plan = derive_native_skill_plan_from_legacy(bundle_dir)
    plan["skill_name"] = _coerce_text(lock.get("name") or frontmatter.get("name") or plan.get("skill_name"), plan["skill_name"])
    plan["skill_title"] = _coerce_text(frontmatter.get("name") or plan.get("skill_title"), plan["skill_title"])
    plan["description"] = _coerce_text(frontmatter.get("description") or plan.get("description"), plan["description"])
    plan["version"] = _coerce_text(lock.get("version") or frontmatter.get("version") or plan.get("version"), plan["version"])
    plan["category"] = _coerce_text(frontmatter.get("category") or lock.get("category") or plan.get("category"), "automation")
    plan["execution_mode"] = _coerce_text(frontmatter.get("execution_mode") or lock.get("execution_mode") or plan.get("execution_mode"), "sandbox-command")
    plan["trigger_patterns"] = (
        list(frontmatter.get("triggerPatterns") or frontmatter.get("trigger_patterns") or plan["trigger_patterns"])
        if isinstance(frontmatter.get("triggerPatterns") or frontmatter.get("trigger_patterns"), list)
        else plan["trigger_patterns"]
    )
    plan["subagents"] = manifest.get("subagents", plan.get("subagents", [])) if isinstance(manifest.get("subagents"), list) else plan.get("subagents", [])
    plan["orchestrator"] = manifest.get("orchestrator", plan.get("orchestrator", {})) if isinstance(manifest.get("orchestrator"), Mapping) else plan.get("orchestrator", {})
    plan["routing"] = manifest.get("routing", plan.get("routing", [])) if isinstance(manifest.get("routing"), (list, dict)) else plan.get("routing", [])
    plan["checkpointPolicy"] = manifest.get("checkpointPolicy", plan.get("checkpointPolicy", {})) if isinstance(manifest.get("checkpointPolicy"), Mapping) else plan.get("checkpointPolicy", {})
    plan["verificationPolicy"] = manifest.get("verificationPolicy", plan.get("verificationPolicy", {})) if isinstance(manifest.get("verificationPolicy"), Mapping) else plan.get("verificationPolicy", {})
    plan["fallbackPolicy"] = manifest.get("fallbackPolicy", plan.get("fallbackPolicy", {})) if isinstance(manifest.get("fallbackPolicy"), Mapping) else plan.get("fallbackPolicy", {})
    plan["subagent_manifest_version"] = _coerce_text(manifest.get("version"), plan.get("subagent_manifest_version", "1")) if manifest else plan.get("subagent_manifest_version", "1")
    plan["mirror_skill_md"] = True if frontmatter or lock else plan.get("mirror_skill_md", True)
    return normalize_skill_plan(plan)


def _apply_improvement_request(plan: dict[str, Any], improvement_request: str = "") -> dict[str, Any]:
    request = _coerce_text(improvement_request).lower()
    updated = dict(plan)
    if not request:
        return updated

    guardrails = list(updated.get("guardrails") or [])
    final_checklist = list(updated.get("final_response_checklist") or [])
    model_compatibility = dict(updated.get("model_compatibility") or {})

    def _add_unique(bucket: list[str], value: str) -> None:
        if value and value not in bucket:
            bucket.append(value)

    if any(token in request for token in ("deterministic", "reliable", "repeatable", "stable")):
        _add_unique(guardrails, "Keep scripts deterministic, idempotent, and shell-safe.")
        _add_unique(model_compatibility.setdefault("recommended", []), "deterministic scripts")

    if any(token in request for token in ("structured output", "structured outputs", "json output", "schema")):
        _add_unique(guardrails, "Prefer structured outputs that validate against the bundle contract.")
        _add_unique(model_compatibility.setdefault("recommended", []), "structured outputs")

    if any(token in request for token in ("trace", "debug", "observability", "log")):
        _add_unique(guardrails, "Keep logs trace-friendly with explicit task IDs and outcome messages.")
        _add_unique(model_compatibility.setdefault("recommended", []), "trace-friendly logs")

    if any(token in request for token in ("handoff", "orchestr", "multi-agent", "agent swam", "swarm")):
        _add_unique(model_compatibility.setdefault("optional", []), "handoffs")
        _add_unique(model_compatibility.setdefault("optional", []), "multi-agent orchestration")

    if "retry" in request or "requeue" in request:
        _add_unique(final_checklist, "Retry behavior is documented and safe to re-run.")
        _add_unique(guardrails, "Retry should preserve prior trace metadata and lineage.")

    if "legacy" in request or "migrate" in request:
        _add_unique(guardrails, "Preserve compatibility with legacy skill metadata during migration.")

    updated["guardrails"] = guardrails
    updated["final_response_checklist"] = final_checklist
    updated["model_compatibility"] = model_compatibility
    return updated


def improve_native_skill_bundle(bundle_dir: Path, improvement_request: str = "", overwrite: bool = True) -> tuple[list[Path], EvaluationReport, dict[str, Any]]:
    if is_native_skill_bundle(bundle_dir):
        plan = derive_native_skill_plan_from_bundle(bundle_dir)
    else:
        plan = derive_native_skill_plan_from_legacy(bundle_dir)
    plan = _apply_improvement_request(plan, improvement_request)

    try:
        current_version = str(plan.get("version") or "1.0.0")
        parts = [int(part) for part in current_version.split(".")[:3]]
        while len(parts) < 3:
            parts.append(0)
        parts[2] += 1
        plan["version"] = ".".join(str(part) for part in parts[:3])
    except Exception:
        plan["version"] = "1.0.1"

    written = write_native_skill_bundle(bundle_dir, plan, overwrite=overwrite)
    report = evaluate_native_skill_bundle(bundle_dir)
    return written, report, plan


def migrate_legacy_skill_bundle(source_dir: Path, target_dir: Path | None = None) -> list[Path]:
    plan = derive_native_skill_plan_from_legacy(source_dir)
    bundle_dir = target_dir or source_dir
    return write_native_skill_bundle(bundle_dir, plan, overwrite=True)
