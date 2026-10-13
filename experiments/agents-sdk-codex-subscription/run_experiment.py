from __future__ import annotations

import argparse
import asyncio
import hashlib
import inspect
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import uuid
from functools import wraps
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import urlopen

from agents import Agent, Runner, function_tool, set_tracing_disabled
from agents import SQLiteSession
from agents.run_state import RunState

from codex_model import CodexSubscriptionModel
from durable_store import DurableRunStore, canonical_json, digest


HERE = Path(__file__).resolve().parent
ACCEPTANCE_TEST = HERE / "harness" / "hidden_acceptance.test.mjs"
BROWSER_UAT = HERE / "harness" / "browser_uat.cjs"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def maybe_crash(store: DurableRunStore, boundary: str, operation_id: str | None = None) -> None:
    requested = {part.strip() for part in os.getenv("AUTONOMY_CRASH_AT", "").split(",") if part.strip()}
    if boundary not in requested:
        return
    consumed = store.state.setdefault("crashConsumed", [])
    if boundary in consumed or any(str(item).startswith(f"{boundary}:") for item in consumed):
        return
    key = boundary
    consumed.append(key)
    store.event("fault.injected", {"boundary": boundary, "operationId": operation_id}, stable_key=f"fault:{key}")
    os.kill(os.getpid(), 9)


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temp.replace(path)


def ensure_inside(workspace: Path, relative_path: str) -> Path:
    rel = Path(relative_path)
    if rel.is_absolute() or not rel.parts or any(part in {"..", ".git"} for part in rel.parts):
        raise ValueError("Path must be relative and stay inside the disposable workspace")
    if rel.parts[0] == "evidence":
        raise PermissionError("The agent cannot read or modify harness-owned evidence")
    target = (workspace / rel).resolve()
    if not target.is_relative_to(workspace.resolve()):
        raise ValueError("Path escapes the disposable workspace")
    return target


def seed_workspace(workspace: Path) -> None:
    workspace.mkdir(parents=True, exist_ok=True)
    if any(workspace.iterdir()):
        raise FileExistsError(f"Refusing to seed a non-empty workspace: {workspace}")
    # Meaningful unknown defect: integer remainder cents are lost. The planner
    # sees the task and file list, while implementation discovers this through
    # the hidden acceptance check and source inspection.
    (workspace / "split.mjs").write_text(
        """export function allocateShares(totalCents, people) {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new Error('invalid total');
  if (!Number.isInteger(people) || people < 1) throw new Error('invalid people');
  const each = Math.floor(totalCents / people);
  return Array(people).fill(each);
}
""",
        encoding="utf-8",
    )


def run_command(
    args: list[str], *, cwd: Path, timeout: int = 30, env: dict[str, str] | None = None
) -> dict[str, Any]:
    start = time.monotonic()
    proc = subprocess.run(args, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout, check=False)
    return {
        "command": args,
        "exitCode": proc.returncode,
        "stdout": proc.stdout[-12000:],
        "stderr": proc.stderr[-12000:],
        "durationMs": round((time.monotonic() - start) * 1000),
    }


