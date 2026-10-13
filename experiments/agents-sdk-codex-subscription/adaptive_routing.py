"""Task-aware model routing for the isolated Codex subscription WorkUnit pilot."""

from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Iterable


POLICY_VERSION = "adaptive-routing.v1"
AUTH_ROUTE = "existing ChatGPT/Codex login through Codex app-server"


class ModelProfile(StrEnum):
    GENERAL = "GENERAL"
    REASONING = "REASONING"
    REVIEW = "REVIEW"


@dataclass(frozen=True)
class CatalogModel:
    model_id: str
    description: str
    efforts: frozenset[str]
    is_default: bool = False


@dataclass(frozen=True)
class FailureEvidence:
    category: str
    signature: str | None
    meaningful_progress: bool
    iteration: int | None
    changed_paths: tuple[str, ...] = ()
    source_revision: str | None = None
    unresolved_requirement_count: int | None = None


class RoutingConfigurationError(ValueError):
    """A configured model or effort is not supported by the live SDK catalog."""


class RoutingUnavailableError(RoutingConfigurationError):
    """No configured or authorized fallback route is currently eligible."""


_ENVIRONMENT_PATTERNS = (
    ("authentication", re.compile(r"authentication (?:failed|error|required|expired)|auth(?:entication)?error|unauthorized request|invalid (?:api )?token|http(?: error)?\s*401|login expired", re.I)),
    ("permission", re.compile(r"permissionerror|permission denied|not authorized|http(?: error)?\s*403", re.I)),
    ("capacity", re.compile(r"\b(?:ratelimiterror|rate[_ ]limit(?: exceeded| exhausted)?|quota (?:exhausted|exceeded|limit reached)|capacity (?:unavailable|exhausted|exceeded|busy)|overloaded|http(?: error)?\s*429|too many requests|usage limit)\b", re.I)),
    ("test_runner", re.compile(r"no tests? (?:found|collected|to run)|no test files|failed to load (?:config|module)|test suite failed to run|runner (?:not found|unavailable)|command not found|invalid (?:test )?config|pytest: error|npm err! (?:missing script|no test specified)", re.I)),
    ("dependency", re.compile(r"module not found|cannot find module|no module named|dependency missing", re.I)),
    ("dependency", re.compile(r"missing script|package not found|cannot resolve|unable to resolve", re.I)),
    ("ci_failure", re.compile(r"\bci (?:job|check|workflow) failed\b", re.I)),
    ("service_unavailable", re.compile(r"connection refused|service unavailable|http(?: error)?\s*503|timed out|econnrefused|etimedout|econnreset|enotfound|network unreachable|socket hang up|temporary failure in name resolution", re.I)),
    ("permission", re.compile(r"eacces|eperm|read-only file system", re.I)),
)
_HIGH_RISK = re.compile(
    r"\b(security|authentication|authorization|tenant isolation|data isolation|migration|concurrency|race condition|distributed|architecture|cryptograph(?:y|ic)|payment|credential)\b",
    re.I,
)
_SIGNATURE_NOISE = re.compile(r"(?:0x[0-9a-f]+|/[^\s:]+|\b\d+\b)", re.I)


def _effort_values(model: Any) -> frozenset[str]:
    values = getattr(model, "supported_reasoning_efforts", None) or []
    result = set()
    for item in values:
        effort = getattr(item, "reasoning_effort", None)
        if effort is None and isinstance(item, dict):
            effort = item.get("reasoning_effort")
        if effort:
            result.add(str(getattr(effort, "value", effort)).lower())
    return frozenset(result)


def parse_catalog(response: Any) -> list[CatalogModel]:
    """Convert the official SDK response to a validated account-scoped catalog."""
    rows = getattr(response, "data", None) or getattr(response, "models", None) or []
    catalog: list[CatalogModel] = []
    seen: set[str] = set()
    for row in rows:
        model_id = str(getattr(row, "id", "") or "").strip()
        if not model_id or model_id in seen:
            continue
        seen.add(model_id)
        description = str(getattr(row, "description", "") or "")
        catalog.append(CatalogModel(
            model_id=model_id,
            description=description,
            efforts=_effort_values(row),
            is_default=bool(getattr(row, "is_default", False)),
        ))
    if not catalog:
        raise RoutingUnavailableError("Codex SDK returned no eligible models")
    return catalog


