"""Phase 4: SaaS Factory Orchestrator (LangGraph)

This is the first production-intent loop (Phase 4) that ties together:
- Kilo CLI execution (as the executor)
- Control Plane (authoritative state + gate evaluation)
- Checkpointing (LangGraph Postgres saver)

The loop is intentionally minimal and opinionated so it can be evolved safely.
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, TypedDict

import structlog
from langgraph.graph import END, StateGraph

from app.core.config import settings
from app.core.checkpointer import CheckpointerFactory
from app.orchestrator.control_plane_client import ControlPlaneClient
from app.services.kilo_session_manager import KiloMode, get_kilo_session_manager

logger = structlog.get_logger()


class FactoryState(TypedDict, total=False):
    session_id: str
    workspace: str
    goal: str
    apply: bool
    max_iterations: int
    iteration: int
    last_gate: Dict[str, Any]
    logs: List[str]


@dataclass
class FactoryConfig:
    """Configurable workflow keys.

    These correspond to file names in `.smartspec/workflows` without extension.
    Kilo command format: `/{workflow_key}.md`.
    """

    sync_tasks_workflow: str = "sync-tasks"
    implement_workflow: str = "implement"
    test_workflow: str = "test-suite"
    coverage_workflow: str = "coverage"


def _append_log(state: FactoryState, msg: str) -> FactoryState:
    logs = list(state.get("logs", []))
    logs.append(msg)
    state["logs"] = logs
    return state


def _extract_tasks_from_text(text: str) -> List[Dict[str, Any]]:
    """Best-effort parse tasks from markdown/text output.

    Supports:
    - JSON blocks containing `tasks: [...]`
    - Markdown checklists: `- [ ] title ...`
    """

    # 1) Try JSON
    try:
        data = json.loads(text)
        if isinstance(data, dict) and isinstance(data.get("tasks"), list):
            tasks: List[Dict[str, Any]] = []
            for t in data["tasks"]:
                if isinstance(t, dict) and t.get("title"):
                    tasks.append(t)
            if tasks:
                return tasks
    except Exception:
        pass

    # 2) Try fenced JSON block
    m = re.search(r"```json\s+(\{.*?\})\s+```", text, flags=re.S)
    if m:
        try:
            data = json.loads(m.group(1))
            if isinstance(data, dict) and isinstance(data.get("tasks"), list):
                return [t for t in data["tasks"] if isinstance(t, dict) and t.get("title")]
        except Exception:
            pass

    # 3) Markdown checklist
    tasks: List[Dict[str, Any]] = []
    for line in text.splitlines():
        mm = re.match(r"^\s*[-*]\s*\[\s*\]\s+(.*)$", line)
        if mm:
            title = mm.group(1).strip()
            if title:
                tasks.append({"title": title, "status": "planned"})
    return tasks


def _run_pytest(workspace: str) -> Dict[str, Any]:
    """Run pytest and return a minimal result payload."""
    try:
        proc = subprocess.run(
            ["pytest", "-q"],
            cwd=workspace,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=900,
        )
        out = proc.stdout[-20000:]
        return {"passed": proc.returncode == 0, "output": out}
    except Exception as e:
        return {"passed": False, "output": f"pytest_failed: {e}"}


def _run_coverage(workspace: str) -> Dict[str, Any]:
    """Try to run coverage via pytest-cov; returns percent if parseable."""
    try:
        proc = subprocess.run(
            ["pytest", "--cov=.", "--cov-report=term-missing"],
            cwd=workspace,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=1200,
        )
        out = proc.stdout[-40000:]
        # Parse a line like: TOTAL ... 85%
        mm = re.search(r"^TOTAL\s+\d+\s+\d+\s+(\d+)%", out, flags=re.M)
        percent = float(mm.group(1)) if mm else 0.0
        return {"ok": proc.returncode == 0, "percent": percent, "output": out}
    except Exception as e:
        return {"ok": False, "percent": 0.0, "output": f"coverage_failed: {e}"}


class SaaSFactoryOrchestrator:
    """Phase 4 orchestrator that loops until gates pass."""

    def __init__(self, config: Optional[FactoryConfig] = None):
        self.config = config or FactoryConfig()

    def _control_plane(self) -> ControlPlaneClient:
        return ControlPlaneClient(
            base_url=settings.CONTROL_PLANE_URL,
            api_key=settings.CONTROL_PLANE_API_KEY,
            timeout_seconds=settings.CONTROL_PLANE_TIMEOUT_SECONDS,
        )

    async def run(self, *, session_id: str, workspace: str, goal: str, apply: bool = False, max_iterations: int = 10) -> Dict[str, Any]:
        """Run the factory loop.

        Returns a dict that includes latest gate evaluation and a short log.
        """

        # Validate workspace exists
        ws = str(Path(workspace).resolve())
        if not Path(ws).exists():
            raise ValueError(f"workspace not found: {ws}")

        checkpointer = await CheckpointerFactory.create(use_postgres=True)

        graph = await self._build_graph(checkpointer)
        thread_id = f"factory:{session_id}"
        config = {"configurable": {"thread_id": thread_id}}

        init: FactoryState = {
            "session_id": session_id,
            "workspace": ws,
            "goal": goal,
            "apply": apply,
            "max_iterations": max_iterations,
            "iteration": 0,
            "logs": [],
        }

        final_state: FactoryState = init
        async for event in graph.astream(init, config=config):
            # LangGraph emits partial state updates; keep last snapshot.
            if isinstance(event, dict):
                final_state = {**final_state, **event}

        return {
            "sessionId": session_id,
            "iteration": final_state.get("iteration", 0),
            "gate": final_state.get("last_gate"),
            "logs": final_state.get("logs", [])[-200:],
        }

    async def _build_graph(self, checkpointer: Any):
        cp = self._control_plane()
        kilo = await get_kilo_session_manager()

        workflow = StateGraph(FactoryState)

        async def node_sync_tasks(state: FactoryState) -> FactoryState:
            iteration = int(state.get("iteration", 0))
            _append_log(state, f"[iter {iteration}] sync tasks")
            session = await kilo.create_session(workspace=state["workspace"], mode=KiloMode.ORCHESTRATOR)
            apply_flag = " --apply" if state.get("apply") else ""
            prompt = f"/{self.config.sync_tasks_workflow}.md{apply_flag} {state['goal']}"
            res = await kilo.execute_task(session=session, prompt=prompt)
            _append_log(state, f"sync_tasks exit={res.exit_code} success={res.success}")
            tasks = []
            if res.json_data and isinstance(res.json_data, dict):
                tasks = res.json_data.get("tasks") or []
            if not tasks:
                tasks = _extract_tasks_from_text(res.output)
            posted = 0
            for t in tasks:
                if not isinstance(t, dict):
                    continue
                if not t.get("title"):
                    continue
                await cp.upsert_task(state["session_id"], {
                    "title": t.get("title"),
                    "originatingSpec": t.get("originatingSpec"),
                    "acceptanceCriteria": t.get("acceptanceCriteria"),
                    "mappedFiles": t.get("mappedFiles", []),
                    "mappedTests": t.get("mappedTests", []),
                    "status": t.get("status", "planned"),
                    "notes": t.get("notes"),
                })
                posted += 1
            _append_log(state, f"tasks_upserted={posted}")
            return state

        async def node_implement(state: FactoryState) -> FactoryState:
            iteration = int(state.get("iteration", 0))
            _append_log(state, f"[iter {iteration}] implement")
            session = await kilo.create_session(workspace=state["workspace"], mode=KiloMode.ORCHESTRATOR)
            apply_flag = " --apply" if state.get("apply") else ""
            prompt = f"/{self.config.implement_workflow}.md{apply_flag} {state['goal']}"
            res = await kilo.execute_task(session=session, prompt=prompt)
            _append_log(state, f"implement exit={res.exit_code} success={res.success}")
            return state

        async def node_tests(state: FactoryState) -> FactoryState:
            iteration = int(state.get("iteration", 0))
            _append_log(state, f"[iter {iteration}] tests")
            # Prefer local pytest for determinism; Kilo workflow can be added later.
            result = _run_pytest(state["workspace"])
            await cp.record_test_run(state["session_id"], {
                "iteration": iteration,
                "passed": bool(result["passed"]),
                "summary": {"runner": "pytest", "tail": result["output"][-2000:]},
            })
            _append_log(state, f"tests passed={result['passed']}")
            return state

        async def node_coverage(state: FactoryState) -> FactoryState:
            iteration = int(state.get("iteration", 0))
            _append_log(state, f"[iter {iteration}] coverage")
            cov = _run_coverage(state["workspace"])
            await cp.record_coverage_run(state["session_id"], {
                "iteration": iteration,
                "percent": float(cov.get("percent", 0.0)),
                "summary": {"runner": "pytest-cov", "ok": bool(cov.get("ok")), "tail": cov.get("output", "")[-2000:]},
            })
            _append_log(state, f"coverage percent={cov.get('percent', 0.0)}")
            return state

        async def node_eval_gates(state: FactoryState) -> FactoryState:
            iteration = int(state.get("iteration", 0))
            _append_log(state, f"[iter {iteration}] evaluate gates")
            gate = await cp.evaluate_gates(state["session_id"])
            state["last_gate"] = gate.get("evaluation") if isinstance(gate, dict) else gate
            ok = bool(state["last_gate"].get("ok")) if isinstance(state.get("last_gate"), dict) else False
            _append_log(state, f"gates ok={ok}")
            return state

        def should_continue(state: FactoryState) -> str:
            iteration = int(state.get("iteration", 0))
            max_it = int(state.get("max_iterations", 10))
            gate = state.get("last_gate")
            ok = bool(gate.get("ok")) if isinstance(gate, dict) else False
            if ok:
                return "done"
            if iteration + 1 >= max_it:
                return "done"
            return "loop"

        async def node_inc_iter(state: FactoryState) -> FactoryState:
            state["iteration"] = int(state.get("iteration", 0)) + 1
            return state

        # Graph wiring
        workflow.add_node("sync_tasks", node_sync_tasks)
        workflow.add_node("implement", node_implement)
        workflow.add_node("tests", node_tests)
        workflow.add_node("coverage", node_coverage)
        workflow.add_node("eval_gates", node_eval_gates)
        workflow.add_node("inc_iter", node_inc_iter)

        workflow.set_entry_point("sync_tasks")
        workflow.add_edge("sync_tasks", "implement")
        workflow.add_edge("implement", "tests")
        workflow.add_edge("tests", "coverage")
        workflow.add_edge("coverage", "eval_gates")
        workflow.add_conditional_edges("eval_gates", should_continue, {"loop": "inc_iter", "done": END})
        workflow.add_edge("inc_iter", "sync_tasks")

        return workflow.compile(checkpointer=checkpointer)


# Convenience singleton
factory_orchestrator = SaaSFactoryOrchestrator()