class ToolBox:
    def __init__(
        self, workspace: Path, state: dict[str, Any], *, writable: bool,
        save_state: Any | None = None,
        store: DurableRunStore | None = None,
        phase_id: str = "unbound",
    ):
        self.workspace = workspace.resolve()
        self.state = state
        self.writable = writable
        self.save_state = save_state or (lambda: None)
        self.store = store
        self.phase_id = phase_id

    def _operation_id(self, tool: str, value: Any) -> str:
        if not self.store:
            return hashlib.sha256(canonical_json([self.phase_id, tool, value]).encode()).hexdigest()
        return str(uuid.uuid5(uuid.UUID(self.store.run_id), f"tool:{self.phase_id}:{tool}:{digest(value)}"))

    def _cached(self, operation_id: str, phase_id: str, tool: str, value: Any) -> dict[str, Any] | None:
        if not self.store:
            return None
        row = self.store.begin_tool(operation_id, phase_id, tool, value)
        return json.loads(row["result_json"]) if row["status"] == "completed" else None

    def _record_tool(self, record: dict[str, Any]) -> None:
        rows = self.state.setdefault("toolInvocations", [])
        if record.get("operationId") and any(x.get("operationId") == record["operationId"] for x in rows):
            return
        rows.append(record)
        self.save_state()

    def list_files(self) -> list[str]:
        """List files in the disposable app workspace, without reading their contents."""
        result = sorted(
            str(relative)
            for path in self.workspace.rglob("*")
            if path.is_file()
            for relative in [path.relative_to(self.workspace)]
            if relative.parts[0] != "evidence"
        )
        op_id = self._operation_id("list_files", result)
        cached = self._cached(op_id, self.phase_id, "list_files", result)
        if cached is None and self.store:
            self.store.complete_tool(op_id, result, effect_hash=digest(result))
        self._record_tool({"operationId": op_id, "tool": "list_files", "at": now()})
        return cached if isinstance(cached, list) else result

    def read_file(self, relative_path: str) -> str:
        """Read a UTF-8 text file using a path relative to the disposable app workspace."""
        target = ensure_inside(self.workspace, relative_path)
        if not target.is_file():
            raise FileNotFoundError(relative_path)
        content = target.read_text(encoding="utf-8")[:50000]
        op_id = self._operation_id("read_file", {"path": relative_path, "contentSha256": hashlib.sha256(content.encode()).hexdigest()})
        cached = self._cached(op_id, self.phase_id, "read_file", {"path": relative_path, "contentSha256": hashlib.sha256(content.encode()).hexdigest()})
        if cached is None and self.store:
            self.store.complete_tool(op_id, content, effect_hash=hashlib.sha256(content.encode()).hexdigest())
        self._record_tool({"operationId": op_id, "tool": "read_file", "path": relative_path, "at": now()})
        return str(cached) if cached is not None else content

    def write_file(self, relative_path: str, content: str) -> str:
        """Write a UTF-8 text file inside the disposable app workspace. No deletes or external paths."""
        if not self.writable:
            raise PermissionError("This reviewer/verifier has read-only workspace tools")
        target = ensure_inside(self.workspace, relative_path)
        if len(content.encode("utf-8")) > 100000:
            raise ValueError("File exceeds 100 KB limit")
        op_id = self._operation_id("write_file", {"path": relative_path, "content": content})
        cached = self._cached(op_id, self.phase_id, "write_file", {"path": relative_path, "content": content})
        if cached:
            return str(cached["message"])
        target.parent.mkdir(parents=True, exist_ok=True)
        encoded = content.encode("utf-8")
        content_hash = hashlib.sha256(encoded).hexdigest()
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == content_hash:
            message = f"Reconciled existing {relative_path} ({len(content)} characters)"
            recovered = True
        else:
            temp = target.with_name(f".{target.name}.{op_id}.tmp")
            with temp.open("wb") as stream:
                stream.write(encoded)
                stream.flush()
                os.fsync(stream.fileno())
            temp.replace(target)
            message = f"Wrote {relative_path} ({len(content)} characters)"
            recovered = False
            if self.store:
                maybe_crash(self.store, "tool.write_file.after_effect", op_id)
        if self.store:
            self.store.complete_tool(op_id, {"message": message, "path": relative_path, "sha256": content_hash}, effect_hash=content_hash, recovered=recovered)
        self._record_tool({"operationId": op_id, "tool": "write_file", "path": relative_path, "at": now(), "recovered": recovered})
        return message

    def run_focused_tests(self) -> str:
        """Run visible Node tests plus the hidden acceptance tests. Returns real stdout/stderr."""
        source_hash = self._source_hash()
        op_id = self._operation_id("run_focused_tests", source_hash)
        cached = self._cached(op_id, self.phase_id, "run_focused_tests", source_hash)
        if cached:
            return json.dumps(cached, ensure_ascii=False)
        visible = sorted(str(path) for path in self.workspace.glob("*.test.mjs"))
        env = os.environ.copy()
        env["MINIAPP_WORKSPACE"] = str(self.workspace)
        output = run_command(["node", "--test", *visible, str(ACCEPTANCE_TEST)], cwd=self.workspace, env=env)
        receipt = {"kind": "node_tests", **output, "at": now(), "sourceSha256": source_hash}
        if self.store:
            self.store.complete_tool(op_id, receipt, effect_hash=source_hash)
        self._record_tool({"operationId": op_id, "tool": "run_focused_tests", "at": now()})
        self.state.setdefault("checkReceipts", []).append(receipt)
        self.save_state()
        return json.dumps(output, ensure_ascii=False)

    def run_browser_uat(self) -> str:
        """Start an isolated loopback server and run real Chromium Playwright interactions and screenshot capture."""
        source_hash = self._source_hash()
        harness_hash = hashlib.sha256(BROWSER_UAT.read_bytes()).hexdigest()
        operation_input = {"sourceSha256": source_hash, "harness": str(BROWSER_UAT), "harnessSha256": harness_hash}
        op_id = self._operation_id("run_browser_uat", operation_input)
        cached = self._cached(op_id, self.phase_id, "run_browser_uat", operation_input)
        if cached:
            return json.dumps(cached, ensure_ascii=False)
        receipt_name = f"browser-uat-{hashlib.sha256(op_id.encode()).hexdigest()[:16]}.json"
        recovered_receipt = self.workspace / "evidence" / receipt_name
        if recovered_receipt.is_file():
            receipt = json.loads(recovered_receipt.read_text(encoding="utf-8"))
            if receipt.get("result") == "PASS" and receipt.get("sourceSha256") == source_hash:
                if self.store:
                    self.store.complete_tool(op_id, receipt, effect_hash=source_hash, recovered=True)
                return json.dumps(receipt, ensure_ascii=False)
            # The process may have died before committing an unsuccessful UAT
            # receipt. Preserve it, then rerun the repeatable loopback check.
            suffix = f"-recovered-{uuid.uuid4().hex[:8]}"
            for key in ("screenshot", "trace", "failureScreenshot"):
                artifact = Path(receipt[key]) if receipt.get(key) else None
                if artifact and artifact.is_file():
                    artifact.replace(artifact.with_name(artifact.stem + suffix + artifact.suffix))
            recovered_receipt.replace(recovered_receipt.with_name(recovered_receipt.stem + suffix + recovered_receipt.suffix))
        self._record_tool({"operationId": op_id, "tool": "run_browser_uat", "at": now()})
        receipt = run_browser_uat(self.workspace, operation_id=op_id)
        if self.store:
            maybe_crash(self.store, "browser.after_receipt", op_id)
        if self.store:
            self.store.complete_tool(op_id, receipt, effect_hash=source_hash)
        self.state.setdefault("browserReceipts", []).append(receipt)
        self.save_state()
        return json.dumps(receipt, ensure_ascii=False)

    def _source_hash(self) -> str:
        files = []
        for path in sorted(self.workspace.iterdir()):
            if path.is_file() and path.suffix in {".html", ".mjs", ".js", ".css"}:
                files.append([path.name, hashlib.sha256(path.read_bytes()).hexdigest()])
        return digest(files)

    def tools(self, *names: str) -> list[Any]:
        """Expose bound implementations as schema-clean Agents SDK function tools."""
        wrapped = []
        for name in names:
            implementation = getattr(self, name)

            @wraps(implementation)
            async def execute(*args: Any, _implementation: Any = implementation, **kwargs: Any) -> Any:
                return _implementation(*args, **kwargs)

            execute.__signature__ = inspect.signature(implementation)
            wrapped.append(function_tool(execute, name_override=name))
        return wrapped