def classify_failure(text: str, *, exit_code: int | None, tests_executed: bool = True,
                     signal: str | None = None) -> tuple[str, str | None]:
    """Classify a concrete receipt; environmental failures never imply model weakness."""
    if exit_code == 0:
        return "none", None
    normalized = text.strip()
    assertion = re.compile(r"assertionerror|assert(?:ion)? failed|expected .+ (?:got|but)\b", re.I)
    expected_header = re.compile(r"^\s*(?:expected|received|actual|got|but got)\s*:", re.I)
    diagnostic_header = re.compile(r"^\s*(?:traceback|[\w.]*error|failed\b|e\s)", re.I)
    lines = normalized.splitlines()
    environment_lines: list[str] = []
    in_expected_block = False
    expected_base_indent = 0
    expected_values_seen = False
    expected_bracket_depth = 0
    for line in lines:
        if assertion.search(line):
            continue
        header = expected_header.match(line)
        if header:
            tail = line[header.end():]
            expected_base_indent = len(line) - len(line.lstrip())
            expected_values_seen = bool(tail.strip())
            expected_bracket_depth = tail.count("{") + tail.count("[") - tail.count("}") - tail.count("]")
            in_expected_block = not expected_values_seen or expected_bracket_depth > 0
            continue
        if in_expected_block:
            if not line.strip():
                in_expected_block = False
                continue
            opens = line.count("{") + line.count("[")
            closes = line.count("}") + line.count("]")
            if expected_bracket_depth > 0 or opens > closes:
                expected_bracket_depth += opens - closes
                if expected_bracket_depth <= 0:
                    in_expected_block = False
                continue
            indentation = len(line) - len(line.lstrip())
            if diagnostic_header.search(line) or (expected_values_seen and indentation <= expected_base_indent):
                in_expected_block = False
            else:
                expected_values_seen = True
                continue
        environment_lines.append(line)
    environment_text = "\n".join(environment_lines)
    if exit_code in (137, -9) or (signal and signal.upper() == "SIGKILL") or re.search(
        r"out of memory|\boom\b|memory cgroup|sigkill|killed by signal 9", environment_text, re.I
    ):
        return "resource_blocked", None
    if exit_code is None:
        return "unknown", None
    for category, pattern in _ENVIRONMENT_PATTERNS:
        if pattern.search(environment_text):
            return category, None
    if not tests_executed:
        return "test_runner", None
    # A failed focused command with actual test output is a code failure. Keep
    # the signature tied to failure lines and normalize paths/line numbers.
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    failure_lines = [line for line in lines if re.search(r"fail|error|assert|expected|not ok", line, re.I)]
    seed = "\n".join((failure_lines or lines)[-5:])
    if not seed:
        return "unknown", None
    seed = _SIGNATURE_NOISE.sub("#", seed.lower())
    seed = re.sub(r"\s+", " ", seed).strip()
    signature = hashlib.sha256(seed.encode()).hexdigest()[:16]
    return "code_failure", signature


def failure_history(iterations: Iterable[dict[str, Any]]) -> list[FailureEvidence]:
    result: list[FailureEvidence] = []
    for item in iterations:
        receipt = item.get("testReceipt") if isinstance(item, dict) else None
        receipt = receipt if isinstance(receipt, dict) else {}
        if "exitCode" not in receipt and not (receipt.get("signal") or receipt.get("terminationSignal")):
            continue
        text = "\n".join(str(receipt.get(key) or "") for key in ("stderr", "stdout"))
        category, signature = classify_failure(text, exit_code=receipt.get("exitCode"),
                                              tests_executed=not bool(receipt.get("missingTestPaths")),
                                              signal=receipt.get("signal") or receipt.get("terminationSignal"))
        result.append(FailureEvidence(
            category=category,
            signature=signature,
            # A successful test, completed review, or shrinking unresolved
            # requirement set is verified progress. Source deltas/revisions
            # remain explicit evidence but do not alone erase the same failure.
            meaningful_progress=(
                category == "none"
                or bool((item.get("review") or {}).get("complete"))
                or bool(item.get("requirementProgress"))
            ),
            iteration=item.get("iteration") if isinstance(item.get("iteration"), int) else None,
            changed_paths=tuple(sorted(str(path) for path in item.get("changedPaths", []))),
            source_revision=receipt.get("revision") or receipt.get("sourceRevision"),
            unresolved_requirement_count=(
                len(item["unresolvedRequirements"])
                if isinstance(item.get("unresolvedRequirements"), list) else None
            ),
        ))
    return result


def select_profile(role: str, task_text: str, iterations: Iterable[dict[str, Any]]) -> tuple[ModelProfile, str, list[dict[str, Any]]]:
    lower_role = role.lower()
    evidence = failure_history(iterations)
    if any(tag in lower_role for tag in ("review", "verifier")):
        return ModelProfile.REVIEW, "independent review or final verification phase", []
    if _HIGH_RISK.search(task_text):
        return ModelProfile.REASONING, "approved high-risk task signal", []
    repeated: list[FailureEvidence] = []
    for item in reversed(evidence):
        if item.category != "code_failure" or item.meaningful_progress or not item.signature:
            break
        repeated.append(item)
    if len(repeated) >= 2 and len({item.signature for item in repeated[:2]}) == 1:
        proof = [{"category": item.category, "signature": item.signature, "iteration": item.iteration,
                  "meaningfulProgress": item.meaningful_progress,
                  "changedPaths": list(item.changed_paths), "sourceRevision": item.source_revision,
                  "unresolvedRequirementCount": item.unresolved_requirement_count}
                 for item in reversed(repeated[:2])]
        return ModelProfile.REASONING, "same code-failure signature repeated twice without verified progress", proof
    if "replan" in lower_role and evidence and evidence[-1].category == "code_failure":
        last = evidence[-1]
        return ModelProfile.REASONING, "replanning after an evidenced code failure", [{
            "category": last.category, "signature": last.signature, "iteration": last.iteration,
            "changedPaths": list(last.changed_paths), "sourceRevision": last.source_revision,
        }]
    if "implement" in lower_role:
        return ModelProfile.GENERAL, "ordinary implementation task", []
    return ModelProfile.GENERAL, "routine planning phase", []


