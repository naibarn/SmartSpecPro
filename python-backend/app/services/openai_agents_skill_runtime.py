from __future__ import annotations

from dataclasses import dataclass
import shlex
import subprocess
from pathlib import Path
from typing import Any, Callable, Mapping

try:
    from agents import Agent
    from agents.tool import (
        ShellCallOutcome,
        ShellCommandOutput,
        ShellCommandRequest,
        ShellResult,
        ShellTool,
        ShellToolLocalEnvironment,
        ShellToolLocalSkill,
    )
except ModuleNotFoundError:
    Agent = Any  # type: ignore[assignment]
    ShellCallOutcome = Any  # type: ignore[assignment]
    ShellCommandOutput = Any  # type: ignore[assignment]
    ShellCommandRequest = Any  # type: ignore[assignment]
    ShellResult = Any  # type: ignore[assignment]
    ShellTool = Any  # type: ignore[assignment]
    ShellToolLocalEnvironment = Any  # type: ignore[assignment]
    ShellToolLocalSkill = Any  # type: ignore[assignment]

from .openai_agents_skill_supervisor import build_runtime_descriptor, run_supervised_skill_phases, SkillPhaseResult


@dataclass(frozen=True)
class NativeSkillRuntimeRequest:
    skill_slug: str
    bundle_dir: Path
    workspace_dir: Path
    resume_hint: str | None = None
    model: str | None = None


class NativeSkillShellExecutor:
    def __init__(self, bundle_dir: Path, workspace_dir: Path, *, default_timeout_ms: int = 120_000) -> None:
        self.bundle_dir = bundle_dir.resolve()
        self.workspace_dir = workspace_dir.resolve()
        self.default_timeout_ms = default_timeout_ms

    def _resolve_workdir(self, command: str) -> Path:
        first_token = shlex.split(command)[0] if shlex.split(command) else ""
        if first_token in {"scripts/run.sh", "scripts/verify.sh"}:
            return self.bundle_dir
        if first_token.startswith("scripts/"):
            candidate = (self.bundle_dir / first_token).resolve()
            if candidate.exists():
                return self.bundle_dir
        return self.workspace_dir

    def __call__(self, request: ShellCommandRequest) -> ShellResult:
        outputs: list[ShellCommandOutput] = []
        max_output_length = request.data.action.max_output_length
        timeout_ms = request.data.action.timeout_ms or self.default_timeout_ms
        allowed_prefixes = {
            "scripts/run.sh",
            "scripts/verify.sh",
            "./scripts/run.sh",
            "./scripts/verify.sh",
            "bash",
            "sh",
            "python",
            "python3",
            "uv",
            "pytest",
            "npm",
            "node",
            "echo",
            "cat",
            "ls",
            "pwd",
            "find",
        }

        for command in request.data.action.commands:
            if not isinstance(command, str) or not command.strip():
                outputs.append(
                    ShellCommandOutput(
                        command=command,
                        stdout="",
                        stderr="Invalid command.",
                        outcome=ShellCallOutcome(type="exit", exit_code=2),
                    )
                )
                continue

            argv = shlex.split(command)
            if not argv:
                outputs.append(
                    ShellCommandOutput(
                        command=command,
                        stdout="",
                        stderr="Empty command.",
                        outcome=ShellCallOutcome(type="exit", exit_code=2),
                    )
                )
                continue

            executable = argv[0]
            if executable.startswith(("rm", "curl", "wget", "ssh", "scp", "sudo")) or executable not in allowed_prefixes:
                outputs.append(
                    ShellCommandOutput(
                        command=command,
                        stdout="",
                        stderr=f"Command '{executable}' is not allowed in the native skill runtime.",
                        outcome=ShellCallOutcome(type="exit", exit_code=126),
                    )
                )
                continue

            workdir = self._resolve_workdir(command)
            try:
                completed = subprocess.run(
                    argv,
                    cwd=workdir,
                    capture_output=True,
                    text=True,
                    timeout=timeout_ms / 1000 if timeout_ms else None,
                )
                outputs.append(
                    ShellCommandOutput(
                        command=command,
                        stdout=completed.stdout,
                        stderr=completed.stderr,
                        outcome=ShellCallOutcome(type="exit", exit_code=completed.returncode),
                    )
                )
            except subprocess.TimeoutExpired as exc:
                outputs.append(
                    ShellCommandOutput(
                        command=command,
                        stdout=exc.stdout or "",
                        stderr=exc.stderr or "Command timed out.",
                        outcome=ShellCallOutcome(type="timeout", exit_code=None),
                    )
                )

        return ShellResult(output=outputs, max_output_length=max_output_length)