def reconcile_pending_tool_receipts(workspace: Path, state: dict[str, Any], store: DurableRunStore) -> list[dict[str, Any]]:
    """Settle journaled effects before Agents SDK resumes a saved RunState."""
    reconciled: list[dict[str, Any]] = []
    for row in store.pending_tool_receipts():
        operation_id = row["operation_id"]
        try:
            if not row.get("input_json"):
                store.supersede_tool(operation_id, {"status": "UNVERIFIED", "reason": "input was not persisted by the pre-recovery schema"}, reason="missing durable tool input")
                continue
            input_value = json.loads(row["input_json"])
            toolbox = ToolBox(workspace, state, writable=row["tool"] == "write_file", save_state=store.commit_state, store=store, phase_id=row["phase_id"])
            if row["tool"] == "write_file":
                result_text = toolbox.write_file(input_value["path"], input_value["content"])
            elif row["tool"] == "run_focused_tests":
                if toolbox._source_hash() != input_value:
                    store.supersede_tool(operation_id, {"status": "SUPERSEDED", "expectedSource": input_value, "currentSource": toolbox._source_hash()}, reason="source changed after interrupted test operation")
                    continue
                result_text = toolbox.run_focused_tests()
            elif row["tool"] == "run_browser_uat":
                if toolbox._source_hash() != input_value.get("sourceSha256"):
                    store.supersede_tool(operation_id, {"status": "SUPERSEDED", "expectedSource": input_value.get("sourceSha256"), "currentSource": toolbox._source_hash()}, reason="source changed after interrupted browser operation")
                    continue
                current_harness_hash = hashlib.sha256(BROWSER_UAT.read_bytes()).hexdigest()
                if input_value.get("harnessSha256") != current_harness_hash:
                    store.supersede_tool(
                        operation_id,
                        {"status": "SUPERSEDED", "expectedHarness": input_value.get("harnessSha256"), "currentHarness": current_harness_hash},
                        reason="browser harness changed after interrupted operation",
                    )
                    continue
                result_text = toolbox.run_browser_uat()
            elif row["tool"] == "list_files":
                current = sorted(str(p.relative_to(workspace)) for p in workspace.rglob("*") if p.is_file() and p.relative_to(workspace).parts[0] != "evidence")
                if current != input_value:
                    store.supersede_tool(operation_id, {"status": "SUPERSEDED", "currentFiles": current}, reason="workspace changed after interrupted file listing")
                    continue
                store.complete_tool(operation_id, current, effect_hash=digest(current), recovered=True)
                result_text = "reconciled file listing"
            elif row["tool"] == "read_file":
                target = ensure_inside(workspace, input_value["path"])
                current_text = target.read_text(encoding="utf-8")[:50000] if target.is_file() else None
                current_hash = hashlib.sha256(current_text.encode()).hexdigest() if current_text is not None else None
                if current_hash != input_value["contentSha256"]:
                    store.supersede_tool(operation_id, {"status": "SUPERSEDED", "currentSha256": current_hash}, reason="file changed after interrupted read")
                    continue
                store.complete_tool(operation_id, current_text, effect_hash=current_hash, recovered=True)
                result_text = "reconciled file read"
            else:
                store.supersede_tool(operation_id, {"status": "UNVERIFIED", "reason": "unsupported recovery handler"}, reason="no idempotent recovery handler")
                continue
            reconciled.append({"operationId": operation_id, "tool": row["tool"], "result": result_text})
        except Exception as exc:
            store.event("tool.intent.reconciliation_failed", {"operationId": operation_id, "tool": row["tool"], "error": f"{type(exc).__name__}: {exc}"})
    state["reconciledToolReceipts"] = state.get("reconciledToolReceipts", []) + reconciled
    store.commit_state()
    return reconciled