def _choose_effort(model: CatalogModel, profile: ModelProfile, configured: str | None) -> str:
    if configured:
        choice = configured.strip().lower()
        if choice not in model.efforts:
            raise RoutingConfigurationError(f"Reasoning effort {choice!r} is unsupported by selected model {model.model_id!r}")
        return choice
    priorities = {
        ModelProfile.GENERAL: ("medium", "low", "high", "xhigh", "max", "ultra"),
        ModelProfile.REASONING: ("high", "xhigh", "max", "ultra", "medium", "low"),
        ModelProfile.REVIEW: ("high", "medium", "xhigh", "max", "ultra", "low"),
    }[profile]
    return next((value for value in priorities if value in model.efforts), "")


def route_model(
    catalog: list[CatalogModel], profile: ModelProfile | str, *, config: dict[str, str] | None = None,
    reason: str = "profile policy", failure_evidence: list[dict[str, Any]] | None = None,
    avoid_models: Iterable[str] = (),
) -> dict[str, Any]:
    profile = ModelProfile(profile)
    config = os.environ if config is None else config
    models = {model.model_id: model for model in catalog}
    ordered = catalog
    default = next((model for model in ordered if model.is_default), ordered[0])
    general = config.get("SMARTSPEC_CODEX_MODEL_GENERAL") or default.model_id
    reasoning = config.get("SMARTSPEC_CODEX_MODEL_REASONING") or next(
        (model.model_id for model in ordered if model.model_id != general and "high" in model.efforts), general
    )
    avoided = set(avoid_models)
    review_distinct_candidates = [model.model_id for model in ordered
                                  if model.model_id not in avoided and (bool(avoided) or model.model_id != general)]
    review_candidates = [model.model_id for model in ordered if model.model_id != general]
    configured_review = config.get("SMARTSPEC_CODEX_MODEL_REVIEW")
    review = configured_review or next(
        iter(review_distinct_candidates or review_candidates or [general])
    )
    selected_id = {ModelProfile.GENERAL: general, ModelProfile.REASONING: reasoning, ModelProfile.REVIEW: review}[profile]
    requested_effort = config.get(f"SMARTSPEC_CODEX_EFFORT_{profile.value}")
    fallback_id = config.get("SMARTSPEC_CODEX_MODEL_FALLBACK")
    fallback_used = False
    if profile == ModelProfile.REVIEW and configured_review and selected_id in avoided:
        alternatives = [model_id for model_id in models if model_id not in avoided]
        if alternatives:
            if fallback_id and fallback_id in models and fallback_id not in avoided:
                selected_id, fallback_used = fallback_id, True
            else:
                raise RoutingUnavailableError(
                    "Configured review model is the same as the prior phase; configure a distinct eligible review model or authorized fallback"
                )
    if selected_id not in models:
        if fallback_id and fallback_id in models:
            selected_id, fallback_used = fallback_id, True
        else:
            raise RoutingUnavailableError(f"Configured model {selected_id!r} is absent from the live Codex catalog")
    try:
        effort = _choose_effort(models[selected_id], profile, requested_effort)
    except RoutingConfigurationError as exc:
        if not fallback_id or fallback_id not in models or fallback_id == selected_id:
            raise RoutingUnavailableError(str(exc)) from exc
        selected_id, fallback_used = fallback_id, True
        try:
            effort = _choose_effort(models[selected_id], profile, requested_effort)
        except RoutingConfigurationError as fallback_exc:
            raise RoutingUnavailableError(str(fallback_exc)) from fallback_exc
    if profile == ModelProfile.REVIEW and selected_id in avoided and any(model_id not in avoided for model_id in models):
        raise RoutingUnavailableError("Review fallback matches the prior model while a distinct eligible catalog model exists")
    selection = {
        "profile": profile.value,
        "requestedModel": selected_id,
        "reasoningEffort": effort or None,
        "providerAuthRoute": AUTH_ROUTE,
        "policyVersion": POLICY_VERSION,
        "selectionReason": reason + ("; configured compatible fallback used" if fallback_used else ""),
        "fallbackUsed": fallback_used,
        "failureEvidence": failure_evidence or [],
    }
    if profile == ModelProfile.REVIEW:
        selection["reviewIndependence"] = "DISTINCT_MODEL" if selected_id not in avoided else (
            "CATALOG_LIMITED" if len(models) > 1 else "SINGLE_MODEL_AVAILABLE"
        )
    return selection
