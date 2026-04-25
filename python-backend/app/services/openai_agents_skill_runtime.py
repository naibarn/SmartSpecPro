from __future__ import annotations

import os
import re
import shlex
import subprocess
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from agents import Agent, Runner
    from agents import handoff as agents_handoff
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
    Runner = Any  # type: ignore[assignment]
    agents_handoff = Any  # type: ignore[assignment]
    ShellCallOutcome = Any  # type: ignore[assignment]
    ShellCommandOutput = Any  # type: ignore[assignment]
    ShellCommandRequest = Any  # type: ignore[assignment]
    ShellResult = Any  # type: ignore[assignment]
    ShellTool = Any  # type: ignore[assignment]
    ShellToolLocalEnvironment = Any  # type: ignore[assignment]
    ShellToolLocalSkill = Any  # type: ignore[assignment]

from .openai_agents_skill_persistence import load_persisted_skill_runtime_state
from .openai_agents_skill_supervisor import (
    SkillPhaseResult,
    build_runtime_descriptor,
    run_supervised_skill_phases,
)
from .openai_agents_subagent_contracts import (
    NativeSubagentNode,
    NativeSubagentSecurityPolicy,
    NativeSubagentTopology,
    discover_native_subagents,
    load_native_subagent_topology,
    resolve_native_subagent_route,
)

DEFAULT_NATIVE_ALLOWED_COMMANDS = frozenset({
    "scripts/run.sh",
    "scripts/verify.sh",
    "./scripts/run.sh",
    "./scripts/verify.sh",
    "echo",
    "cat",
    "ls",
    "pwd",
    "find",
})
DEFAULT_NATIVE_DENIED_COMMANDS = frozenset({
    "rm",
    "curl",
    "wget",
    "ssh",
    "scp",
    "sudo",
    "bash",
    "sh",
    "python",
    "python3",
    "node",
})
SCRIPT_CONTROL_WORDS = frozenset({
    "set",
    "cd",
    "dirname",
    "true",
    "false",
    "exit",
    "test",
    "[",
    "]",
    "if",
    "then",
    "else",
    "elif",
    "fi",
    "for",
    "while",
    "until",
    "do",
    "done",
    "case",
    "esac",
    "in",
})
COMMAND_SEPARATORS = frozenset({"&&", "||", ";", "|", "then", "do", "else", "elif"})
SAFE_ASSIGNMENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")


@dataclass(frozen=True)
class NativeSkillRuntimeRequest:
    skill_slug: str
    bundle_dir: Path
    workspace_dir: Path
    resume_hint: str | None = None
    model: str | None = None
    requested_subagent: str | None = None
    task_hint: str | None = None


