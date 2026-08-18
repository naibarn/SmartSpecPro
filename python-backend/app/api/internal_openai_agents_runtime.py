"""Internal OpenAI Agents runtime API for the Node.js gateway.

This router exposes the Python native Agents runtime behind the same internal
service-token boundary used by other Node.js -> Python bridge endpoints.
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.config import settings
from app.services.openai_agents_adapter import (
    OpenAIAgentsAdapter,
    OpenAIAgentsAdapterError,
)
from app.services.openai_agents_contracts import (
    CURRENT_CHECKPOINT_SCHEMA_VERSION,
    CURRENT_RUNTIME_CONTRACT_VERSION,
    CURRENT_TRACE_SCHEMA_VERSION,
    AgentRuntimeCancelRequest,
    AgentRuntimeRequest,
    AgentRuntimeResponse,
    AgentRuntimeResumeRequest,
    RuntimeArtifact,
)
from app.services.openai_agents_skill_runtime import (
    NativeSkillRuntimeRequest,
    NativeSkillShellExecutor,
    execute_native_skill_agent_sync,
    load_native_skill_topology,
    run_native_skill_runtime,
)
from app.services.openai_agents_skill_supervisor import SkillPhaseResult
from app.services.openai_agents_orchestra import OrchestraAdmissionError, preflight_orchestra_request, run_orchestra
from app.services.openai_agents_version import ADAPTER_VERSION, get_effective_openai_agents_version

logger = structlog.get_logger(__name__)

router = APIRouter(
    prefix="/api/internal/openai-agents-runtime",
    tags=["Internal OpenAI Agents Runtime"],
)

_adapter = OpenAIAgentsAdapter()


def _expected_tokens() -> list[str]:
    tokens = [
        getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", None),
        getattr(settings, "SMARTSPEC_PROXY_TOKEN", None),
    ]
    return [token for token in tokens if isinstance(token, str) and token.strip()]


async def _verify_internal_token(
    x_internal_token: str | None = Header(None),
    x_proxy_token: str | None = Header(None),
) -> None:
    """Verify the internal service-token boundary."""
    expected_tokens = _expected_tokens()
    if not expected_tokens:
        raise HTTPException(status_code=500, detail="Internal token is not configured")

    token = x_internal_token or x_proxy_token
    if not token:
        raise HTTPException(status_code=401, detail="Missing internal token")

    if not any(secrets.compare_digest(token, expected) for expected in expected_tokens):
        raise HTTPException(status_code=401, detail="Invalid internal token")


def _resolve_gateway_attribution_token(
    x_gateway_attribution_token: str | None,
    x_internal_token: str | None,
    x_proxy_token: str | None,
) -> str:
    for token in (x_gateway_attribution_token, x_internal_token, x_proxy_token):
        if isinstance(token, str) and token.strip():
            return token.strip()
    raise HTTPException(status_code=500, detail="Gateway attribution token is not configured")


def _map_adapter_error(exc: OpenAIAgentsAdapterError) -> HTTPException:
    if exc.code in {
        "invalid_request",
        "mutating_tool_requires_approval",
        "handoff_scope_widening_rejected",
        "resume_state_missing",
    }:
        return HTTPException(status_code=422, detail=exc.args[0])
    if exc.code in {"sdk_not_installed"}:
        return HTTPException(status_code=503, detail=exc.args[0])
    return HTTPException(status_code=500, detail=exc.args[0])


def _path_inside(candidate: Path, root: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _native_skill_roots() -> list[Path]:
    configured = os.getenv("SMARTSPEC_NATIVE_SKILLS_ROOTS") or os.getenv("SMARTSPEC_NATIVE_SKILLS_ROOT") or ""
    roots = [Path(item).expanduser().resolve() for item in configured.split(os.pathsep) if item.strip()]
    cwd = Path.cwd().resolve()
    roots.extend(
        [
            cwd / "skills",
            cwd / "apps" / "web" / "skills",
            cwd.parent / "apps" / "web" / "skills",
            cwd.parent / "skills",
        ]
    )
    deduped: list[Path] = []
    for root in roots:
        if root not in deduped:
            deduped.append(root)
    return deduped


def _workspace_roots() -> list[Path]:
    configured = os.getenv("SMARTSPEC_NATIVE_WORKSPACE_ROOTS") or os.getenv("WORKSPACE_ROOT") or ""
    roots = [Path(item).expanduser().resolve() for item in configured.split(os.pathsep) if item.strip()]
    roots.append((Path.cwd() / "data" / "native-skill-runs").resolve())
    return roots


def _resolve_native_workspace(raw_workspace: Any, body: AgentRuntimeRequest) -> Path:
    if isinstance(raw_workspace, str) and raw_workspace.strip():
        workspace = Path(raw_workspace).expanduser().resolve()
        if not any(_path_inside(workspace, root) for root in _workspace_roots()):
            raise HTTPException(status_code=422, detail="Native skill workspaceDir is outside allowed roots")
        return workspace

    base = (Path.cwd() / "data" / "native-skill-runs").resolve()
    safe_tenant = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in body.tenantId)
    safe_request = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in body.requestId)
    return base / safe_tenant / safe_request


def _native_skill_runtime_payload(body: AgentRuntimeRequest) -> dict[str, Any] | None:
    plan_context = body.planContext or {}
    native = plan_context.get("nativeSkillRuntime")
    if not isinstance(native, dict):
        raw_input = plan_context.get("input")
        if isinstance(raw_input, dict):
            native = raw_input.get("nativeSkillRuntime")
    if not isinstance(native, dict) or native.get("enabled") is not True:
        return None
    return native


def _extract_native_skill_runtime_request(body: AgentRuntimeRequest) -> NativeSkillRuntimeRequest | None:
    native = _native_skill_runtime_payload(body)
    if native is None:
        return None
    skill_slug = str(native.get("skillSlug") or native.get("skill_slug") or "").strip()
    if not skill_slug:
        raise HTTPException(status_code=422, detail="nativeSkillRuntime.skillSlug is required")
    if body.allowedSkills and skill_slug not in body.allowedSkills:
        raise HTTPException(status_code=422, detail="nativeSkillRuntime.skillSlug is outside allowedSkills")
    if skill_slug not in body.executionEnvelope.allowedSkills:
        raise HTTPException(status_code=422, detail="nativeSkillRuntime.skillSlug is outside executionEnvelope.allowedSkills")
    if "native-skill-shell" not in set(body.allowedTools) or "native-skill-shell" not in set(body.executionEnvelope.allowedTools):
        raise HTTPException(status_code=422, detail="native-skill-shell must be allowed for native skill runtime")

    bundle_dir_raw = native.get("bundleDir") or native.get("bundle_dir")
    if not isinstance(bundle_dir_raw, str) or not bundle_dir_raw.strip():
        raise HTTPException(status_code=422, detail="nativeSkillRuntime.bundleDir is required")
    bundle_dir = Path(bundle_dir_raw).expanduser().resolve()
    if not any(_path_inside(bundle_dir, root) for root in _native_skill_roots()):
        raise HTTPException(status_code=422, detail="Native skill bundleDir is outside allowed roots")
    if not (bundle_dir / "skill.lock.json").exists() or not (bundle_dir / "SKILL.md").exists():
        raise HTTPException(status_code=422, detail="Native skill bundle contract files are missing")

    workspace_dir = _resolve_native_workspace(native.get("workspaceDir") or native.get("workspace_dir"), body)
    requested_subagent = native.get("requestedSubagent") or native.get("requested_subagent")
    task_hint = native.get("taskHint") or native.get("task_hint") or body.objective
    return NativeSkillRuntimeRequest(
        skill_slug=skill_slug,
        bundle_dir=bundle_dir,
        workspace_dir=workspace_dir,
        resume_hint=body.resumeCursor,
        model=body.modelConfig.resolvedGatewayModelId or body.modelConfig.modelId,
        requested_subagent=str(requested_subagent).strip() if requested_subagent else None,
        task_hint=str(task_hint).strip() if task_hint else None,
    )


def _shell_request(command: str) -> Any:
    return SimpleNamespace(
        data=SimpleNamespace(
            action=SimpleNamespace(
                commands=[command],
                max_output_length=4096,
                timeout_ms=120_000,
            )
        )
    )


def _build_default_native_phase_executor(request: NativeSkillRuntimeRequest) -> Any:
    topology = load_native_skill_topology(request.bundle_dir)
    route = None
    if topology is not None:
        route = next(
            (
                node
                for node in (topology.orchestrator, *topology.subagents)
                if request.requested_subagent and node.name == request.requested_subagent
            ),
            topology.orchestrator,
        )
    shell_executor = NativeSkillShellExecutor(
        request.bundle_dir,
        request.workspace_dir,
        security_policy=topology.securityPolicy if topology else None,
        tool_boundary=route.toolBoundary if route else (),
    )

    def phase_executor(phase: str, state: dict[str, object]) -> SkillPhaseResult:
        if phase == "execute":
            if topology is not None:
                agent_result = execute_native_skill_agent_sync(request)
                status = "completed" if agent_result.get("status") == "completed" else "failed"
                return SkillPhaseResult(
                    phase=phase,
                    status=status,
                    last_command="native-agent-runner",
                    resume_hint=f"resume-{phase}",
                    loaded_skills=[request.skill_slug],
                    child_run_ids=[f"subagent:{node.name}" for node in topology.subagents[:topology.securityPolicy.fanoutLimit]],
                    artifact_refs=["logs/phase_execute.md"],
                    details={
                        "role": "orchestrator",
                        "agentResult": agent_result,
                        "selectedSubagent": request.requested_subagent,
                    },
                )

            result = shell_executor(_shell_request("scripts/run.sh"))
            output = result.output[0]
            status = "completed" if output.outcome.exit_code == 0 else "failed"
            return SkillPhaseResult(
                phase=phase,
                status=status,
                last_command="scripts/run.sh",
                resume_hint=f"resume-{phase}",
                loaded_skills=[request.skill_slug],
                artifact_refs=["logs/phase_execute.md"],
                details={"stdout": output.stdout[-2000:], "stderr": output.stderr[-2000:]},
            )
        if phase == "verify":
            result = shell_executor(_shell_request("scripts/verify.sh"))
            output = result.output[0]
            passed = output.outcome.exit_code == 0
            return SkillPhaseResult(
                phase=phase,
                status="completed" if passed else "failed",
                last_command="scripts/verify.sh",
                verification_command="scripts/verify.sh",
                verification_state="passed" if passed else "failed",
                resume_hint=f"resume-{phase}",
                loaded_skills=[request.skill_slug],
                artifact_refs=["logs/phase_verify.md"],
                details={"stdout": output.stdout[-2000:], "stderr": output.stderr[-2000:]},
            )
        return SkillPhaseResult(
            phase=phase,
            status="completed",
            verification_command="scripts/verify.sh",
            resume_hint=f"resume-{phase}",
            loaded_skills=[request.skill_slug],
            artifact_refs=[f"logs/phase_{phase}.md"],
        )

    return phase_executor


def _native_runtime_result_to_agent_response(
    *,
    body: AgentRuntimeRequest,
    native_request: NativeSkillRuntimeRequest,
    result: dict[str, Any],
) -> AgentRuntimeResponse:
    phase_status = str(result.get("phase_status") or "")
    status = "completed" if phase_status == "completed" and result.get("current_phase") == "finalize" else "failed" if phase_status == "failed" else "running"
    phase_results = result.get("phase_results") if isinstance(result.get("phase_results"), dict) else {}
    execute_details = phase_results.get("execute") if isinstance(phase_results.get("execute"), dict) else {}
    agent_result = execute_details.get("agentResult") if isinstance(execute_details.get("agentResult"), dict) else {}
    agent_output = agent_result.get("finalOutput")
    raw_content = (
        str(agent_output)
        if agent_output not in (None, "")
        else f"Native skill runtime finished phase {result.get('current_phase')} with status {phase_status}."
    )
    subagent_runtime = result.get("subagentRuntime") if isinstance(result.get("subagentRuntime"), dict) else {}
    tool_calls = ["native-skill-shell"]
    configured_tool_subagents = subagent_runtime.get("toolSubagents", []) if isinstance(subagent_runtime, dict) else []
    for tool_name in configured_tool_subagents:
        if isinstance(tool_name, str):
            tool_calls.append(f"subagent:{tool_name}")
    artifacts = []
    for index, item in enumerate(result.get("artifacts") or result.get("artifact_refs") or [], start=1):
        ref = item.get("path") if isinstance(item, dict) else str(item)
        artifacts.append(
            RuntimeArtifact.model_validate(
                {
                    "artifactId": f"native_artifact_{index}",
                    "artifactType": "native_skill_artifact",
                    "contentRef": ref,
                    "metadata": item if isinstance(item, dict) else {"path": ref},
                }
            )
        )

    return AgentRuntimeResponse.model_validate(
        {
            "runtimeContractVersion": CURRENT_RUNTIME_CONTRACT_VERSION,
            "traceSchemaVersion": CURRENT_TRACE_SCHEMA_VERSION,
            "checkpointSchemaVersion": CURRENT_CHECKPOINT_SCHEMA_VERSION,
            "status": status,
            "selectedAgentName": agent_result.get("selectedAgentName") or native_request.requested_subagent or native_request.skill_slug,
            "selectedSkillSlug": native_request.skill_slug,
            "providerId": body.modelConfig.providerId,
            "modelId": body.modelConfig.modelId,
            "gatewayRouteId": body.modelConfig.gatewayRouteId,
            "resolvedGatewayModelId": body.modelConfig.resolvedGatewayModelId,
            "finalOutput": {
                "rawContent": raw_content,
                "usage": {"promptTokens": 0, "completionTokens": 0},
                "creditsUsed": 0,
                "providerName": body.modelConfig.providerId,
                "modelId": body.modelConfig.resolvedGatewayModelId or body.modelConfig.modelId,
                "runtimeState": {
                    "currentPhase": result.get("current_phase"),
                    "phaseStatus": phase_status,
                    "verificationStatus": result.get("verification_status"),
                    "resumeHint": result.get("resume_hint"),
                },
            },
            "artifacts": artifacts,
            "reviewVerdict": {"status": "pass" if status == "completed" else "fail", "issues": [] if status == "completed" else ["Native skill runtime did not complete."]},
            "events": [],
            "traceMetadata": {
                "nativeSkillRuntime": True,
                "bundleDir": str(native_request.bundle_dir),
                "workspaceDir": str(native_request.workspace_dir),
                "lineage": result.get("lineage"),
                "subagentTopology": result.get("subagentTopology"),
                "subagentRuntime": result.get("subagentRuntime"),
            },
            "checkpoint": None,
            "terminalReason": "plan_completed" if status == "completed" else "runtime_error",
            "adapterVersion": ADAPTER_VERSION,
            "sdkVersion": get_effective_openai_agents_version(),
            "toolCallsMade": tool_calls,
            "handoffsExecuted": [],
            "actingPersona": body.personaSnapshot,
            "stepAssignment": body.stepAssignment,
            "nextAction": None,
            "stepId": body.stepContext.stepId if body.stepContext else None,
            "attemptId": body.stepContext.attemptId if body.stepContext else None,
            "checkpointMetadata": None,
            "eventSequenceMetadata": {"count": 0},
            "stepLinks": [],
        }
    )


async def _run_native_skill_if_requested(body: AgentRuntimeRequest) -> AgentRuntimeResponse | None:
    if body.surface == "media_production" and _native_skill_runtime_payload(body) is not None:
        raise HTTPException(status_code=422, detail="nativeSkillRuntime is not allowed for media_production")
    native_request = _extract_native_skill_runtime_request(body)
    if native_request is None:
        return None
    result = run_native_skill_runtime(
        native_request,
        _build_default_native_phase_executor(native_request),
    )
    return _native_runtime_result_to_agent_response(
        body=body,
        native_request=native_request,
        result=result,
    )


@router.get("/health", dependencies=[Depends(_verify_internal_token)])
async def health() -> dict[str, Any]:
    return _adapter.health()


@router.post("/run", response_model=AgentRuntimeResponse, dependencies=[Depends(_verify_internal_token)])
async def run(
    body: AgentRuntimeRequest,
    x_gateway_attribution_token: str | None = Header(None),
    x_internal_token: str | None = Header(None),
    x_proxy_token: str | None = Header(None),
) -> AgentRuntimeResponse:
    gateway_attribution_token = _resolve_gateway_attribution_token(
        x_gateway_attribution_token,
        x_internal_token,
        x_proxy_token,
    )
    try:
        preflight_orchestra_request(body)
        native_response = await _run_native_skill_if_requested(body)
        if native_response is not None:
            return native_response
        return await run_orchestra(
            body,
            _adapter.run,
            gateway_attribution_token=gateway_attribution_token,
            gateway_base_url=getattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", None) or None,
        )
    except OrchestraAdmissionError as exc:
        raise HTTPException(status_code=422, detail=exc.finding.model_dump()) from exc
    except OpenAIAgentsAdapterError as exc:
        raise _map_adapter_error(exc) from exc
    except ValueError as exc:
        logger.error("openai_agents_runtime_run_validation_error", error=str(exc))
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("openai_agents_runtime_run_failed", error=str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail="OpenAI Agents runtime run failed") from exc


@router.post("/run-streamed", response_model=AgentRuntimeResponse, dependencies=[Depends(_verify_internal_token)])
async def run_streamed(
    body: AgentRuntimeRequest,
    x_gateway_attribution_token: str | None = Header(None),
    x_internal_token: str | None = Header(None),
    x_proxy_token: str | None = Header(None),
) -> AgentRuntimeResponse:
    gateway_attribution_token = _resolve_gateway_attribution_token(
        x_gateway_attribution_token,
        x_internal_token,
        x_proxy_token,
    )
    try:
        preflight_orchestra_request(body)
        native_response = await _run_native_skill_if_requested(body)
        if native_response is not None:
            return native_response
        return await run_orchestra(
            body,
            _adapter.run_streamed,
            gateway_attribution_token=gateway_attribution_token,
            gateway_base_url=getattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", None) or None,
        )
    except OrchestraAdmissionError as exc:
        raise HTTPException(status_code=422, detail=exc.finding.model_dump()) from exc
    except OpenAIAgentsAdapterError as exc:
        raise _map_adapter_error(exc) from exc
    except ValueError as exc:
        logger.error("openai_agents_runtime_run_streamed_validation_error", error=str(exc))
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("openai_agents_runtime_run_streamed_failed", error=str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail="OpenAI Agents runtime streamed run failed") from exc


@router.post("/resume", response_model=AgentRuntimeResponse, dependencies=[Depends(_verify_internal_token)])
async def resume(
    body: AgentRuntimeResumeRequest,
    x_gateway_attribution_token: str | None = Header(None),
    x_internal_token: str | None = Header(None),
    x_proxy_token: str | None = Header(None),
) -> AgentRuntimeResponse:
    gateway_attribution_token = _resolve_gateway_attribution_token(
        x_gateway_attribution_token,
        x_internal_token,
        x_proxy_token,
    )
    try:
        preflight_orchestra_request(body)
        native_response = await _run_native_skill_if_requested(body)
        if native_response is not None:
            return native_response
        return await run_orchestra(
            body,
            _adapter.resume,
            gateway_attribution_token=gateway_attribution_token,
            gateway_base_url=getattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", None) or None,
        )
    except OrchestraAdmissionError as exc:
        raise HTTPException(status_code=422, detail=exc.finding.model_dump()) from exc
    except OpenAIAgentsAdapterError as exc:
        raise _map_adapter_error(exc) from exc
    except ValueError as exc:
        logger.error("openai_agents_runtime_resume_validation_error", error=str(exc))
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("openai_agents_runtime_resume_failed", error=str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail="OpenAI Agents runtime resume failed") from exc


@router.post("/cancel", response_model=AgentRuntimeResponse, dependencies=[Depends(_verify_internal_token)])
async def cancel(
    body: AgentRuntimeCancelRequest,
    x_internal_token: str | None = Header(None),
    x_proxy_token: str | None = Header(None),
) -> AgentRuntimeResponse:
    _resolve_gateway_attribution_token(None, x_internal_token, x_proxy_token)
    try:
        return await _adapter.cancel(body)
    except OpenAIAgentsAdapterError as exc:
        raise _map_adapter_error(exc) from exc
    except ValueError as exc:
        logger.error("openai_agents_runtime_cancel_validation_error", error=str(exc))
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("openai_agents_runtime_cancel_failed", error=str(exc), exc_info=True)
        raise HTTPException(status_code=500, detail="OpenAI Agents runtime cancel failed") from exc
