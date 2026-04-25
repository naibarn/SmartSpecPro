from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

SUBAGENT_CONTRACT_VERSION = 1
SubagentMode = Literal["tool", "handoff", "orchestrator"]
CheckpointPolicyMode = Literal["parent-run", "per-run", "per-step", "manual"]
FallbackBehavior = Literal["escalate-to-parent", "return-error", "retry-tool", "retry-handoff"]
HandoffPolicyMode = Literal["always", "never", "conditional"]
NetworkEgressMode = Literal["none", "allowlisted", "restricted", "inherit"]


class NativeSubagentContractError(ValueError):
    def __init__(self, *, code: str, issues: list[str]):
        super().__init__(code)
        self.code = code
        self.issues = issues


@dataclass(frozen=True)
class NativeSubagentCheckpointPolicy:
    mode: CheckpointPolicyMode
    resumeCursor: str | None = None


@dataclass(frozen=True)
class NativeSubagentHandoffPolicy:
    mode: HandoffPolicyMode
    approvalsRequired: bool = False


@dataclass(frozen=True)
class NativeSubagentFallbackPolicy:
    behavior: FallbackBehavior
    retryLimit: int = 0


@dataclass(frozen=True)
class NativeSubagentSecurityPolicy:
    toolAllowlist: tuple[str, ...]
    toolDenylist: tuple[str, ...]
    networkEgress: NetworkEgressMode
    filesystemScopes: tuple[str, ...]
    secretPolicy: dict[str, Any]
    fanoutLimit: int
    maxConcurrency: int
    allowedInvocationModes: tuple[Literal["tool", "handoff"], ...]


@dataclass(frozen=True)
class NativeSubagentNode:
    name: str
    role: str
    mode: SubagentMode
    entrypoint: str
    toolBoundary: tuple[str, ...] = ()
    model: str | None = None
    description: str | None = None
    handoffPolicy: NativeSubagentHandoffPolicy | None = None
    checkpointPolicy: NativeSubagentCheckpointPolicy | None = None
    verificationCommand: str | None = None
    fallbackBehavior: FallbackBehavior | None = None


@dataclass(frozen=True)
class NativeSubagentTopology:
    contractVersion: int
    orchestrator: NativeSubagentNode
    subagents: tuple[NativeSubagentNode, ...]
    routing: tuple[dict[str, str], ...]
    checkpointPolicy: NativeSubagentCheckpointPolicy
    verificationPolicy: dict[str, Any]
    fallbackPolicy: NativeSubagentFallbackPolicy
    securityPolicy: NativeSubagentSecurityPolicy
    sourcePath: Path
    raw: dict[str, Any] = field(default_factory=dict)

    def to_descriptor(self) -> dict[str, Any]:
        return {
            "contractVersion": self.contractVersion,
            "orchestrator": node_to_dict(self.orchestrator),
            "subagents": [node_to_dict(node) for node in self.subagents],
            "routing": [dict(rule) for rule in self.routing],
            "checkpointPolicy": checkpoint_policy_to_dict(self.checkpointPolicy),
            "verificationPolicy": dict(self.verificationPolicy),
            "fallbackPolicy": fallback_policy_to_dict(self.fallbackPolicy),
            "securityPolicy": security_policy_to_dict(self.securityPolicy),
            "sourcePath": str(self.sourcePath),
        }


_RELATIVE_PATH_RE = re.compile(r"^[A-Za-z0-9_.\-/]+$")


def canonical_json_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _clean_string(value: Any) -> str:
    return str(value or "").strip()


def _matches_allowed_prefix(raw: str, prefix: str) -> bool:
    normalized_prefix = prefix.rstrip("/")
    if raw == normalized_prefix:
        return True
    return raw.startswith(f"{normalized_prefix}/")