def run_browser_uat(workspace: Path, *, operation_id: str = "browser") -> dict[str, Any]:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=workspace,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    evidence_dir = workspace / "evidence"
    evidence_dir.mkdir(exist_ok=True)
    safe_id = hashlib.sha256(operation_id.encode()).hexdigest()[:16]
    receipt_path = evidence_dir / f"browser-uat-{safe_id}.json"
    env = os.environ.copy()
    env.update({
        "MINIAPP_URL": f"http://127.0.0.1:{port}/",
        "BROWSER_UAT_RECEIPT": str(receipt_path),
        "BROWSER_UAT_ID": safe_id,
        "MINIAPP_WORKSPACE": str(workspace.resolve()),
    })
    if "PLAYWRIGHT_MODULE_DIR" not in env:
        candidate = Path("/mnt/SmartSpecDev/projects/SmartSpecPro/node_modules")
        if candidate.is_dir():
            env["PLAYWRIGHT_MODULE_DIR"] = str(candidate)
    try:
        for _ in range(40):
            if server.poll() is not None:
                raise RuntimeError("Local app server exited before UAT")
            try:
                with urlopen(env["MINIAPP_URL"], timeout=1):
                    break
            except Exception:
                time.sleep(0.1)
        result = run_command(["node", str(BROWSER_UAT)], cwd=HERE, timeout=90, env=env)
        # Browser runner and screenshots are produced by real Chromium interactions.
        if receipt_path.exists():
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        else:
            receipt = {"status": "UNVERIFIED", "reason": "browser runner produced no receipt"}
        receipt["runner"] = result
        return receipt
    finally:
        server.terminate()
        try:
            server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()


def parse_result_json(output: Any) -> dict[str, Any]:
    if isinstance(output, dict):
        return output
    value = str(output).strip()
    if value.startswith("```"):
        value = value.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        start = value.find("{")
        end = value.rfind("}")
        if start >= 0 and end > start:
            parsed = json.loads(value[start : end + 1])
        else:
            return {"complete": False, "findings": ["Agent final output was not valid JSON", value[:1000]], "evidence": []}
    if not isinstance(parsed, dict):
        raise ValueError("Agent final output was not a JSON object")
    return parsed


def attempt_is_terminal(attempt: dict[str, Any]) -> bool:
    """An attempt is terminal only after failed implementation, rejected review, or verifier result."""
    if attempt.get("status") == "implementation_failed":
        return True
    review = attempt.get("review")
    if isinstance(review, dict) and (review.get("complete") is not True or bool(review.get("findings"))):
        return True
    return isinstance(attempt.get("verification"), dict)