def _require_agents_sdk() -> None:
    if Agent is Any or ShellTool is Any:
        raise RuntimeError("openai-agents is not installed in the Python runtime.")


def resolve_native_skill_bundle_path(bundle_dir: Path, skill_slug: str) -> Path:
    if skill_slug in {"", ".", ".."}:
        raise ValueError("Invalid skill slug.")
    resolved_bundle = bundle_dir.resolve()
    candidate = (resolved_bundle / skill_slug).resolve()
    try:
        candidate.relative_to(resolved_bundle)
    except ValueError as exc:
        raise ValueError("Skill path traversal rejected.") from exc
    return candidate


def build_native_skill_shell_tool(request: NativeSkillRuntimeRequest) -> ShellTool:
    _require_agents_sdk()
    executor = NativeSkillShellExecutor(request.bundle_dir, request.workspace_dir)
    skill = ShellToolLocalSkill(
        name=request.skill_slug,
        description="Native OpenAI Agents Python skill bundle.",
        path=str(request.bundle_dir.resolve()),
    )
    environment = ShellToolLocalEnvironment(type="local", skills=[skill])
    return ShellTool(
        executor=executor,
        needs_approval=True,
        environment=environment,
    )


def build_native_skill_agent(request: NativeSkillRuntimeRequest) -> Agent[Any]:
    _require_agents_sdk()
    shell_tool = build_native_skill_shell_tool(request)
    return Agent(
        name=request.skill_slug,
        model=request.model or "gpt-5.4",
        instructions=(
            "Use the mounted native skill bundle to inspect the repository, run scripts/run.sh, "
            "and always verify before finalize. Do not write outside declared workspace outputs."
        ),
        tools=[shell_tool],
    )


def build_native_skill_runtime_descriptor(request: NativeSkillRuntimeRequest) -> dict[str, Any]:
    descriptor = build_runtime_descriptor(request.skill_slug, request.bundle_dir, request.workspace_dir)
    descriptor["sdkAgentClass"] = "Agent"
    descriptor["shellToolType"] = "ShellTool"
    descriptor["sdkModel"] = request.model or "gpt-5.4"
    descriptor["shellEnvironment"] = {
        "type": "local",
        "skills": [
            {
                "name": request.skill_slug,
                "path": str(request.bundle_dir.resolve()),
            }
        ],
    }
    descriptor["model"] = request.model or "gpt-5.4"
    return descriptor


def run_native_skill_runtime(
    request: NativeSkillRuntimeRequest,
    phase_executor: Callable[[str, Mapping[str, Any]], SkillPhaseResult],
) -> dict[str, Any]:
    descriptor = build_native_skill_runtime_descriptor(request)
    state = {
        "skill_slug": request.skill_slug,
        "bundle_dir": str(request.bundle_dir),
        "workspace_dir": str(request.workspace_dir),
        "resume_hint": request.resume_hint,
        "sdk_agent_name": request.skill_slug,
        "sdk_model": request.model or "gpt-5.4",
    }
    state.update(descriptor)
    return run_supervised_skill_phases(
        workspace_dir=request.workspace_dir,
        bundle_dir=request.bundle_dir,
        skill_slug=request.skill_slug,
        phase_executor=phase_executor,
        resume_state=state,
    )