def _normalize_relative_path(value: Any, *, field_name: str, allowed_prefixes: tuple[str, ...]) -> str:
    raw = _clean_string(value).replace("\\", "/")
    if not raw:
        raise NativeSubagentContractError(code="missing_field", issues=[f"{field_name} is required"])
    if raw.startswith("/") or raw.startswith("../") or "/../" in raw or raw in {".", ".."}:
        raise NativeSubagentContractError(code="path_traversal", issues=[f"{field_name} must stay within the bundle"])
    if not _RELATIVE_PATH_RE.match(raw):
        raise NativeSubagentContractError(code="invalid_path", issues=[f"{field_name} contains unsupported characters"])
    if allowed_prefixes and not any(_matches_allowed_prefix(raw, prefix) for prefix in allowed_prefixes):
        prefixes = ", ".join(allowed_prefixes)
        raise NativeSubagentContractError(code="invalid_path_scope", issues=[f"{field_name} must stay under one of: {prefixes}"])
    normalized = Path(raw)
    if normalized.is_absolute() or any(part == ".." for part in normalized.parts):
        raise NativeSubagentContractError(code="path_traversal", issues=[f"{field_name} must stay within the bundle"])
    return normalized.as_posix()


def _parse_checkpoint_policy(raw: Any, *, field_name: str) -> NativeSubagentCheckpointPolicy:
    if not isinstance(raw, dict):
        raise NativeSubagentContractError(code="invalid_policy", issues=[f"{field_name} must be an object"])
    mode = _clean_string(raw.get("mode"))
    if mode not in {"parent-run", "per-run", "per-step", "manual"}:
        raise NativeSubagentContractError(code="invalid_policy", issues=[f"{field_name}.mode is invalid"])
    resume_cursor = raw.get("resumeCursor")
    if resume_cursor is not None and not _clean_string(resume_cursor):
        raise NativeSubagentContractError(code="invalid_policy", issues=[f"{field_name}.resumeCursor must be a non-empty string"])
    return NativeSubagentCheckpointPolicy(mode=mode, resumeCursor=_clean_string(resume_cursor) or None)


def _parse_handoff_policy(raw: Any) -> NativeSubagentHandoffPolicy | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise NativeSubagentContractError(code="invalid_policy", issues=["handoffPolicy must be an object"])
    mode = _clean_string(raw.get("mode"))
    if mode not in {"always", "never", "conditional"}:
        raise NativeSubagentContractError(code="invalid_policy", issues=["handoffPolicy.mode is invalid"])
    return NativeSubagentHandoffPolicy(mode=mode, approvalsRequired=bool(raw.get("approvalsRequired", False)))


def _parse_fallback_policy(raw: Any, *, field_name: str) -> NativeSubagentFallbackPolicy:
    if not isinstance(raw, dict):
        raise NativeSubagentContractError(code="invalid_policy", issues=[f"{field_name} must be an object"])
    behavior = _clean_string(raw.get("behavior"))
    if behavior not in {"escalate-to-parent", "return-error", "retry-tool", "retry-handoff"}:
        raise NativeSubagentContractError(code="invalid_policy", issues=[f"{field_name}.behavior is invalid"])
    retry_limit_raw = raw.get("retryLimit", 0)
    retry_limit = int(retry_limit_raw) if isinstance(retry_limit_raw, int) or str(retry_limit_raw).isdigit() else 0
    return NativeSubagentFallbackPolicy(behavior=behavior, retryLimit=max(0, retry_limit))


def node_to_dict(node: NativeSubagentNode) -> dict[str, Any]:
    return {
        "name": node.name,
        "role": node.role,
        "mode": node.mode,
        "entrypoint": node.entrypoint,
        "toolBoundary": list(node.toolBoundary),
        "model": node.model,
        "description": node.description,
        "handoffPolicy": None if node.handoffPolicy is None else {
            "mode": node.handoffPolicy.mode,
            "approvalsRequired": node.handoffPolicy.approvalsRequired,
        },
        "checkpointPolicy": None if node.checkpointPolicy is None else checkpoint_policy_to_dict(node.checkpointPolicy),
        "verificationCommand": node.verificationCommand,
        "fallbackBehavior": node.fallbackBehavior,
    }


def checkpoint_policy_to_dict(policy: NativeSubagentCheckpointPolicy) -> dict[str, Any]:
    return {
        "mode": policy.mode,
        "resumeCursor": policy.resumeCursor,
    }


def fallback_policy_to_dict(policy: NativeSubagentFallbackPolicy) -> dict[str, Any]:
    return {
        "behavior": policy.behavior,
        "retryLimit": policy.retryLimit,
    }