def has_verified_success(state: dict[str, Any]) -> bool:
    return any(
        isinstance(attempt.get("verification"), dict)
        and attempt["verification"].get("complete") is True
        and not attempt["verification"].get("findings")
        for attempt in state.get("attempts", [])
    )


def find_incomplete_attempt(attempts: list[dict[str, Any]], attempt_number: int) -> dict[str, Any] | None:
    """Reuse an attempt row across a crash between review and verification settlement."""
    return next((
        item for item in attempts
        if int(item["attempt"]) == attempt_number
        and item.get("status") == "implemented"
        and not isinstance(item.get("verification"), dict)
    ), None)


def reconcile_completed_verifications(
    state: dict[str, Any], goal: str, acceptance: list[str], store: DurableRunStore,
) -> int:
    """Settle a verifier result persisted before a crash but not yet copied to the attempt row."""
    recovered = 0
    for attempt in state.get("attempts", []):
        review = attempt.get("review")
        if (
            isinstance(attempt.get("verification"), dict)
            or not isinstance(review, dict)
            or review.get("complete") is not True
            or review.get("findings")
        ):
            continue
        attempt_number = int(attempt["attempt"])
        phase_id = store.phase_id("verification", attempt_number)
        phase = store.get_phase(phase_id)
        if not phase or phase.get("status") != "completed" or not phase.get("output_json"):
            continue
        expected_input = {
            "goal": goal,
            "acceptance": acceptance,
            "source_snapshot": attempt.get("sourceSnapshot"),
            "test_receipt": attempt.get("postImplementChecks"),
            "browser_receipt": attempt.get("postImplementBrowserUat"),
            "independent_review": review,
        }
        try:
            stored_wrapper = json.loads(phase["input_json"])
            stored_input = json.loads(stored_wrapper["input"])
            if canonical_json(stored_input) != canonical_json(expected_input):
                continue
            saved = json.loads(phase["output_json"])
            verification = parse_result_json(saved["finalOutput"])
        except (KeyError, TypeError, json.JSONDecodeError, ValueError):
            continue
        attempt["verificationFinalOutput"] = str(saved["finalOutput"])
        attempt["verification"] = verification
        attempt["verificationItems"] = []
        store.event(
            "verification.result.reconciled",
            {"attempt": attempt_number, "phaseId": phase_id},
            stable_key=f"verification:{phase_id}:reconciled",
        )
        recovered += 1
    if recovered:
        store.commit_state()
    return recovered


def make_agent(
    role: str, instructions: str, toolbox: ToolBox,
    on_receipt: Any, tools: list[Any], store: DurableRunStore, phase_id: str,
) -> Agent:
    codex_workdir = Path(os.getenv("TMPDIR", "/tmp")).resolve()
    model = CodexSubscriptionModel(codex_cwd=codex_workdir, role=role, on_receipt=on_receipt, store=store, phase_id=phase_id)
    return Agent(name=role.replace("_", " ").title(), instructions=instructions, model=model, tools=tools)


