"""
Autonomous Executor — Level 3 Plan/Execute/Reflect engine.

Decomposes complex tasks into sub-tasks, executes them via ReActExecutor,
and reflects on quality to decide whether to re-plan.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections import deque
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable

from pydantic import BaseModel, Field

from app.services.agentic_limits import (
    MAX_DELEGATION_DEPTH,
    MAX_PLAN_DEPTH,
    MAX_TOTAL_ITERATIONS,
)
from app.services.agentic_sanitizer import sanitize_llm_input

if TYPE_CHECKING:
    from openai import AsyncOpenAI
    from app.services.agency_event_emitter import AgencyEventEmitter
    from app.services.react_executor import ReActExecutor, ToolDefinition, ToolEndpointMap

logger = logging.getLogger(__name__)

NodeRow = dict[str, Any]


# ── Pydantic Models ──────────────────────────────────────────────


class SubTask(BaseModel):
    id: str
    description: str
    depends_on: list[str] = Field(default_factory=list)
    execution_mode: str = "self"  # "self", "delegate", "cross_agency"
    delegate_to: str | None = None
    tool_hints: list[str] = Field(default_factory=list)
    estimated_complexity: str = "medium"


class TaskPlan(BaseModel):
    plan_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sub_tasks: list[SubTask]
    strategy: str = "sequential"
    estimated_total_tokens: int | None = None


class ReflectionResult(BaseModel):
    quality_score: float
    is_complete: bool
    gaps: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    replan_focus: str | None = None


class PlanValidationError(Exception):
    """Raised when a generated plan fails structural validation."""


@dataclass
class AutonomousResult:
    status: str  # "complete", "max_iterations", "max_plan_depth", "partial"
    final_answer: str
    plan_versions: int
    total_subtasks: int
    total_tokens: int
    subtask_results: dict[str, str] = field(default_factory=dict)


# ── Planner ──────────────────────────────────────────────────────


class AutonomousPlanner:
    """Uses LLM to decompose a task into sub-tasks with dependencies."""

    def __init__(
        self,
        gateway_client: Any,
        model_name: str,
        available_agents: dict[str, NodeRow],
        available_tools: list[str] | None = None,
    ) -> None:
        self.gateway_client = gateway_client
        self.model_name = model_name
        self.available_agents = available_agents
        self.available_tools = available_tools or []

    async def plan(
        self,
        task: str,
        context: str,
        previous_result: str | None = None,
        replan_focus: str | None = None,
    ) -> TaskPlan:
        """Decompose task into sub-tasks."""
        system_prompt = (
            "You are a task planner. Decompose the given task into sub-tasks. "
            "Respond with a JSON object matching this schema:\n"
            '{"plan_id": "uuid", "sub_tasks": [{"id": "subtask-1", "description": "...", '
            '"depends_on": [], "execution_mode": "self", "delegate_to": null, '
            '"tool_hints": [], "estimated_complexity": "medium"}], '
            '"strategy": "sequential", "estimated_total_tokens": null}\n'
            f"Available agents for delegation: {list(self.available_agents.keys())}\n"
            f"Available tools: {self.available_tools}"
        )

        messages: list[dict] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Task: {sanitize_llm_input(task)}\n\nContext: {context}"},
        ]

        if previous_result and replan_focus:
            messages.append({
                "role": "user",
                "content": (
                    f"Previous attempt result:\n{previous_result[:2000]}\n\n"
                    f"Focus on improving: {replan_focus}"
                ),
            })

        try:
            response = await asyncio.wait_for(
                self.gateway_client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    max_tokens=2000,
                    response_format={"type": "json_object"},
                ),
                timeout=120.0,
            )
        except asyncio.TimeoutError:
            raise PlanValidationError("Planning LLM call timed out after 120s")

        content = response.choices[0].message.content or "{}"
        plan = TaskPlan.model_validate_json(content)

        # Sanitize descriptions
        for st in plan.sub_tasks:
            st.description = sanitize_llm_input(st.description)

        self._validate_plan(plan)
        return plan

    def _validate_plan(self, plan: TaskPlan) -> None:
        """Validate plan structure."""
        if not plan.sub_tasks:
            raise PlanValidationError("Plan must have at least 1 sub-task")

        if len(plan.sub_tasks) > MAX_TOTAL_ITERATIONS:
            raise PlanValidationError(f"Too many sub-tasks: {len(plan.sub_tasks)} > {MAX_TOTAL_ITERATIONS}")

        ids = {st.id for st in plan.sub_tasks}

        # Validate depends_on references
        for st in plan.sub_tasks:
            for dep in st.depends_on:
                if dep not in ids:
                    raise PlanValidationError(f"Sub-task {st.id} depends on non-existent {dep}")

        # Check for cycles using Kahn's algorithm
        in_degree = {st.id: 0 for st in plan.sub_tasks}
        adj: dict[str, list[str]] = {st.id: [] for st in plan.sub_tasks}
        for st in plan.sub_tasks:
            for dep in st.depends_on:
                adj[dep].append(st.id)
                in_degree[st.id] += 1

        queue = deque(sid for sid, d in in_degree.items() if d == 0)
        sorted_count = 0
        while queue:
            node = queue.popleft()
            sorted_count += 1
            for neighbor in adj[node]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if sorted_count < len(plan.sub_tasks):
            raise PlanValidationError("Dependency cycle detected in plan")

        # Validate delegation targets
        for st in plan.sub_tasks:
            if st.execution_mode == "delegate" and st.delegate_to not in self.available_agents:
                st.execution_mode = "self"
                st.delegate_to = None


# ── Executor ─────────────────────────────────────────────────────


class AutonomousExecutor:
    """Executes sub-tasks via topological sort with parallel/sequential waves."""

    def __init__(
        self,
        react_executor_factory: Callable[..., Any],
        orchestrator: Any = None,
        event_emitter: Any = None,
        max_total_iterations: int = 50,
    ) -> None:
        self.react_executor_factory = react_executor_factory
        self.orchestrator = orchestrator
        self.event_emitter = event_emitter
        self.max_total_iterations = min(max_total_iterations, MAX_TOTAL_ITERATIONS)
        self._total_iterations = 0

    async def execute(self, plan: TaskPlan, ctx: Any) -> dict[str, str]:
        """Execute all sub-tasks in dependency order."""
        subtask_results: dict[str, str] = {}
        subtask_map = {st.id: st for st in plan.sub_tasks}

        # Topological sort into waves
        waves = self._compute_waves(plan.sub_tasks)

        for wave in waves:
            if self._total_iterations >= self.max_total_iterations:
                break

            if len(wave) == 1:
                st = subtask_map[wave[0]]
                result = await self._execute_subtask_safe(st, ctx, subtask_results)
                subtask_results[st.id] = result
                self._total_iterations += 1
            else:
                tasks = []
                for sid in wave:
                    st = subtask_map[sid]
                    tasks.append(self._execute_subtask_safe(st, ctx, subtask_results))
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for sid, result in zip(wave, results):
                    if isinstance(result, Exception):
                        subtask_results[sid] = f"[Error: {str(result)[:200]}]"
                    else:
                        subtask_results[sid] = result
                    self._total_iterations += 1

        return subtask_results

    async def _execute_subtask_safe(
        self, subtask: SubTask, ctx: Any, prior_results: dict[str, str]
    ) -> str:
        """Execute a sub-task with error handling."""
        try:
            return await self._execute_subtask(subtask, ctx, prior_results)
        except Exception as e:
            logger.error("subtask_failed", subtask_id=subtask.id, error=str(e)[:200])
            if self.event_emitter:
                await self.event_emitter.emit("autonomous_subtask_complete", {
                    "subtaskId": subtask.id,
                    "status": "failed",
                    "tokensUsed": 0,
                })
            return f"[Sub-task failed: {str(e)[:200]}]"

    async def _execute_subtask(
        self, subtask: SubTask, ctx: Any, prior_results: dict[str, str]
    ) -> str:
        """Execute a single sub-task."""
        # Build context from dependencies
        dep_context = "\n".join(
            f"[{dep_id}]: {prior_results[dep_id][:500]}"
            for dep_id in subtask.depends_on
            if dep_id in prior_results
        )

        if subtask.execution_mode == "cross_agency":
            return "[Cross-agency delegation is not permitted in autonomous mode]"
        elif subtask.execution_mode == "delegate" and subtask.delegate_to and self.orchestrator:
            result = await self._delegate(subtask.delegate_to, subtask.description, ctx)
        else:
            executor = self.react_executor_factory()
            react_result = await executor.execute(
                subtask.description,
                context={"prior_results": dep_context} if dep_context else None,
            )
            result = react_result.final_answer

        if self.event_emitter:
            await self.event_emitter.emit("autonomous_subtask_complete", {
                "subtaskId": subtask.id,
                "status": "complete",
                "tokensUsed": 0,
            })

        return result

    async def _delegate(self, agent_node_id: str, task: str, ctx: Any) -> str:
        """Delegate to another agent node."""
        delegation_depth = getattr(ctx, "delegation_depth", 0)
        if delegation_depth >= MAX_DELEGATION_DEPTH:
            return "[Delegation depth limit reached]"

        if not self.orchestrator:
            return "[Delegation not available — no orchestrator]"

        # Create isolated context
        import copy
        delegated_ctx = copy.copy(ctx)
        delegated_ctx.results = {}
        delegated_ctx.delegation_depth = delegation_depth + 1

        try:
            nodes = getattr(self.orchestrator, "nodes", {})
            target_node = nodes.get(agent_node_id)
            if not target_node:
                return f"[Delegate target '{agent_node_id}' not found]"

            return await self.orchestrator._execute_node(target_node, delegated_ctx)
        except Exception as e:
            return f"[Delegation failed: {str(e)[:200]}]"

    def _compute_waves(self, sub_tasks: list[SubTask]) -> list[list[str]]:
        """Group sub-tasks into execution waves using topological sort."""
        in_degree = {st.id: 0 for st in sub_tasks}
        adj: dict[str, list[str]] = {st.id: [] for st in sub_tasks}
        for st in sub_tasks:
            for dep in st.depends_on:
                adj[dep].append(st.id)
                in_degree[st.id] += 1

        waves = []
        queue = [sid for sid, d in in_degree.items() if d == 0]

        while queue:
            waves.append(queue)
            next_queue = []
            for node in queue:
                for neighbor in adj[node]:
                    in_degree[neighbor] -= 1
                    if in_degree[neighbor] == 0:
                        next_queue.append(neighbor)
            queue = next_queue

        return waves


# ── Reflector ────────────────────────────────────────────────────


class AutonomousReflector:
    """Evaluates completed work quality and decides whether to re-plan."""

    def __init__(
        self,
        gateway_client: Any,
        model_name: str,
        quality_threshold: float = 0.8,
    ) -> None:
        self.gateway_client = gateway_client
        self.model_name = model_name
        self.quality_threshold = quality_threshold

    async def reflect(
        self,
        task: str,
        subtask_results: dict[str, str],
        plan: TaskPlan,
    ) -> ReflectionResult:
        """Evaluate quality of completed work."""
        results_text = "\n".join(
            f"- {sid}: {sanitize_llm_input(result, max_length=500)}" for sid, result in subtask_results.items()
        )
        plan_text = "\n".join(
            f"- {st.id}: {st.description}" for st in plan.sub_tasks
        )
        task = sanitize_llm_input(task, max_length=5000)

        messages = [
            {
                "role": "system",
                "content": (
                    "You are a quality evaluator. Assess the work completed against the original task. "
                    "Respond with JSON: {\"quality_score\": 0.0-1.0, \"is_complete\": bool, "
                    "\"gaps\": [\"...\"], \"suggestions\": [\"...\"], \"replan_focus\": \"...\" or null}"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Original task: {task}\n\n"
                    f"Plan:\n{plan_text}\n\n"
                    f"Results:\n{results_text}"
                ),
            },
        ]

        try:
            response = await asyncio.wait_for(
                self.gateway_client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    max_tokens=1000,
                    response_format={"type": "json_object"},
                ),
                timeout=60.0,
            )
        except asyncio.TimeoutError:
            return ReflectionResult(quality_score=0.5, is_complete=False, gaps=["Reflection timed out"])

        content = response.choices[0].message.content or "{}"
        return ReflectionResult.model_validate_json(content)


# ── Top-Level Entry Point ────────────────────────────────────────


async def run_autonomous(
    task: str,
    ctx: Any,
    node_config: dict,
    gateway_client: Any,
    model_name: str,
    available_agents: dict[str, NodeRow],
    tools: list[dict],
    tool_endpoints: dict[str, dict],
    orchestrator: Any = None,
    event_emitter: Any = None,
) -> AutonomousResult:
    """Main entry point for autonomous Plan-Execute-Reflect cycle."""
    max_plan_depth = min(node_config.get("maxPlanDepth", 3), MAX_PLAN_DEPTH)
    max_total_iterations = min(
        node_config.get("maxTotalIterations", 20), MAX_TOTAL_ITERATIONS
    )
    quality_threshold = node_config.get("qualityThreshold", 0.8)
    delegation_mode = node_config.get("delegationMode", "self_only")

    planner = AutonomousPlanner(
        gateway_client=gateway_client,
        model_name=model_name,
        available_agents=available_agents,
        available_tools=[t.get("function", {}).get("name", "") for t in tools],
    )

    def react_factory() -> Any:
        from app.services.react_executor import ReActExecutor
        return ReActExecutor(
            gateway_client=gateway_client,
            model_name=model_name,
            agent_instructions="Execute the given sub-task thoroughly.",
            tools=tools,
            tool_endpoints=tool_endpoints,
            max_iterations=10,
            event_emitter=event_emitter,
        )

    executor = AutonomousExecutor(
        react_executor_factory=react_factory,
        orchestrator=orchestrator,
        event_emitter=event_emitter,
        max_total_iterations=max_total_iterations,
    )

    reflector = AutonomousReflector(
        gateway_client=gateway_client,
        model_name=model_name,
        quality_threshold=quality_threshold,
    )

    total_tokens = 0
    total_subtasks = 0
    previous_result = None
    replan_focus = None
    subtask_results: dict[str, str] = {}

    for plan_version in range(1, max_plan_depth + 1):
        try:
            plan = await planner.plan(
                task,
                getattr(ctx, "get_context_text", lambda: "")(),
                previous_result,
                replan_focus,
            )
        except PlanValidationError as e:
            return AutonomousResult(
                status="partial",
                final_answer=f"[Planning failed: {e}]",
                plan_versions=plan_version,
                total_subtasks=total_subtasks,
                total_tokens=total_tokens,
                subtask_results=subtask_results,
            )

        if event_emitter:
            await event_emitter.emit("autonomous_plan_created", {
                "planVersion": plan_version,
                "subtaskCount": len(plan.sub_tasks),
            })

        # Force self-only if delegation not enabled
        if delegation_mode == "self_only":
            for st in plan.sub_tasks:
                st.execution_mode = "self"

        subtask_results = await executor.execute(plan, ctx)
        total_subtasks += len(plan.sub_tasks)

        # Synthesize answer
        final_answer = "\n\n".join(
            f"{sid}: {result}" for sid, result in subtask_results.items()
        )

        # Reflect
        try:
            reflection = await reflector.reflect(task, subtask_results, plan)
        except Exception:
            # If reflection fails, accept the result
            return AutonomousResult(
                status="complete",
                final_answer=final_answer,
                plan_versions=plan_version,
                total_subtasks=total_subtasks,
                total_tokens=total_tokens,
                subtask_results=subtask_results,
            )

        if event_emitter:
            await event_emitter.emit("autonomous_reflection", {
                "qualityScore": reflection.quality_score,
                "isComplete": reflection.is_complete,
                "replanRequired": not reflection.is_complete and reflection.quality_score < quality_threshold,
            })

        if reflection.is_complete or reflection.quality_score >= quality_threshold:
            return AutonomousResult(
                status="complete",
                final_answer=final_answer,
                plan_versions=plan_version,
                total_subtasks=total_subtasks,
                total_tokens=total_tokens,
                subtask_results=subtask_results,
            )

        previous_result = final_answer
        replan_focus = reflection.replan_focus

    return AutonomousResult(
        status="max_plan_depth",
        final_answer=previous_result or "",
        plan_versions=max_plan_depth,
        total_subtasks=total_subtasks,
        total_tokens=total_tokens,
        subtask_results=subtask_results,
    )