def security_policy_to_dict(policy: NativeSubagentSecurityPolicy) -> dict[str, Any]:
    return {
        "toolAllowlist": list(policy.toolAllowlist),
        "toolDenylist": list(policy.toolDenylist),
        "networkEgress": policy.networkEgress,
        "filesystemScopes": list(policy.filesystemScopes),
        "secretPolicy": dict(policy.secretPolicy),
        "fanoutLimit": policy.fanoutLimit,
        "maxConcurrency": policy.maxConcurrency,
        "allowedInvocationModes": list(policy.allowedInvocationModes),
    }


def _parse_string_list(raw: Any, *, field_name: str, required: bool = True) -> tuple[str, ...]:
    if not isinstance(raw, list):
        if required:
            raise NativeSubagentContractError(code="invalid_policy", issues=[f"{field_name} must be a list"])
        return ()
    values = tuple(_clean_string(item) for item in raw if _clean_string(item))
    if required and not values:
        raise NativeSubagentContractError(code="invalid_policy", issues=[f"{field_name} must be a non-empty list"])
    return values


def _parse_security_policy(raw: Any, *, subagents: tuple[NativeSubagentNode, ...]) -> NativeSubagentSecurityPolicy:
    if not isinstance(raw, dict):
        raise NativeSubagentContractError(code="invalid_policy", issues=["securityPolicy must be an object"])

    tool_allowlist = _parse_string_list(raw.get("toolAllowlist"), field_name="securityPolicy.toolAllowlist")
    tool_denylist = _parse_string_list(raw.get("toolDenylist"), field_name="securityPolicy.toolDenylist", required=False)
    filesystem_scopes = _parse_string_list(raw.get("filesystemScopes"), field_name="securityPolicy.filesystemScopes")
    network_egress = _clean_string(raw.get("networkEgress"))
    if network_egress not in {"none", "allowlisted", "restricted", "inherit"}:
        raise NativeSubagentContractError(code="invalid_policy", issues=["securityPolicy.networkEgress is invalid"])

    secret_policy = raw.get("secretPolicy")
    if not isinstance(secret_policy, dict):
        raise NativeSubagentContractError(code="invalid_policy", issues=["securityPolicy.secretPolicy must be an object"])
    if secret_policy.get("redact") is not True:
        raise NativeSubagentContractError(code="invalid_policy", issues=["securityPolicy.secretPolicy.redact must be true"])
    if _clean_string(secret_policy.get("persist")) not in {"never", "redacted", "runtime-only"}:
        raise NativeSubagentContractError(code="invalid_policy", issues=["securityPolicy.secretPolicy.persist is invalid"])

    try:
        fanout_limit = int(raw.get("fanoutLimit"))
        max_concurrency = int(raw.get("maxConcurrency"))
    except (TypeError, ValueError) as exc:
        raise NativeSubagentContractError(code="invalid_policy", issues=["securityPolicy fanoutLimit and maxConcurrency must be integers"]) from exc
    if not 1 <= fanout_limit <= 16:
        raise NativeSubagentContractError(code="invalid_policy", issues=["securityPolicy.fanoutLimit must be between 1 and 16"])
    if not 1 <= max_concurrency <= 16:
        raise NativeSubagentContractError(code="invalid_policy", issues=["securityPolicy.maxConcurrency must be between 1 and 16"])
    if max_concurrency > fanout_limit:
        raise NativeSubagentContractError(code="invalid_policy", issues=["securityPolicy.maxConcurrency must not exceed fanoutLimit"])

    raw_modes = _parse_string_list(raw.get("allowedInvocationModes"), field_name="securityPolicy.allowedInvocationModes")
    allowed_modes: list[Literal["tool", "handoff"]] = []
    for mode in raw_modes:
        if mode not in {"tool", "handoff"}:
            raise NativeSubagentContractError(code="invalid_policy", issues=["securityPolicy.allowedInvocationModes contains invalid mode"])
        allowed_modes.append(mode)  # type: ignore[arg-type]
    for index, node in enumerate(subagents):
        if node.mode in {"tool", "handoff"} and node.mode not in allowed_modes:
            raise NativeSubagentContractError(
                code="invalid_policy",
                issues=[f"subagents[{index}].mode is blocked by securityPolicy.allowedInvocationModes"],
            )

    return NativeSubagentSecurityPolicy(
        toolAllowlist=tool_allowlist,
        toolDenylist=tool_denylist,
        networkEgress=network_egress,  # type: ignore[arg-type]
        filesystemScopes=filesystem_scopes,
        secretPolicy={
            "redact": True,
            "persist": _clean_string(secret_policy.get("persist")),
        },
        fanoutLimit=fanout_limit,
        maxConcurrency=max_concurrency,
        allowedInvocationModes=tuple(allowed_modes),
    )