def _run_agent_phase(agent: Agent, phase_name: str, attempt: int, phase_input: str, max_turns: int, store: DurableRunStore) -> Any:
    phase = store.start_phase(phase_name, attempt, {"input": phase_input, "maxTurns": max_turns}, max_turns)
    if phase["status"] == "completed":
        from types import SimpleNamespace
        saved = json.loads(phase["output_json"])
        return SimpleNamespace(final_output=saved["finalOutput"], new_items=[])
    phase_id = phase["phase_id"]
    session = SQLiteSession(phase_id, db_path=store.evidence_dir / "agents-sessions.sqlite3")
    async def execute():
        checkpoint = json.loads(phase["checkpoint_json"]) if phase.get("checkpoint_json") else None
        run_input = await RunState.from_json(agent, checkpoint) if checkpoint else phase_input
        streamed = Runner.run_streamed(agent, run_input, max_turns=max_turns, session=session)
        try:
            async for _event in streamed.stream_events():
                state_obj = streamed.to_state()
                store.save_checkpoint(phase_id, state_obj.to_json())
            result = {"finalOutput": streamed.final_output, "lastResponseId": streamed.last_response_id}
            store.complete_phase(phase_id, result)
            if phase_name == "verification":
                maybe_crash(store, "verification.after_phase_complete", phase_id)
            return streamed
        finally:
            session.close()
    return asyncio.run(execute())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--goal", default=(
        "Build a self-contained, offline SplitFair Mini App for splitting a bill. Use only local assets; "
        "do not request fonts, scripts, APIs, or other resources from external hosts. Enter a dollar amount and "
        "number of people, calculate whole-cent shares that reconcile exactly to the total, show each "
        "person's share, require a bill amount of at least $0.01 with no more than two decimal places, and a whole "
        "people count from 1 to 1,000. Reject sub-cent amounts instead of silently rounding them, validate invalid "
        "input, and make Reset clear the results. Keep allocateShares "
        "in split.mjs and add visible tests. Label the amount field exactly 'Bill total' (accessible name "
        "'Bill total in dollars') and the people field 'Number of people'. Browser interaction uses these "
        "labeled amount/people fields, a submit "
        "button, and a reset button; the results section exposes the rendered per-person amounts."
    ))
    parser.add_argument("--max-attempts", type=int, default=2)
    parser.add_argument("--implementation-max-turns", type=int, default=12)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--run-id")
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    if args.max_attempts < 1 or args.max_attempts > 4:
        parser.error("--max-attempts must be from 1 to 4")
    set_tracing_disabled(True)
    evidence_dir = workspace / "evidence"
    run_id = args.run_id or str(uuid.uuid4())
    initial_state: dict[str, Any] = {
        "schema": "agents-sdk-codex-subscription.v1",
        "runId": run_id,
        "mode": "AGENTS_SDK_CODEX_SUBSCRIPTION_EXPERIMENT",
        "goal": args.goal,
        "workspace": str(workspace),
        "status": "planning",
        "createdAt": now(),
        "runtimeVersions": {
            "python": sys.version.split()[0],
            "agentsSdk": __import__("importlib.metadata", fromlist=["version"]).version("openai-agents"),
            "codexSdk": __import__("importlib.metadata", fromlist=["version"]).version("openai-codex"),
        },
        "attempts": [],
        "modelReceipts": [],
        "toolInvocations": [],
        "checkReceipts": [],
        "browserReceipts": [],
    }
    if not args.resume:
        seed_workspace(workspace)
    store = DurableRunStore(evidence_dir, run_id=run_id, initial_state=None if args.resume else initial_state, resume=args.resume)
    state = store.state
    state_path = store.state_path
    if args.resume:
        reconcile_pending_tool_receipts(workspace, state, store)

    def record_model_receipt(receipt: dict[str, Any]) -> None:
        if all(x.get("turnId") != receipt.get("turnId") for x in state.setdefault("modelReceipts", [])):
            state["modelReceipts"].append(receipt)
        store.commit_state()

    def source_snapshot() -> dict[str, str]:
        result: dict[str, str] = {}
        for path in sorted(workspace.iterdir()):
            if path.is_file() and path.suffix in {".html", ".mjs", ".js", ".css"}:
                result[path.name] = path.read_text(encoding="utf-8")[:30000]
        return result

    planning_phase_id = store.phase_id("planning")
    planner_tools = ToolBox(workspace, state, writable=False, save_state=store.commit_state, store=store, phase_id=planning_phase_id)
    plan_agent = make_agent(
        "planner",
        "Create a concise JSON plan with keys task_instruction (string) and acceptance (array of strings). "
        "Do not implement or diagnose hidden test failures. Inspect only the file list if useful.",
        planner_tools,
        record_model_receipt,
        planner_tools.tools("list_files"),
        store, planning_phase_id,
    )
    if args.implementation_max_turns < 4 or args.implementation_max_turns > 30:
        parser.error("--implementation-max-turns must be from 4 to 30")
    plan_result = _run_agent_phase(plan_agent, "planning", 0, args.goal, 4, store)
    plan = state.get("plan") or parse_result_json(plan_result.final_output)
    if not isinstance(plan.get("task_instruction"), str) or not isinstance(plan.get("acceptance"), list):
        raise ValueError("Planner output did not satisfy the task plan contract")
    state["plan"] = plan
    state["plannerItems"] = [str(getattr(item, "type", type(item).__name__)) for item in plan_result.new_items]
    state["status"] = "implementing"
    store.commit_state()

    reconcile_completed_verifications(state, args.goal, plan["acceptance"], store)
    accepted = has_verified_success(state)
    prior_attempts = state.get("attempts", [])
    latest_prior = prior_attempts[-1] if prior_attempts else {}
    last_findings: list[str] = [str(x) for x in state.get("lastFindings", latest_prior.get("review", {}).get("findings", []))]
    finished_attempts = {int(item["attempt"]) for item in prior_attempts if attempt_is_terminal(item)}
    for attempt_number in range(1, args.max_attempts + 1):
        if accepted:
            break
        if attempt_number in finished_attempts:
            prior = next((item for item in reversed(prior_attempts) if int(item["attempt"]) == attempt_number), {})
            if prior.get("review", {}).get("findings"):
                last_findings = [str(x) for x in prior["review"]["findings"]]
            continue
        implementation_phase_id = store.phase_id("implementation", attempt_number)
        toolbox = ToolBox(workspace, state, writable=True, save_state=store.commit_state, store=store, phase_id=implementation_phase_id)
        implementation_instructions = (
            "Implement the supplied plan in the disposable workspace. Preserve correct code, inspect existing files, "
            "run focused tests first to capture any baseline failure, then write the app and visible tests, run focused "
            "tests and browser UAT again, and repair every failure you can. Never edit the harness acceptance tests. "
            "Use only provided tools. Do not access network, secrets, files outside the workspace, or services. "
            f"Plan JSON: {json.dumps(plan, ensure_ascii=False)}\nPrevious findings: {json.dumps(last_findings, ensure_ascii=False)}"
        )
        implementer = make_agent(
            "implementer", implementation_instructions, toolbox, record_model_receipt,
            toolbox.tools("list_files", "read_file", "write_file", "run_focused_tests", "run_browser_uat"),
            store, implementation_phase_id,
        )
        start = time.monotonic()
        try:
            result = _run_agent_phase(implementer, "implementation", attempt_number, args.goal, args.implementation_max_turns, store)
        except Exception as exc:
            attempt = {
                "attempt": attempt_number,
                "status": "implementation_failed",
                "error": f"{type(exc).__name__}: {exc}",
                "durationMs": round((time.monotonic() - start) * 1000),
            }
            state["attempts"].append(attempt)
            last_findings = [attempt["error"], "Inspect persisted model receipts and recover within the next bounded attempt."]
            state["lastFindings"] = last_findings
            state["status"] = "retrying"
            store.commit_state()
            continue
        attempt = find_incomplete_attempt(state.get("attempts", []), attempt_number)
        if attempt is None:
            attempt = {
                "attempt": attempt_number,
                "status": "implemented",
                "durationMs": round((time.monotonic() - start) * 1000),
                "finalOutput": result.final_output,
                "newItems": [str(getattr(item, "type", type(item).__name__)) for item in result.new_items],
            }
            state["attempts"].append(attempt)
        # Reuse the receipt-bound evidence and source snapshot persisted before
        # review. Re-running here can add timestamps/ports and change the input
        # hash of a review phase restored from Agents SDK RunState.
        post_tools = ToolBox(workspace, state, writable=False, save_state=store.commit_state, store=store, phase_id=implementation_phase_id)
        current_snapshot = source_snapshot()
        if attempt.get("sourceSnapshot") and attempt["sourceSnapshot"] != current_snapshot:
            attempt["status"] = "implementation_failed"
            last_findings = ["Workspace source changed after its persisted evidence snapshot; start a new bounded attempt."]
            state["lastFindings"] = last_findings
            store.commit_state()
            continue
        if not attempt.get("postImplementChecks"):
            attempt["postImplementChecks"] = json.loads(post_tools.run_focused_tests())
        if not attempt.get("postImplementBrowserUat"):
            attempt["postImplementBrowserUat"] = json.loads(post_tools.run_browser_uat())
        attempt["sourceSnapshot"] = current_snapshot
        state["status"] = "reviewing"
        store.commit_state()

        review_phase_id = store.phase_id("review", attempt_number)
        review_tools = ToolBox(workspace, state, writable=False, save_state=store.commit_state, store=store, phase_id=review_phase_id)
        review_agent = make_agent(
            f"independent_reviewer_{attempt_number}",
            "Independently review the supplied source snapshot and actual test/browser receipts. These receipts "
            "were already produced by the harness; do not claim that tools are unavailable and do not invent new "
            "results. You are read-only and must not request edits. Return only JSON "
            "{complete:boolean, findings:string[], evidence:string[]}. A passing result requires all focused checks "
            "and browser interactions to pass with no page errors.",
            review_tools,
            record_model_receipt,
            [],
            store, review_phase_id,
        )
        try:
            review_result = _run_agent_phase(
                review_agent,
                "review", attempt_number,
                json.dumps({
                    "goal": args.goal,
                    "acceptance": plan["acceptance"],
                    "source_snapshot": attempt["sourceSnapshot"],
                    "test_receipt": attempt["postImplementChecks"],
                    "browser_receipt": attempt["postImplementBrowserUat"],
                }, ensure_ascii=False),
                3, store,
            )
        except Exception as exc:
            attempt["review"] = {"complete": False, "findings": [f"Reviewer run failed: {type(exc).__name__}: {exc}"]}
            state["status"] = "retrying"
            last_findings = attempt["review"]["findings"]
            store.commit_state()
            continue
        attempt["reviewFinalOutput"] = str(review_result.final_output)
        review = parse_result_json(review_result.final_output)
        attempt["review"] = review
        attempt["reviewItems"] = [str(getattr(item, "type", type(item).__name__)) for item in review_result.new_items]
        store.commit_state()
        if review.get("complete") is True and not review.get("findings"):
            verification_phase_id = store.phase_id("verification", attempt_number)
            verifier_tools = ToolBox(workspace, state, writable=False, save_state=store.commit_state, store=store, phase_id=verification_phase_id)
            verifier = make_agent(
                f"independent_final_verifier_{attempt_number}",
                "You are a fresh independent final verifier. Validate the supplied current source snapshot and "
                "actual test/browser receipts against every acceptance criterion. The receipts are harness evidence; "
                "do not claim tools are unavailable or invent new results. Do not edit files. Return only JSON "
                "{complete:boolean, findings:string[], evidence:string[]}.",
                verifier_tools,
                record_model_receipt,
                [],
                store, verification_phase_id,
            )
            try:
                verify_result = _run_agent_phase(
                    verifier,
                    "verification", attempt_number,
                    json.dumps({
                        "goal": args.goal,
                        "acceptance": plan["acceptance"],
                        "source_snapshot": attempt["sourceSnapshot"],
                        "test_receipt": attempt["postImplementChecks"],
                        "browser_receipt": attempt["postImplementBrowserUat"],
                        "independent_review": review,
                    }, ensure_ascii=False),
                    3, store,
                )
            except Exception as exc:
                attempt["verification"] = {
                    "complete": False,
                    "findings": [f"Final verification run failed: {type(exc).__name__}: {exc}"],
                }
                last_findings = attempt["verification"]["findings"]
                store.commit_state()
                continue
            attempt["verificationFinalOutput"] = str(verify_result.final_output)
            verification = parse_result_json(verify_result.final_output)
            attempt["verification"] = verification
            attempt["verificationItems"] = [str(getattr(item, "type", type(item).__name__)) for item in verify_result.new_items]
            store.commit_state()
            if verification.get("complete") is True and not verification.get("findings"):
                accepted = True
                break
            last_findings = [str(item) for item in verification.get("findings", [])]
            continue
        last_findings = [str(item) for item in review.get("findings", [])]
        state["lastFindings"] = last_findings
        store.commit_state()

    reconcile_pending_tool_receipts(workspace, state, store)
    pending_receipts = store.pending_tool_receipts()
    state["pendingToolReceiptCount"] = len(pending_receipts)
    state["supersededToolReceiptCount"] = int(store.connection.execute("SELECT COUNT(*) FROM tool_receipts WHERE status='superseded'").fetchone()[0])
    if pending_receipts:
        accepted = False
        state["receiptSettlementError"] = "Unresolved tool intents remain after final reconciliation"
    state["status"] = "completed" if accepted and not pending_receipts else "retry_exhausted"
    state["finishedAt"] = now()
    state["durationMs"] = round((time.time() - datetime.fromisoformat(state["createdAt"]).timestamp()) * 1000)
    usage_totals = {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "cachedInputTokens": 0}
    usage_unknown = False
    for receipt in state.get("modelReceipts", []):
        if receipt.get("usage") is None:
            usage_unknown = True
            continue
        last = (receipt.get("usage") or {}).get("last") or {}
        usage_totals["inputTokens"] += int(last.get("inputTokens", 0))
        usage_totals["outputTokens"] += int(last.get("outputTokens", 0))
        usage_totals["totalTokens"] += int(last.get("totalTokens", 0))
        usage_totals["cachedInputTokens"] += int(last.get("cachedInputTokens", 0))
    state["subscriptionTokenUsage"] = usage_totals
    state["subscriptionTokenUsageStatus"] = "PARTIAL_UNVERIFIED" if usage_unknown else "RECORDED"
    state["codexTurnCount"] = len(state["modelReceipts"])
    state["uniqueToolOperationCount"] = len(state.get("toolInvocations", []))
    state["toolInvocationCount"] = store.count_tool_invocations()
    state["files"] = sorted(str(path.relative_to(workspace)) for path in workspace.rglob("*") if path.is_file())
    store.finish_run(accepted)
    store.commit_state()
    store.close()
    print(json.dumps(state, ensure_ascii=False, indent=2))
    return 0 if accepted else 1


if __name__ == "__main__":
    raise SystemExit(main())
