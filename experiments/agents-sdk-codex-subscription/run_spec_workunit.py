"""SPEC WorkUnit entry point reusing the durable Agents SDK/Codex runtime.

This deliberately exposes a fixed repository allowlist and one fixed focused
test command; model output never becomes shell input.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from agents import Runner, SQLiteSession, set_tracing_disabled
from agents.run_state import RunState

from durable_store import DurableRunStore
from run_experiment import make_agent, now, parse_result_json

ROOT = Path(__file__).resolve().parents[2]
FILES = [
    "apps/web/server/routers/contentQuality.ts",
    "apps/web/server/routers/contentQuality.router.test.ts",
    "apps/web/server/routers/contentQuality.test.ts",
    "apps/web/client/src/pages/ContentQualityDashboard.tsx",
    "apps/web/client/src/pages/__tests__/ContentQualityDashboard.test.tsx",
    "apps/web/server/services/costTracker.ts",
    "apps/web/server/services/skillModelFallback.ts",
    "apps/web/drizzle/schema.ts",
    "apps/web/drizzle/meta/_journal.json",
    "apps/web/drizzle/0400_spec038_skill_cost_attribution.sql",
    "apps/web/server/services/llmRouter.ts",
    "apps/web/server/services/auditLogger.ts",
]
PATCHABLE = {"apps/web/drizzle/schema.ts", "apps/web/server/services/llmRouter.ts", "apps/web/drizzle/meta/_journal.json", "apps/web/server/services/costTracker.ts", "apps/web/server/services/skillModelFallback.ts", "apps/web/server/routers/contentQuality.ts"}
TESTS = ["pnpm", "--dir", "apps/web", "exec", "vitest", "run",
         "server/routers/contentQuality.router.test.ts",
         "server/routers/contentQuality.test.ts",
         "client/src/pages/__tests__/ContentQualityDashboard.test.tsx",
         "server/services/costTracker.test.ts",
         "server/services/skillModelFallback.test.ts"]

def source_hashes() -> dict[str, str]:
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in FILES if (ROOT / p).is_file()}

def task_source_context() -> dict[str, str]:
    """Capture small, exact source windows needed for the selected WorkUnit."""
    windows = {
        "apps/web/server/routers/contentQuality.ts": [(175, 225)],
        "apps/web/client/src/pages/ContentQualityDashboard.tsx": [(288, 330)],
        "apps/web/server/routers/contentQuality.router.test.ts": [(1, 215)],
        "apps/web/server/services/costTracker.ts": [(1, 52)],
        "apps/web/server/services/skillModelFallback.ts": [(145, 185)],
        "apps/web/drizzle/schema.ts": [(1505, 1555), (1563, 1598)],
        "apps/web/server/_core/llmRoutes.ts": [(2475, 2510)],
    }
    llm_router = (ROOT / "apps/web/server/services/llmRouter.ts").read_text(encoding="utf-8").splitlines()
    dynamic = [(idx + 1, min(idx + 24, len(llm_router))) for idx, line in enumerate(llm_router) if "logRequest({" in line]
    for idx, line in enumerate(llm_router):
        if "export async function executeWithFallback" in line:
            dynamic.append((idx + 1, min(idx + 58, len(llm_router))))
            break
    windows["apps/web/server/services/llmRouter.ts"] = dynamic
    result = {}
    for path, spans in windows.items():
        lines = (ROOT / path).read_text(encoding="utf-8").splitlines()
        chunks = []
        for start, end in spans:
            chunks.append("\n".join(f"{i}: {lines[i-1]}" for i in range(start, min(end, len(lines)) + 1)))
        result[path] = "\n\n".join(chunks)
    return result


class ScopedRepoTools:
    def __init__(self, store: DurableRunStore, phase_id: str, writable: bool):
        self.store, self.phase_id, self.writable = store, phase_id, writable
        self.root = ROOT.resolve()

    def _path(self, path: str) -> Path:
        if path not in FILES:
            raise PermissionError("Path is outside this SPEC WorkUnit allowlist")
        return (self.root / path).resolve()

    def list_files(self) -> list[str]:
        """List the fixed files owned by SPEC038_CONTENT_COST_BY_SKILL."""
        return [p for p in FILES if self._path(p).is_file()]

    def read_file(self, path: str) -> str:
        """Read an allowlisted source file. This tool is read-only."""
        target = self._path(path)
        return target.read_text(encoding="utf-8")[:50000] if target.exists() else "<file does not exist>"

    def read_range(self, path: str, start_line: int, end_line: int) -> str:
        """Read at most 300 lines from an allowlisted file; read-only source inspection."""
        target = self._path(path)
        if start_line < 1 or end_line < start_line or end_line - start_line > 1000:
            raise ValueError("Read range must be at most 1,000 lines")
        lines = target.read_text(encoding="utf-8").splitlines()
        return "\n".join(f"{i}: {lines[i-1]}" for i in range(start_line, min(end_line, len(lines)) + 1))

    def write_file(self, path: str, content: str) -> str:
        """Write an allowlisted small source/test/migration file inside this task worktree. This is an authorized host-executed write; never use shell writes."""
        if not self.writable:
            raise PermissionError("Review tools are read-only")
        if path in PATCHABLE:
            raise PermissionError("This large/structured file requires the scoped patch_file tool")
        target = self._path(path)
        if len(content.encode()) > 100000:
            raise ValueError("File exceeds 100 KB limit")
        value = {"path": path, "content": content, "workUnit": "SPEC038_CONTENT_COST_BY_SKILL", "sourceRevision": self.store.state.get("sourceRevision")}
        operation_id = str(uuid.uuid5(uuid.UUID(self.store.run_id), f"tool:{self.phase_id}:write_file:{hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()}"))
        receipt = self.store.begin_tool(operation_id, self.phase_id, "write_file", value)
        if receipt["status"] == "completed":
            return json.loads(receipt["result_json"])["message"]
        target.parent.mkdir(parents=True, exist_ok=True)
        raw = content.encode()
        sha = hashlib.sha256(raw).hexdigest()
        temp = target.with_name(f".{target.name}.{operation_id}.tmp")
        temp.write_bytes(raw)
        temp.replace(target)
        message = f"Wrote {path}; sha256={sha}"
        self.store.complete_tool(operation_id, {"message": message, "sha256": sha}, effect_hash=sha)
        return message

    def patch_file(self, path: str, patch: str) -> str:
        """Apply exact-context Update File hunks to one allowlisted large source file in this task worktree. Authorized host-executed write, bounded to this file; never use shell writes."""
        if not self.writable:
            raise PermissionError("Review tools are read-only")
        if path not in PATCHABLE or len(patch.encode()) > 30000:
            raise PermissionError("Patch target is not authorized or patch exceeds 30 KB")
        if f"*** Update File: {path}" not in patch or "../" in patch or "*** Add File:" in patch or "*** Delete File:" in patch:
            raise ValueError("Patch must use scoped Update File hunks for exactly the authorized path")
        value = {"path": path, "patch": patch, "workUnit": "SPEC038_CONTENT_COST_BY_SKILL", "sourceRevision": self.store.state.get("sourceRevision")}
        op = str(uuid.uuid5(uuid.UUID(self.store.run_id), f"tool:{self.phase_id}:patch_file:{hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()}"))
        cached = self.store.begin_tool(op, self.phase_id, "patch_file", value)
        if cached["status"] == "completed":
            return json.loads(cached["result_json"])["message"]
        def reject(message: str) -> None:
            row = self.store.get_tool_receipt(op)
            if row and row.get("status") == "intent":
                self.store.supersede_tool(op, {"status": "PATCH_REJECTED", "error": message}, reason="scoped patch validation failed")
        target = self._path(path)
        original = target.read_text(encoding="utf-8")
        lines = patch.splitlines()
        if not lines or lines[0] != "*** Begin Patch" or lines[-1] != "*** End Patch":
            reject("Patch must have Begin Patch and End Patch markers")
            raise ValueError("Patch must have Begin Patch and End Patch markers")
        update_headers = [line for line in lines if line.startswith("*** Update File:")]
        if update_headers != [f"*** Update File: {path}"]:
            reject("Patch must update exactly its authorized path")
            raise ValueError("Patch must update exactly its authorized path")

        hunks: list[tuple[list[str], list[str]]] = []
        old_lines: list[str] = []
        new_lines: list[str] = []
        in_hunk = False
        for line in lines[2:-1]:
            if line.startswith("@@"):
                if in_hunk:
                    if not old_lines:
                        reject("Each patch hunk needs exact old context")
                        raise ValueError("Each patch hunk needs exact old context")
                    hunks.append((old_lines, new_lines))
                old_lines, new_lines, in_hunk = [], [], True
                continue
            if not in_hunk:
                continue
            if line.startswith("\\ No newline"):
                continue
            if line.startswith(" "):
                old_lines.append(line[1:]); new_lines.append(line[1:])
            elif line.startswith("-"):
                old_lines.append(line[1:])
            elif line.startswith("+"):
                new_lines.append(line[1:])
            else:
                reject("Patch hunk contains an invalid line")
                raise ValueError("Patch hunk contains an invalid line")
        if in_hunk:
            if not old_lines:
                reject("Each patch hunk needs exact old context")
                raise ValueError("Each patch hunk needs exact old context")
            hunks.append((old_lines, new_lines))
        if not hunks:
            reject("Patch contains no update hunks")
            raise ValueError("Patch contains no update hunks")

        updated = original
        for old_hunk, new_hunk in hunks:
            old_text, new_text = "\n".join(old_hunk), "\n".join(new_hunk)
            if old_text == new_text:
                continue
            count = updated.count(old_text)
            if count == 0 and updated.count(new_text) == 1:
                continue
            if count != 1:
                message = f"Patch context must match exactly once (matched {count}); refresh source and retry"
                reject(message)
                raise ValueError(message)
            updated = updated.replace(old_text, new_text, 1)
        if updated == original:
            message = f"Reconciled already-applied patch for {path}"
        else:
            temp = target.with_name(f".{target.name}.{op}.tmp")
            temp.write_text(updated, encoding="utf-8")
            temp.replace(target)
            message = f"Applied scoped patch to {path}"
        self.store.complete_tool(op, {"message": message, "path": path}, effect_hash=hashlib.sha256(patch.encode()).hexdigest(), recovered="Reconciled" in message)
        return message

    def run_focused_tests(self) -> str:
        """Run the fixed five-file SPEC-038 Vitest regression suite; no model-provided command is executed."""
        revision = hashlib.sha256("".join(hashlib.sha256(self._path(p).read_bytes()).hexdigest() for p in FILES if self._path(p).is_file()).encode()).hexdigest()
        value = {"revision": revision, "command": TESTS, "workUnit": "SPEC038_CONTENT_COST_BY_SKILL", "workspace": str(self.root)}
        operation_id = str(uuid.uuid5(uuid.UUID(self.store.run_id), f"tool:{self.phase_id}:run_focused_tests:{hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()}"))
        cached = self.store.begin_tool(operation_id, self.phase_id, "run_focused_tests", value)
        if cached["status"] == "completed":
            return cached["result_json"]
        started = time.monotonic()
        result = subprocess.run(TESTS, cwd=self.root, text=True, capture_output=True, timeout=240, check=False)
        receipt = {"command": TESTS, "revision": revision, "workUnit": "SPEC038_CONTENT_COST_BY_SKILL", "workspace": str(self.root), "exitCode": result.returncode,
                   "stdout": result.stdout[-12000:], "stderr": result.stderr[-12000:],
                   "durationMs": round((time.monotonic()-started)*1000), "recordedAt": now()}
        self.store.complete_tool(operation_id, receipt, effect_hash=revision)
        return json.dumps(receipt)

    def tools(self, writable: bool) -> list[Any]:
        from functools import wraps
        import inspect
        from agents import function_tool
        names = ("list_files", "read_file", "write_file", "patch_file", "run_focused_tests") if writable else ("list_files", "read_file", "run_focused_tests")
        names = (*names, "read_range")
        wrapped = []
        for name in names:
            impl = getattr(self, name)
            @wraps(impl)
            async def call(*args: Any, _impl: Any = impl, **kwargs: Any) -> Any:
                return _impl(*args, **kwargs)
            call.__signature__ = inspect.signature(impl)
            wrapped.append(function_tool(call, name_override=name))
        return wrapped


def run_phase(store: DurableRunStore, phase: str, attempt: int, agent: Any, content: str, max_turns: int) -> Any:
    phase_row = store.start_phase(phase, attempt, {"input": content, "maxTurns": max_turns}, max_turns)
    if phase_row["status"] == "completed":
        from types import SimpleNamespace
        result = json.loads(phase_row["output_json"])
        return SimpleNamespace(final_output=result["finalOutput"], new_items=[])
    session = SQLiteSession(phase_row["phase_id"], db_path=store.evidence_dir / "agents-sessions.sqlite3")
    async def invoke():
        checkpoint = json.loads(phase_row["checkpoint_json"]) if phase_row.get("checkpoint_json") else None
        run_input = await RunState.from_json(agent, checkpoint) if checkpoint else content
        streamed = Runner.run_streamed(agent, run_input, max_turns=max_turns, session=session)
        async for _ in streamed.stream_events():
            store.save_checkpoint(phase_row["phase_id"], streamed.to_state().to_json())
        output = {"finalOutput": streamed.final_output, "lastResponseId": streamed.last_response_id}
        store.complete_phase(phase_row["phase_id"], output)
        return streamed
    try:
        import asyncio
        return asyncio.run(invoke())
    finally:
        session.close()


def main() -> int:
    import argparse, uuid
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default=str(uuid.uuid4()))
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    evidence = Path(__file__).resolve().parent / "evidence" / f"spec038-cost-by-skill-{args.run_id}"
    state = {"schema": "agents-sdk-spec-workunit.v1", "runId": args.run_id,
             "mode": "AGENTS_SDK_CODEX_SUBSCRIPTION_EXPERIMENT", "specId": "SPEC-038",
             "workUnit": "SPEC038_CONTENT_COST_BY_SKILL", "requirementId": "REQ-028588461FFC",
             "sourceRevision": subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, capture_output=True, check=True).stdout.strip(),
             "workspace": str(ROOT), "createdAt": now(), "status": "running", "modelReceipts": []}
    store = DurableRunStore(evidence, run_id=args.run_id, initial_state=None if args.resume else state, resume=args.resume)
    state = store.state
    def receipt(item: dict[str, Any]) -> None:
        if all(row.get("turnId") != item.get("turnId") for row in state.setdefault("modelReceipts", [])):
            state["modelReceipts"].append(item)
        store.commit_state()
    goal = ("Implement SPEC-038 REQ-028588461FFC: the admin content quality dashboard must show meaningful token cost per content-producing skill. "
            "Inspect existing contracts and source, identify the real attribution root cause, plan a minimal migration-safe change, implement it, "
            "add focused regression tests, run the supplied tests, diagnose and repair failures. Do not edit any file outside the exposed allowlist, "
            "do not execute migrations or access a database. Return JSON plan {task_instruction,acceptance}.")
    context = task_source_context()
    plan_tools = ScopedRepoTools(store, "planning", False)
    plan_agent = make_agent("planner", "Inspect and plan only. Return JSON {task_instruction:string, acceptance:string[]}; do not write code.", plan_tools,
                            receipt, plan_tools.tools(False), store, store.phase_id("planning"))
    plan_result = run_phase(store, "planning", 0, plan_agent, json.dumps({"goal": goal, "verified_source_context": context}, ensure_ascii=False), 8)
    plan = parse_result_json(plan_result.final_output)
    state["plan"] = plan
    store.commit_state()
    acceptance = False
    for attempt in range(1, 4):
        before_hashes = source_hashes()
        tools = ScopedRepoTools(store, f"implementation-{attempt}", True)
        agent = make_agent("implementer", "You are the implementation agent, not another planner. The dashboard previously grouped all skill usage under requestType='skill'. Existing apiAuditEvents skillSlug is NOT proven for ordinary skill calls; inspect llmRouter.ts and skillModelFallback.ts. Ensure the current source carries nullable skillSlug through actual callers/logRequest, writes requestType='skill', groups cost by skillSlug, preserves legacy rows as unknown, and includes regression tests. If a slice is already implemented, avoid reformatting it; verify it through the focused test tool and report the exact evidence. Implement any remaining gap using only supplied tools. Use the scoped patch tool for large files and do not submit repeated insertion hunks. Do not execute migrations or access any database.", tools,
                           receipt, tools.tools(True), store, store.phase_id("implementation", attempt))
        try:
            result = run_phase(store, "implementation", attempt, agent, json.dumps({"goal":goal,"plan":plan,"verified_source_context":context,"prior_attempts":state.get("attempts",[])}, ensure_ascii=False), 30)
        except Exception as exc:
            state.setdefault("attempts", []).append({"attempt": attempt, "status": "agent_phase_failed", "error": f"{type(exc).__name__}: {exc}"})
            store.commit_state()
            continue
        test_tools = ScopedRepoTools(store, f"verification-{attempt}", False)
        test_receipt = json.loads(test_tools.run_focused_tests())
        after_hashes = source_hashes()
        changed_paths = sorted(path for path in set(before_hashes) | set(after_hashes) if before_hashes.get(path) != after_hashes.get(path))
        test_receipt["changedPaths"] = changed_paths
        test_receipt["sourceBefore"] = before_hashes
        test_receipt["sourceAfter"] = after_hashes
        state.setdefault("attempts", []).append({"attempt":attempt,"output":str(result.final_output),"testReceipt":test_receipt})
        store.commit_state()
        if test_receipt["exitCode"] != 0:
            continue
        review_tools = ScopedRepoTools(store, f"review-{attempt}", False)
        review = make_agent(f"independent_reviewer_{attempt}", "Independently inspect source/tests and the actual test receipt. Return JSON {complete:boolean,findings:string[],evidence:string[]}; read-only.", review_tools,
                            receipt, review_tools.tools(False), store, store.phase_id("review", attempt))
        snapshot = {path: (ROOT / path).read_text(encoding="utf-8")[:45000] for path in FILES if (ROOT / path).is_file()}
        for path, bounds in (("apps/web/server/services/llmRouter.ts", (855, 920)), ("apps/web/server/services/skillModelFallback.ts", (145, 185)), ("apps/web/server/services/costTracker.ts", (1, 55))):
            lines = (ROOT / path).read_text(encoding="utf-8").splitlines()
            snapshot[path] = "\n".join(f"{idx+1}: {lines[idx]}" for idx in range(bounds[0]-1, min(bounds[1], len(lines))))
        reviewed = parse_result_json(run_phase(store,"review",attempt,review,json.dumps({"goal":goal,"source_snapshot":snapshot,"test_receipt":test_receipt,"requirement":"REQ-028588461FFC"}),8).final_output)
        state.setdefault("reviews", []).append(reviewed)
        store.commit_state()
        if reviewed.get("complete") and not reviewed.get("findings"):
            verifier = make_agent(f"independent_final_verifier_{attempt}", "Verify requirement, source, migration safety, tests and reviewer evidence independently. Return JSON {complete:boolean,findings:string[],evidence:string[]}. Read-only.", review_tools,
                                  receipt, review_tools.tools(False), store, store.phase_id("verification", attempt))
            verified = parse_result_json(run_phase(store,"verification",attempt,verifier,json.dumps({"goal":goal,"review":reviewed,"test":test_receipt,"source_snapshot":snapshot}),6).final_output)
            state["verification"] = verified
            acceptance = bool(verified.get("complete") and not verified.get("findings"))
            store.commit_state()
            if acceptance: break
    pending = store.pending_tool_receipts()
    state["pendingToolReceiptCount"] = len(pending)
    if pending:
        acceptance = False
        state["receiptSettlementError"] = "Unresolved scoped tool intents remain"
    state["status"] = "completed" if acceptance else "retry_exhausted"
    state["finishedAt"] = now()
    state["durationMs"] = round((time.time() - __import__("datetime").datetime.fromisoformat(state["createdAt"]).timestamp()) * 1000)
    state["codexTurnCount"] = len(state.get("modelReceipts", []))
    state["subscriptionTokenUsage"] = {k:sum(int(((r.get("usage") or {}).get("last") or {}).get(k,0)) for r in state.get("modelReceipts",[])) for k in ("inputTokens","outputTokens","totalTokens","cachedInputTokens")}
    store.finish_run(acceptance); store.commit_state()
    print(json.dumps(state,ensure_ascii=False,indent=2)); store.close()
    return 0 if acceptance else 1


if __name__ == "__main__":
    set_tracing_disabled(True)
    raise SystemExit(main())