def _parse_node(
    raw: Any,
    *,
    field_name: str,
    allowed_entrypoint_prefixes: tuple[str, ...],
    allow_handoff_policy: bool,
) -> NativeSubagentNode:
    if not isinstance(raw, dict):
        raise NativeSubagentContractError(code="invalid_node", issues=[f"{field_name} must be an object"])

    name = _clean_string(raw.get("name"))
    role = _clean_string(raw.get("role"))
    mode = _clean_string(raw.get("mode") or raw.get("runtime_mode") or raw.get("runtimeMode"))
    entrypoint = _normalize_relative_path(raw.get("entrypoint"), field_name=f"{field_name}.entrypoint", allowed_prefixes=allowed_entrypoint_prefixes)

    if not name:
        raise NativeSubagentContractError(code="invalid_node", issues=[f"{field_name}.name is required"])
    if not role:
        raise NativeSubagentContractError(code="invalid_node", issues=[f"{field_name}.role is required"])
    if mode not in {"tool", "handoff", "orchestrator"}:
        raise NativeSubagentContractError(code="invalid_node", issues=[f"{field_name}.mode is invalid"])

    boundaries = tuple(
        _clean_string(item)
        for item in (raw.get("toolBoundary") or [])
        if _clean_string(item)
    )
    handoff_policy = _parse_handoff_policy(raw.get("handoffPolicy")) if allow_handoff_policy else None
    checkpoint_policy_raw = raw.get("checkpointPolicy")
    checkpoint_policy = _parse_checkpoint_policy(checkpoint_policy_raw, field_name=f"{field_name}.checkpointPolicy")
    verification_command = _clean_string(raw.get("verificationCommand")) or None
    fallback_behavior = _clean_string(raw.get("fallbackBehavior")) or None
    if fallback_behavior and fallback_behavior not in {"escalate-to-parent", "return-error", "retry-tool", "retry-handoff"}:
        raise NativeSubagentContractError(code="invalid_node", issues=[f"{field_name}.fallbackBehavior is invalid"])

    return NativeSubagentNode(
        name=name,
        role=role,
        mode=mode,
        entrypoint=entrypoint,
        toolBoundary=boundaries,
        model=_clean_string(raw.get("model")) or None,
        description=_clean_string(raw.get("description")) or None,
        handoffPolicy=handoff_policy,
        checkpointPolicy=checkpoint_policy,
        verificationCommand=verification_command,
        fallbackBehavior=fallback_behavior,  # type: ignore[arg-type]
    )