class NativeSkillShellExecutor:
    def __init__(
        self,
        bundle_dir: Path,
        workspace_dir: Path,
        *,
        default_timeout_ms: int = 120_000,
        security_policy: NativeSubagentSecurityPolicy | None = None,
        tool_boundary: tuple[str, ...] = (),
    ) -> None:
        self.bundle_dir = bundle_dir.resolve()
        self.workspace_dir = workspace_dir.resolve()
        self.default_timeout_ms = default_timeout_ms
        self.security_policy = security_policy
        self.tool_boundary = tool_boundary

    def _resolve_workdir(self, command: str) -> Path:
        first_token = shlex.split(command)[0] if shlex.split(command) else ""
        if first_token in {"scripts/run.sh", "scripts/verify.sh", "./scripts/run.sh", "./scripts/verify.sh"}:
            return self.bundle_dir
        if first_token.startswith("scripts/"):
            candidate = (self.bundle_dir / first_token).resolve()
            if candidate.exists():
                return self.bundle_dir
        return self.workspace_dir

    def _is_path_inside(self, candidate: Path, root: Path) -> bool:
        try:
            candidate.resolve().relative_to(root.resolve())
            return True
        except ValueError:
            return False

    def _allowed_path_roots(self) -> tuple[Path, ...]:
        return (
            self.bundle_dir,
            self.workspace_dir,
            self.workspace_dir / "out",
            self.workspace_dir / "logs",
            self.workspace_dir / "state",
            self.workspace_dir / ".agents",
        )

    def _policy_allowed_commands(self) -> set[str]:
        if self.security_policy:
            allowed = {item for item in self.security_policy.toolAllowlist if item}
        else:
            allowed = set(DEFAULT_NATIVE_ALLOWED_COMMANDS)
        if "scripts/run.sh" in allowed:
            allowed.add("./scripts/run.sh")
        if "scripts/verify.sh" in allowed:
            allowed.add("./scripts/verify.sh")
        return allowed

    def _policy_denied_commands(self) -> set[str]:
        denied = set(DEFAULT_NATIVE_DENIED_COMMANDS)
        if self.security_policy:
            denied.update(item for item in self.security_policy.toolDenylist if item)
        return denied

    def _boundary_commands(self) -> set[str]:
        commands = set()
        known = self._policy_allowed_commands() | DEFAULT_NATIVE_ALLOWED_COMMANDS
        for item in self.tool_boundary:
            value = item.strip()
            if not value:
                continue
            if value in known or value.startswith(("./", "scripts/")):
                commands.add(value)
                if value == "scripts/run.sh":
                    commands.add("./scripts/run.sh")
                elif value == "scripts/verify.sh":
                    commands.add("./scripts/verify.sh")
        return commands

    def _allowed_direct_commands(self) -> set[str]:
        allowed = self._policy_allowed_commands()
        boundary = self._boundary_commands()
        if boundary:
            return allowed & boundary
        return allowed

    def _path_is_allowed(self, raw_path: str, *, workdir: Path) -> bool:
        if raw_path in {"", "."}:
            return True
        candidate = Path(raw_path)
        if candidate.is_absolute():
            resolved = candidate.resolve()
        else:
            resolved = (workdir / candidate).resolve()
        return any(self._is_path_inside(resolved, root) for root in self._allowed_path_roots())

    def _path_policy_error(self, argv: list[str], *, workdir: Path) -> str | None:
        executable = argv[0]
        if executable in {"scripts/run.sh", "scripts/verify.sh", "./scripts/run.sh", "./scripts/verify.sh"}:
            return None
        if executable == "find" and any(arg in {"-exec", "-execdir", "-ok", "-okdir", "-delete"} for arg in argv[1:]):
            return "find escape hatches are not allowed in the native skill runtime."
        if executable == "echo":
            return None
        path_args: list[str] = []
        if executable in {"cat", "ls"}:
            path_args = [arg for arg in argv[1:] if not arg.startswith("-")]
        elif executable == "find":
            for arg in argv[1:]:
                if arg.startswith("-") or arg in {"!", "(", ")"}:
                    break
                path_args.append(arg)
            if not path_args:
                path_args = ["."]
        elif executable == "pwd":
            path_args = []

        for raw_path in path_args:
            if not self._path_is_allowed(raw_path, workdir=workdir):
                return f"Path '{raw_path}' is outside the native skill sandbox."
        return None

    def _script_path_for_command(self, argv: list[str]) -> Path | None:
        executable = argv[0] if argv else ""
        if executable in {"scripts/run.sh", "./scripts/run.sh"}:
            return (self.bundle_dir / "scripts" / "run.sh").resolve()
        if executable in {"scripts/verify.sh", "./scripts/verify.sh"}:
            return (self.bundle_dir / "scripts" / "verify.sh").resolve()
        return None

    def _script_policy_error(self, script_path: Path) -> str | None:
        try:
            script_path.relative_to(self.bundle_dir)
        except ValueError:
            return "Script entrypoint is outside the native skill bundle."
        if not script_path.exists() or not script_path.is_file():
            return f"Script entrypoint is missing: {script_path.relative_to(self.bundle_dir).as_posix()}"

        allowed_commands = self._policy_allowed_commands() | SCRIPT_CONTROL_WORDS
        denied_commands = self._policy_denied_commands()
        try:
            lines = script_path.read_text(encoding="utf-8").splitlines()
        except Exception:
            return "Script entrypoint could not be read for policy validation."

        for line_number, line in enumerate(lines, start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if stripped.startswith("SKILL_DIR=") and "${BASH_SOURCE[0]}" in stripped:
                continue
            if "$(" in stripped or "`" in stripped:
                return f"Command substitution is not allowed in native skill scripts at line {line_number}."

            try:
                tokens = shlex.split(stripped, comments=True, posix=True)
            except ValueError:
                return f"Native skill script line {line_number} could not be parsed safely."
            if not tokens:
                continue
            if SAFE_ASSIGNMENT_RE.match(tokens[0]):
                continue

            expect_command = True
            for token in tokens:
                if token in COMMAND_SEPARATORS:
                    expect_command = True
                    continue
                if token.startswith("/") or token.startswith("../") or "/../" in token:
                    return f"Path '{token}' is outside the native skill sandbox at script line {line_number}."
                if token.startswith(("-", "$")):
                    continue
                command_name = Path(token).name
                if expect_command:
                    if command_name in denied_commands:
                        return f"Command '{command_name}' is denied by the native skill security policy at line {line_number}."
                    if token not in allowed_commands and command_name not in allowed_commands:
                        return f"Command '{command_name}' is not allowed by the native skill security policy at line {line_number}."
                    expect_command = False
        return None

    def _subprocess_env(self) -> dict[str, str]:
        tmp_dir = self.workspace_dir / "tmp"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        return {
            "PATH": os.pathsep.join(["/usr/bin", "/bin"]),
            "HOME": str(self.workspace_dir),
            "TMPDIR": str(tmp_dir),
            "SMARTSPEC_NATIVE_BUNDLE_DIR": str(self.bundle_dir),
            "SMARTSPEC_NATIVE_WORKSPACE_DIR": str(self.workspace_dir),
        }

    def __call__(self, request: ShellCommandRequest) -> ShellResult:
        outputs: list[ShellCommandOutput] = []
        max_output_length = request.data.action.max_output_length
        timeout_ms = request.data.action.timeout_ms or self.default_timeout_ms
        allowed_prefixes = self._allowed_direct_commands()
        denied_prefixes = self._policy_denied_commands()

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
            if executable in denied_prefixes or executable not in allowed_prefixes:
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
            script_path = self._script_path_for_command(argv)
            if script_path is not None:
                script_policy_error = self._script_policy_error(script_path)
                if script_policy_error:
                    outputs.append(
                        ShellCommandOutput(
                            command=command,
                            stdout="",
                            stderr=script_policy_error,
                            outcome=ShellCallOutcome(type="exit", exit_code=126),
                        )
                    )
                    continue
            path_policy_error = self._path_policy_error(argv, workdir=workdir)
            if path_policy_error:
                outputs.append(
                    ShellCommandOutput(
                        command=command,
                        stdout="",
                        stderr=path_policy_error,
                        outcome=ShellCallOutcome(type="exit", exit_code=126),
                    )
                )
                continue
            try:
                completed = subprocess.run(
                    argv,
                    cwd=workdir,
                    capture_output=True,
                    text=True,
                    timeout=timeout_ms / 1000 if timeout_ms else None,
                    env=self._subprocess_env(),
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
    if Agent is Any or Runner is Any or ShellTool is Any:
        raise RuntimeError("openai-agents is not installed in the Python runtime.")


def load_native_skill_topology(bundle_dir: Path) -> NativeSubagentTopology | None:
    return load_native_subagent_topology(bundle_dir)


def discover_native_skill_subagents(bundle_dir: Path) -> list[str]:
    return discover_native_subagents(bundle_dir)


def resolve_native_skill_route(request: NativeSkillRuntimeRequest) -> dict[str, Any]:
    topology = load_native_skill_topology(request.bundle_dir)
    route = resolve_native_subagent_route(topology, request.requested_subagent)
    return {
        "topology": topology.to_descriptor() if topology else None,
        "discoveredSubagents": discover_native_skill_subagents(request.bundle_dir),
        "selectedRoute": None if route is None else {
            "name": route.name,
            "role": route.role,
            "mode": route.mode,
            "entrypoint": route.entrypoint,
            "verificationCommand": route.verificationCommand,
            "fallbackBehavior": route.fallbackBehavior,
        },
    }


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
    topology = load_native_skill_topology(request.bundle_dir)
    route = resolve_native_subagent_route(topology, request.requested_subagent)
    executor = NativeSkillShellExecutor(
        request.bundle_dir,
        request.workspace_dir,
        security_policy=topology.securityPolicy if topology else None,
        tool_boundary=route.toolBoundary if route else (),
    )
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


def _safe_tool_name(value: str) -> str:
    normalized = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in value.strip().lower())
    return normalized.strip("_-") or "specialist"


def _read_agent_doc(bundle_dir: Path, entrypoint: str, fallback: str) -> str:
    doc_path = (bundle_dir / entrypoint).resolve()
    try:
        doc_path.relative_to(bundle_dir.resolve())
    except ValueError:
        return fallback
    if not doc_path.exists() or not doc_path.is_file():
        return fallback
    try:
        content = doc_path.read_text(encoding="utf-8").strip()
    except Exception:
        return fallback
    return content or fallback


def _build_specialist_agent(
    request: NativeSkillRuntimeRequest,
    node: NativeSubagentNode,
    shell_tool: ShellTool,
) -> Agent[Any]:
    instructions = _read_agent_doc(
        request.bundle_dir,
        node.entrypoint,
        f"You are the {node.role} specialist for native skill {request.skill_slug}.",
    )
    boundary = ", ".join(node.toolBoundary) or "declared native bundle shell tool only"
    instructions = (
        f"{instructions}\n\n"
        f"Runtime boundary: stay within tool boundary [{boundary}], use only declared entrypoints, "
        "and return concise evidence to the orchestrator."
    )
    return Agent(
        name=node.name,
        model=node.model or request.model or "gpt-5.4",
        instructions=instructions,
        tools=[shell_tool],
    )


def build_native_subagent_runtime_components(
    request: NativeSkillRuntimeRequest,
    topology: NativeSubagentTopology | None,
    shell_tool: ShellTool,
) -> dict[str, Any]:
    if topology is None:
        return {
            "tools": [],
            "handoffs": [],
            "lineage": [],
        }

    subagent_tools: list[Any] = []
    subagent_handoffs: list[Any] = []
    lineage: list[dict[str, Any]] = []
    fanout_limit = topology.securityPolicy.fanoutLimit
    for node in topology.subagents[:fanout_limit]:
        specialist = _build_specialist_agent(request, node, shell_tool)
        child_lineage = {
            "subagentName": node.name,
            "role": node.role,
            "mode": node.mode,
            "checkpointPolicy": None if node.checkpointPolicy is None else {
                "mode": node.checkpointPolicy.mode,
                "resumeCursor": node.checkpointPolicy.resumeCursor,
            },
            "verificationCommand": node.verificationCommand,
            "status": "configured",
        }
        if node.mode == "tool":
            tool_name = f"subagent_{_safe_tool_name(node.name)}"
            subagent_tools.append(
                specialist.as_tool(
                    tool_name=tool_name,
                    tool_description=node.description or f"Run the {node.role} specialist for bounded native skill work.",
                    max_turns=3,
                    needs_approval=False,
                )
            )
            child_lineage["toolName"] = tool_name
        elif node.mode == "handoff":
            if agents_handoff is Any:
                subagent_handoffs.append(specialist)
            else:
                subagent_handoffs.append(
                    agents_handoff(
                        specialist,
                        tool_name_override=f"handoff_{_safe_tool_name(node.name)}",
                        tool_description_override=node.description or f"Transfer ownership to the {node.role} specialist.",
                    )
                )
            child_lineage["handoffName"] = f"handoff_{_safe_tool_name(node.name)}"
        lineage.append(child_lineage)

    return {
        "tools": subagent_tools,
        "handoffs": subagent_handoffs,
        "lineage": lineage,
    }


def build_native_skill_agent(request: NativeSkillRuntimeRequest) -> Agent[Any]:
    _require_agents_sdk()
    shell_tool = build_native_skill_shell_tool(request)
    topology = load_native_skill_topology(request.bundle_dir)
    route = resolve_native_subagent_route(topology, request.requested_subagent)
    subagent_runtime = build_native_subagent_runtime_components(request, topology, shell_tool)
    instructions = (
        "Use the mounted native skill bundle to inspect the repository, run scripts/run.sh, "
        "and always verify before finalize. Do not write outside declared workspace outputs."
    )
    if topology and route and route.mode != "orchestrator":
        instructions += (
            f" Delegate to the specialist route {route.name!r} when the manifest says it should own the task."
            f" Current topology exposes {len(topology.subagents)} specialist agent(s)."
        )
    return Agent(
        name=request.skill_slug,
        model=request.model or "gpt-5.4",
        instructions=instructions,
        tools=[shell_tool, *subagent_runtime["tools"]],
        handoffs=subagent_runtime["handoffs"],
    )


def execute_native_skill_agent_sync(request: NativeSkillRuntimeRequest) -> dict[str, Any]:
    _require_agents_sdk()
    topology = load_native_skill_topology(request.bundle_dir)
    agent = build_native_skill_agent(request)
    input_text = request.task_hint or f"Run native skill {request.skill_slug} and verify before finalizing."
    max_turns = 6
    if topology:
        max_turns = min(20, max(6, 4 + topology.securityPolicy.fanoutLimit * 3))
    result = Runner.run_sync(
        agent,
        input_text,
        context={
            "skillSlug": request.skill_slug,
            "bundleDir": str(request.bundle_dir),
            "workspaceDir": str(request.workspace_dir),
            "requestedSubagent": request.requested_subagent,
            "resumeHint": request.resume_hint,
        },
        max_turns=max_turns,
    )
    last_agent = getattr(result, "last_agent", None)
    return {
        "status": "completed",
        "selectedAgentName": getattr(last_agent, "name", None) or request.skill_slug,
        "finalOutput": getattr(result, "final_output", None),
        "requestedSubagent": request.requested_subagent,
        "subagentCount": len(topology.subagents) if topology else 0,
    }


def build_native_skill_runtime_descriptor(request: NativeSkillRuntimeRequest) -> dict[str, Any]:
    descriptor = build_runtime_descriptor(request.skill_slug, request.bundle_dir, request.workspace_dir)
    topology = load_native_skill_topology(request.bundle_dir)
    descriptor["sdkAgentClass"] = "Agent"
    descriptor["shellToolType"] = "ShellTool"
    descriptor["sdkModel"] = request.model or "gpt-5.4"
    descriptor["requestedSubagent"] = request.requested_subagent
    descriptor["taskHint"] = request.task_hint
    descriptor["discoveredSubagents"] = discover_native_skill_subagents(request.bundle_dir)
    descriptor["subagentTopology"] = topology.to_descriptor() if topology else None
    descriptor["subagentRuntime"] = None
    if topology:
        descriptor["subagentRuntime"] = {
            "toolSubagents": [node.name for node in topology.subagents if node.mode == "tool"],
            "handoffSubagents": [node.name for node in topology.subagents if node.mode == "handoff"],
            "fanoutLimit": topology.securityPolicy.fanoutLimit,
            "maxConcurrency": topology.securityPolicy.maxConcurrency,
            "allowedInvocationModes": list(topology.securityPolicy.allowedInvocationModes),
        }
        descriptor["subagentLineage"] = [
            {
                "subagentName": node.name,
                "role": node.role,
                "mode": node.mode,
                "status": "configured",
                "checkpointPolicy": None if node.checkpointPolicy is None else {
                    "mode": node.checkpointPolicy.mode,
                    "resumeCursor": node.checkpointPolicy.resumeCursor,
                },
                "verificationCommand": node.verificationCommand,
            }
            for node in topology.subagents[:topology.securityPolicy.fanoutLimit]
        ]
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
    persisted_state = load_persisted_skill_runtime_state(request.workspace_dir) or {}
    descriptor = build_native_skill_runtime_descriptor(request)
    state = {
        "skill_slug": request.skill_slug,
        "bundle_dir": str(request.bundle_dir),
        "workspace_dir": str(request.workspace_dir),
        "resume_hint": request.resume_hint,
        "requested_subagent": request.requested_subagent,
        "task_hint": request.task_hint,
        "sdk_agent_name": request.skill_slug,
        "sdk_model": request.model or "gpt-5.4",
    }
    state = {**persisted_state, **state}
    state.update(descriptor)
    if descriptor.get("subagentLineage"):
        prior_lineage = state.get("lineage") if isinstance(state.get("lineage"), dict) else {}
        state["lineage"] = {
            **prior_lineage,
            "schemaVersion": 1,
            "skillSlug": request.skill_slug,
            "children": descriptor["subagentLineage"],
        }
    return run_supervised_skill_phases(
        workspace_dir=request.workspace_dir,
        bundle_dir=request.bundle_dir,
        skill_slug=request.skill_slug,
        phase_executor=phase_executor,
        resume_state=state,
    )