def validate_native_subagent_topology(payload: dict[str, Any] | None, *, source_path: Path) -> NativeSubagentTopology:
    if not isinstance(payload, dict):
        raise NativeSubagentContractError(code="missing_manifest", issues=["subagents.json is missing or invalid"])

    contract_version = int(payload.get("version") or SUBAGENT_CONTRACT_VERSION)
    if contract_version != SUBAGENT_CONTRACT_VERSION:
        raise NativeSubagentContractError(code="unsupported_contract", issues=["Unsupported subagent contract version"])

    orchestrator = _parse_node(
        payload.get("orchestrator"),
        field_name="orchestrator",
        allowed_entrypoint_prefixes=("agents/orchestrator.md",),
        allow_handoff_policy=False,
    )

    subagents_raw = payload.get("subagents")
    if not isinstance(subagents_raw, list) or not subagents_raw:
        raise NativeSubagentContractError(code="missing_subagents", issues=["subagents must contain at least one specialist"])

    subagents: list[NativeSubagentNode] = []
    seen_names: set[str] = {orchestrator.name, "orchestrator"}
    for index, item in enumerate(subagents_raw):
        node = _parse_node(
            item,
            field_name=f"subagents[{index}]",
            allowed_entrypoint_prefixes=("agents/specialists/",),
            allow_handoff_policy=True,
        )
        if node.name in seen_names:
            raise NativeSubagentContractError(code="duplicate_node", issues=[f"Duplicate subagent name: {node.name}"])
        seen_names.add(node.name)
        subagents.append(node)

    routing_raw = payload.get("routing") or []
    if not isinstance(routing_raw, list):
        raise NativeSubagentContractError(code="invalid_routing", issues=["routing must be a list"])
    routing: list[dict[str, str]] = []
    for index, item in enumerate(routing_raw):
        if not isinstance(item, dict):
            raise NativeSubagentContractError(code="invalid_routing", issues=[f"routing[{index}] must be an object"])
        from_name = _clean_string(item.get("from"))
        to_name = _clean_string(item.get("to"))
        if from_name not in seen_names:
            raise NativeSubagentContractError(code="invalid_routing", issues=[f"routing[{index}].from targets unknown node: {from_name}"])
        if to_name not in seen_names:
            raise NativeSubagentContractError(code="invalid_routing", issues=[f"routing[{index}].to targets unknown node: {to_name}"])
        routing.append({"from": from_name, "to": to_name})

    checkpoint_policy = _parse_checkpoint_policy(payload.get("checkpointPolicy"), field_name="checkpointPolicy")
    verification_policy = payload.get("verificationPolicy")
    if not isinstance(verification_policy, dict) or not _clean_string(verification_policy.get("command")):
        raise NativeSubagentContractError(code="invalid_policy", issues=["verificationPolicy.command is required"])
    fallback_policy = _parse_fallback_policy(payload.get("fallbackPolicy"), field_name="fallbackPolicy")
    security_policy = _parse_security_policy(payload.get("securityPolicy"), subagents=tuple(subagents))

    return NativeSubagentTopology(
        contractVersion=contract_version,
        orchestrator=orchestrator,
        subagents=tuple(subagents),
        routing=tuple(routing),
        checkpointPolicy=checkpoint_policy,
        verificationPolicy={
            "command": _clean_string(verification_policy.get("command")),
            "onFailure": _clean_string(verification_policy.get("onFailure")) or None,
        },
        fallbackPolicy=fallback_policy,
        securityPolicy=security_policy,
        sourcePath=source_path,
        raw=payload,
    )


def load_native_subagent_topology(bundle_dir: Path) -> NativeSubagentTopology | None:
    manifest_path = bundle_dir / "subagents.json"
    if not manifest_path.exists():
        return None
    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise NativeSubagentContractError(code="invalid_manifest", issues=["subagents.json could not be parsed"]) from exc
    if not isinstance(raw, dict):
        return validate_native_subagent_topology(None, source_path=manifest_path)

    lock_path = bundle_dir / "skill.lock.json"
    if not lock_path.exists():
        raise NativeSubagentContractError(
            code="manifest_integrity",
            issues=["skill.lock.json is required for subagent-aware bundles"],
        )
    try:
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise NativeSubagentContractError(
            code="manifest_integrity",
            issues=["skill.lock.json could not be parsed for subagent manifest integrity"],
        ) from exc
    if not isinstance(lock, dict):
        raise NativeSubagentContractError(
            code="manifest_integrity",
            issues=["skill.lock.json must be an object for subagent manifest integrity"],
        )
    if lock.get("subagent_manifest") not in {None, "subagents.json"}:
        raise NativeSubagentContractError(
            code="manifest_integrity",
            issues=["skill.lock.json subagent_manifest must be subagents.json"],
        )
    expected_hash = _clean_string(lock.get("subagent_manifest_sha256"))
    if not expected_hash:
        raise NativeSubagentContractError(
            code="manifest_integrity",
            issues=["skill.lock.json must include subagent_manifest_sha256"],
        )
    actual_hash = canonical_json_hash(raw)
    if expected_hash != actual_hash:
        raise NativeSubagentContractError(
            code="manifest_integrity",
            issues=["skill.lock.json subagent_manifest_sha256 does not match subagents.json"],
        )

    return validate_native_subagent_topology(raw, source_path=manifest_path)


def discover_native_subagents(bundle_dir: Path) -> list[str]:
    topology = load_native_subagent_topology(bundle_dir)
    if not topology:
        return []
    return [node.name for node in topology.subagents]


def resolve_native_subagent_route(topology: NativeSubagentTopology | None, requested_name: str | None) -> NativeSubagentNode | None:
    if topology is None:
        return None
    if requested_name:
        for node in (topology.orchestrator, *topology.subagents):
            if node.name == requested_name:
                return node
        raise NativeSubagentContractError(
            code="invalid_routing",
            issues=[f"Unknown subagent route requested: {requested_name}"],
        )
    return topology.orchestrator
