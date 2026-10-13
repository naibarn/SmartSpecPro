"""SPEC WorkUnit entry point reusing the durable Agents SDK/Codex runtime.

This deliberately exposes a fixed repository allowlist and one fixed focused
test command; model output never becomes shell input.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from agents import Runner, SQLiteSession, set_tracing_disabled
from agents.exceptions import MaxTurnsExceeded
from agents.run_state import RunState

from durable_store import DurableRunStore
from run_experiment import make_agent, maybe_crash, now, parse_result_json
from spec_workunit_contract import WorkUnitContract, load_contract

EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]

def source_hashes(contract: WorkUnitContract) -> dict[str, str]:
    return {p: hashlib.sha256((contract.root / p).read_bytes()).hexdigest() for p in contract.allowed_files if (contract.root / p).is_file()}

def task_source_context(contract: WorkUnitContract) -> dict[str, str]:
    """Capture bounded context ranges declared by the trusted WorkUnit contract."""
    windows = contract.raw.get("contextRanges", {})
    result = {}
    remaining_chars = 24000
    for path, spans in windows.items():
        if path not in contract.allowed_files or not isinstance(spans, list):
            raise ValueError("contextRanges must reference allowlisted files and line spans")
        lines = (contract.root / path).read_text(encoding="utf-8").splitlines()
        chunks = []
        for span in spans:
            if not isinstance(span, list) or len(span) != 2:
                raise ValueError("each context range must be [startLine, endLine]")
            start, end = span
            if type(start) is not int or type(end) is not int or start < 1 or end < start or end - start > 300:
                raise ValueError("context ranges are limited to 301 lines")
            chunk = "\n".join(f"{i}: {lines[i-1]}" for i in range(start, min(end, len(lines)) + 1))
            chunk = chunk[:remaining_chars]
            remaining_chars -= len(chunk)
            if chunk:
                chunks.append(chunk)
            if remaining_chars <= 0:
                break
        result[path] = "\n\n".join(chunks)
        if remaining_chars <= 0:
            break
    return result


class ScopedRepoTools:
    def __init__(self, store: DurableRunStore, phase_id: str, writable: bool, contract: WorkUnitContract):
        self.store, self.phase_id, self.writable = store, phase_id, writable
        self.contract = contract
        self.root = contract.root

    def _path(self, path: str) -> Path:
        if path not in self.contract.allowed_files:
            raise PermissionError("Path is outside this validated WorkUnit allowlist")
        target = (self.root / path).resolve()
        if target == self.root or self.root not in target.parents:
            raise PermissionError("Path resolves outside the selected task worktree")
        return target

    def list_files(self) -> list[str]:
        """List only files named by the validated WorkUnit contract."""
        return [p for p in self.contract.allowed_files if self._path(p).is_file()]

    def read_file(self, path: str) -> str:
        """Read an allowlisted source file. This tool is read-only."""
        target = self._path(path)
        return target.read_text(encoding="utf-8")[:20000] if target.exists() else "<file does not exist>"

    def read_range(self, path: str, start_line: int, end_line: int) -> str:
        """Read at most 300 lines from an allowlisted file; read-only source inspection."""
        target = self._path(path)
        if start_line < 1 or end_line < start_line or end_line - start_line > 300:
            raise ValueError("Read range must be at most 300 lines")
        lines = target.read_text(encoding="utf-8").splitlines()
        return "\n".join(f"{i}: {lines[i-1]}" for i in range(start_line, min(end_line, len(lines)) + 1))

    def write_file(self, path: str, content: str) -> str:
        """Write an allowlisted small source/test/migration file inside this task worktree. This is an authorized host-executed write; never use shell writes."""
        if not self.writable:
            raise PermissionError("Review tools are read-only")
        target = self._path(path)
        if path in set(self.contract.raw.get("patchableFiles", [])) and target.exists():
            raise PermissionError("This large/structured file requires the scoped patch_file tool")
        if len(content.encode()) > 100000:
            raise ValueError("File exceeds 100 KB limit")
        if path not in self.contract.writable_files:
            raise PermissionError("Path is not writable under this WorkUnit contract")
        value = {"path": path, "content": content, **self.contract.binding}
        operation_id = str(uuid.uuid5(uuid.UUID(self.store.run_id), f"tool:{self.phase_id}:write_file:{hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()}"))
        receipt = self.store.begin_tool(operation_id, self.phase_id, "write_file", value)
        if receipt["status"] == "completed":
            return json.loads(receipt["result_json"])["message"]
        target.parent.mkdir(parents=True, exist_ok=True)
        raw = content.encode()
        sha = hashlib.sha256(raw).hexdigest()
        if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == sha:
            message = f"Reconciled existing {path}; sha256={sha}"
            self.store.complete_tool(operation_id, {"message": message, "sha256": sha}, effect_hash=sha, recovered=True)
            return message
        temp = target.with_name(f".{target.name}.{operation_id}.tmp")
        with temp.open("wb") as stream:
            stream.write(raw)
            stream.flush()
            __import__("os").fsync(stream.fileno())
        temp.replace(target)
        maybe_crash(self.store, "tool.write_file.after_effect", operation_id)
        message = f"Wrote {path}; sha256={sha}"
        self.store.complete_tool(operation_id, {"message": message, "sha256": sha}, effect_hash=sha)
        return message

    def patch_file(self, path: str, patch: str) -> str:
        """Apply exact-context Update File hunks; numbered hunk headers disambiguate repeated source text. Authorized host-executed write, bounded to this file; never use shell writes."""
        if not self.writable:
            raise PermissionError("Review tools are read-only")
        if path not in set(self.contract.raw.get("patchableFiles", [])) or len(patch.encode()) > 30000:
            raise PermissionError("Patch target is not authorized or patch exceeds 30 KB")
        if path not in self.contract.writable_files:
            raise PermissionError("Path is not writable under this WorkUnit contract")
        if f"*** Update File: {path}" not in patch or "../" in patch or "*** Add File:" in patch or "*** Delete File:" in patch:
            raise ValueError("Patch must use scoped Update File hunks for exactly the authorized path")
        value = {"path": path, "patch": patch, **self.contract.binding}
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

        hunks: list[tuple[int | None, list[str], list[str]]] = []
        old_lines: list[str] = []
        new_lines: list[str] = []
        in_hunk = False
        hunk_start: int | None = None
        for line in lines[2:-1]:
            if line.startswith("@@"):
                if in_hunk:
                    if not old_lines:
                        reject("Each patch hunk needs exact old context")
                        raise ValueError("Each patch hunk needs exact old context")
                    hunks.append((hunk_start, old_lines, new_lines))
                old_lines, new_lines, in_hunk = [], [], True
                header = re.match(r"^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@", line)
                hunk_start = int(header.group(1)) if header else None
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
            hunks.append((hunk_start, old_lines, new_lines))
        if not hunks:
            reject("Patch contains no update hunks")
            raise ValueError("Patch contains no update hunks")

        updated = original
        line_delta = 0
        for start_line, old_hunk, new_hunk in hunks:
            old_text, new_text = "\n".join(old_hunk), "\n".join(new_hunk)
            if old_text == new_text:
                continue
            if start_line is not None:
                target_lines = updated.splitlines()
                index = start_line - 1 + line_delta
                if index < 0 or target_lines[index:index + len(old_hunk)] != old_hunk:
                    message = f"Numbered patch context did not match at line {start_line}; refresh source and retry"
                    reject(message)
                    raise ValueError(message)
                target_lines[index:index + len(old_hunk)] = new_hunk
                line_delta += len(new_hunk) - len(old_hunk)
                updated = "\n".join(target_lines) + ("\n" if original.endswith("\n") else "")
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
            maybe_crash(self.store, "tool.patch_file.after_effect", op)
            message = f"Applied scoped patch to {path}"
        self.store.complete_tool(op, {"message": message, "path": path}, effect_hash=hashlib.sha256(patch.encode()).hexdigest(), recovered="Reconciled" in message)
        return message

    def run_focused_tests(self) -> str:
        """Run only the WorkUnit's predeclared tests; no model-provided command is executed."""
        revision = hashlib.sha256("".join(hashlib.sha256(self._path(p).read_bytes()).hexdigest() for p in self.contract.allowed_files if self._path(p).is_file()).encode()).hexdigest()
        command = self.contract.test_command
        value = {"revision": revision, "command": command, **self.contract.binding}
        operation_id = str(uuid.uuid5(uuid.UUID(self.store.run_id), f"tool:{self.phase_id}:run_focused_tests:{hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()}"))
        cached = self.store.begin_tool(operation_id, self.phase_id, "run_focused_tests", value)
        if cached["status"] == "completed":
            return cached["result_json"]
        missing_paths = [path for path in self.contract.test_paths if not (self.root / path).is_file()]
        if missing_paths:
            receipt = {"command": command, "revision": revision, "databaseMode": self.contract.database_mode,
                       **self.contract.binding, "exitCode": 2, "missingTestPaths": missing_paths,
                       "stdout": "", "stderr": "Required test files are missing; no tests were run.",
                       "durationMs": 0, "recordedAt": now()}
            self.store.complete_tool(operation_id, receipt, effect_hash=revision)
            return json.dumps(receipt)
        started = time.monotonic()
        env = os.environ.copy()
        if self.contract.database_mode == "isolated_local":
            database_url = env.get("DATABASE_URL", "")
            parsed = urlsplit(database_url)
            database_name = parsed.path.removeprefix("/")
            if (
                parsed.scheme not in {"postgres", "postgresql"}
                or parsed.hostname not in {"localhost", "127.0.0.1"}
                or not 55400 <= (parsed.port or 0) <= 55999
                or not database_name.startswith(f"{self.contract.spec_id.lower().replace('-', '')}_")
                or not database_name.endswith("_test")
                or parsed.password not in {None, ""}
            ):
                raise RuntimeError("isolated_local tests require a disposable localhost test database on the isolated port range")
            env["RUN_DB_INTEGRATION_TESTS"] = "true"
        else:
            env["RUN_DB_INTEGRATION_TESTS"] = "false"
        result = subprocess.run(command, cwd=self.root, env=env, text=True, capture_output=True, timeout=240, check=False)
        maybe_crash(self.store, "tool.run_focused_tests.after_effect", operation_id)
        database_url = env.get("DATABASE_URL", "")
        stdout = result.stdout.replace(database_url, "[REDACTED_DATABASE_URL]") if database_url else result.stdout
        stderr = result.stderr.replace(database_url, "[REDACTED_DATABASE_URL]") if database_url else result.stderr
        stdout = re.sub(r"postgres(?:ql)?://[^\s]+", "[REDACTED_DATABASE_URL]", stdout)
        stderr = re.sub(r"postgres(?:ql)?://[^\s]+", "[REDACTED_DATABASE_URL]", stderr)
        receipt = {"command": command, "revision": revision, "databaseMode": self.contract.database_mode, **self.contract.binding, "exitCode": result.returncode,
                   "stdout": stdout[-12000:], "stderr": stderr[-12000:],
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

    @property
    def contract(self) -> WorkUnitContract:
        return self._contract

    @contract.setter
    def contract(self, value: WorkUnitContract) -> None:
        self._contract = value

    @property
    def binding(self) -> dict[str, str]:
        return self.contract.binding


def run_phase(store: DurableRunStore, phase: str, attempt: int, agent: Any, content: str, max_turns: int) -> Any:
    phase_id = store.phase_id(phase, attempt)
    existing = store.get_phase(phase_id)
    if existing and existing.get("status") == "completed":
        from types import SimpleNamespace
        result = json.loads(existing["output_json"])
        return SimpleNamespace(final_output=result["finalOutput"], new_items=[])
    phase_input = {"input": content, "maxTurns": max_turns}
    if existing:
        # Source snapshots can legitimately change after an implementation
        # tool runs. A resumed running phase must keep its originally persisted
        # prompt instead of rebinding the same phase ID to mutated source.
        phase_input = json.loads(existing["input_json"])
        content = phase_input["input"]
        max_turns = int(phase_input["maxTurns"])
    phase_row = store.start_phase(phase, attempt, phase_input, max_turns)
    if phase_row["status"] == "completed":
        from types import SimpleNamespace
        result = json.loads(phase_row["output_json"])
        return SimpleNamespace(final_output=result["finalOutput"], new_items=[])
    session = SQLiteSession(phase_row["phase_id"], db_path=store.evidence_dir / "agents-sessions.sqlite3")
    async def invoke():
        checkpoint = json.loads(phase_row["checkpoint_json"]) if phase_row.get("checkpoint_json") else None
        # A resumed snapshot may already be at the original turn limit. Give
        # that same phase/thread one bounded continuation window; never create
        # a new phase merely because the SDK raised MaxTurnsExceeded.
        turn_limit = max_turns * 2 if checkpoint else max_turns
        if checkpoint and int(checkpoint.get("max_turns", 0)) < turn_limit:
            # Runner.run_streamed deliberately restores max_turns from a
            # supplied RunState, overriding its keyword argument. Persist the
            # bounded continuation budget in the official SDK snapshot.
            checkpoint = {**checkpoint, "max_turns": turn_limit}
            store.save_checkpoint(phase_row["phase_id"], checkpoint)
        run_input = await RunState.from_json(agent, checkpoint) if checkpoint else content
        while True:
            streamed = Runner.run_streamed(agent, run_input, max_turns=turn_limit, session=session)
            try:
                async for _ in streamed.stream_events():
                    store.save_checkpoint(phase_row["phase_id"], streamed.to_state().to_json())
            except MaxTurnsExceeded:
                if turn_limit >= max_turns * 2:
                    raise
                state_json = streamed.to_state().to_json()
                turn_limit = max_turns * 2
                state_json["max_turns"] = turn_limit
                store.save_checkpoint(phase_row["phase_id"], state_json)
                run_input = await RunState.from_json(agent, state_json)
                store.event("phase.turn_limit_continued", {
                    "phaseId": phase_row["phase_id"], "attempt": attempt,
                    "previousLimit": max_turns, "continuedLimit": turn_limit,
                }, stable_key=f"phase:{phase_row['phase_id']}:turn-limit-continuation:{turn_limit}")
                continue
            break
        output = {"finalOutput": streamed.final_output, "lastResponseId": streamed.last_response_id}
        store.complete_phase(phase_row["phase_id"], output)
        if phase == "verification":
            maybe_crash(store, "verification.after_phase_complete", phase_row["phase_id"])
        return streamed
    try:
        import asyncio
        return asyncio.run(invoke())
    finally:
        session.close()


def main() -> int:
    import argparse, uuid
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True, type=Path, help="Registered, owned task worktree")
    parser.add_argument("--contract", required=True, type=Path, help="Conductor-supplied canonical WorkUnit contract JSON")
    parser.add_argument("--evidence-dir", required=True, type=Path, help="Durable run evidence directory outside the task worktree")
    parser.add_argument("--run-id", default=str(uuid.uuid4()))
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    contract = load_contract(args.contract, args.workspace)
    evidence = args.evidence_dir.resolve()
    if contract.root == evidence or contract.root in evidence.parents:
        parser.error("--evidence-dir must be outside the owned task worktree")
    state = {"schema": "agents-sdk-spec-workunit.v1", "runId": args.run_id,
             "mode": "AGENTS_SDK_CODEX_SUBSCRIPTION_EXPERIMENT", "specId": "SPEC-038",
             **contract.binding, "contractDigest": contract.digest,
             "createdAt": now(), "status": "running", "modelReceipts": [], "operatorEvents": []}
    state["specId"] = contract.spec_id
    store = DurableRunStore(evidence, run_id=args.run_id, initial_state=None if args.resume else state, resume=args.resume)
    state = store.state
    if state.get("contractDigest") != contract.digest or state.get("workspaceId") != contract.workspace_id:
        store.close()
        raise RuntimeError("Resumed run contract/workspace binding differs from its original state")
    def receipt(item: dict[str, Any]) -> None:
        if all(row.get("turnId") != item.get("turnId") for row in state.setdefault("modelReceipts", [])):
            state["modelReceipts"].append(item)
        store.commit_state()
    goal = (f"Implement {contract.spec_id} {contract.requirement_id}: {contract.requirement_text}. "
            "First compare the complete normative requirement with the scoped acceptance criteria. If criteria cover only part, state the gap and plan only this authorized slice without claiming the requirement passes. "
            "Inspect the canonical requirement and source, identify the actual root cause, make the smallest safe implementation, add focused regressions, run the provided checks, diagnose and repair failures. "
            "Use only the registered host tools and the exact allowlist. Never use shell or model output to construct commands. No tool exposes direct database operations; test code written under the allowlist may use the fixed focused-test adapter to seed and query only the isolated localhost test database declared in this contract, with disposable fixtures/cleanup and no production/shared database access. If needed, integration tests may create only the SPEC-specific test schema in that disposable database; do not add a standalone migration runner. Never call Gateway or direct provider APIs. "
            "Acceptance criteria: " + json.dumps(contract.acceptance, ensure_ascii=False))
    context = task_source_context(contract)
    workunit_scope = {
        **contract.binding,
        "allowedFiles": contract.allowed_files,
        "writableFiles": contract.writable_files,
        "patchableFiles": tuple(contract.raw.get("patchableFiles", [])),
        "tests": contract.raw["tests"],
        "authority": contract.raw["authority"],
        "browserUat": contract.browser_uat,
        "implementationGuidance": contract.raw.get("implementationGuidance"),
        "note": "Contract-listed writable paths may be new files and can be created with write_file; list_files reports only files that already exist. These Agents SDK function tools execute in the validated host worktree regardless of the Codex runtime's visible cwd or mounted workspace. Contract validation has already authorized this exact workspace; use repository-relative paths and do not infer tool availability from Codex's own filesystem.",
    }
    plan_tools = ScopedRepoTools(store, "planning", False, contract)
    plan_agent = make_agent("planner", "You are the read-only planning phase of an authorized implementation run. Do not modify files or run tests yourself. Produce a concrete implementation and verification plan for the next phase; the read-only limit applies only to this planner, not to the authorized implementer or tests. Return JSON {task_instruction:string, acceptance:string[]}; never claim that implementation is unauthorized.", plan_tools,
                            receipt, plan_tools.tools(False), store, store.phase_id("planning"))
    plan_result = run_phase(store, "planning", 0, plan_agent, json.dumps({"goal": goal, "canonical_requirement": contract.requirement_text, "acceptanceCriteria": contract.acceptance, "workunit_scope": workunit_scope, "verified_source_context": context}, ensure_ascii=False), contract.plan_max_turns)
    plan = parse_result_json(plan_result.final_output)
    state["plan"] = plan
    store.commit_state()
    acceptance = False
    for attempt in range(1, contract.max_attempts + 1):
        before_hashes = source_hashes(contract)
        tools = ScopedRepoTools(store, f"implementation-{attempt}", True, contract)
        agent = make_agent("implementer", "This phase is explicitly authorized to implement the canonical requirement within the validated WorkUnit contract. The planner's read-only restriction applies only to the planner; treat its plan as advisory, and ignore any planner text claiming this implementation phase is unauthorized. The Python host validated and binds the exact repository root before this model call. Agents SDK function tools execute in that host worktree even when Codex's visible cwd or mounted workspace differs; do not claim tool access is unavailable based on Codex's own filesystem. Use only repository-relative paths exactly as listed. Implement the supplied canonical requirement and acceptance criteria, diagnose failures from actual test receipts, and repair within the declared WorkUnit scope. If the current source already satisfies a criterion, verify it and avoid reformatting. Use only supplied host tools; call no shell, provider, Gateway, database, or migration operations. Use patch_file for explicitly declared patchable files and include numbered hunk headers with exact surrounding context so repeated lines are unambiguous. Use write_file for new allowlisted files.", tools,
                           receipt, tools.tools(True), store, store.phase_id("implementation", attempt))
        try:
            result = run_phase(store, "implementation", attempt, agent, json.dumps({"goal":goal,"plan":plan,"canonical_requirement":contract.requirement_text,"acceptanceCriteria":contract.acceptance,"workunit_scope":workunit_scope,"verified_source_context":context,"prior_attempts":state.get("attempts",[])}, ensure_ascii=False), contract.implementation_max_turns)
        except Exception as exc:
            state.setdefault("attempts", []).append({"attempt": attempt, "status": "agent_phase_failed", "error": f"{type(exc).__name__}: {exc}"})
            store.commit_state()
            continue
        test_tools = ScopedRepoTools(store, f"verification-{attempt}", False, contract)
        test_receipt = json.loads(test_tools.run_focused_tests())
        after_hashes = source_hashes(contract)
        changed_paths = sorted(path for path in set(before_hashes) | set(after_hashes) if before_hashes.get(path) != after_hashes.get(path))
        test_receipt["changedPaths"] = changed_paths
        test_receipt["sourceBefore"] = before_hashes
        test_receipt["sourceAfter"] = after_hashes
        state.setdefault("attempts", []).append({"attempt":attempt,"output":str(result.final_output),"testReceipt":test_receipt})
        store.commit_state()
        if test_receipt["exitCode"] != 0:
            continue
        review_tools = ScopedRepoTools(store, f"review-{attempt}", False, contract)
        review = make_agent(f"independent_reviewer_{attempt}", "Independently inspect the exact normative requirement, current diff, tests and actual receipt. Decide whether the stated acceptance is complete; identify uncovered requirement language and any evidence gaps. Return JSON {complete:boolean,findings:string[],evidence:string[]}; read-only.", review_tools,
                            receipt, review_tools.tools(False), store, store.phase_id("review", attempt))
        snapshot = {path: (contract.root / path).read_text(encoding="utf-8")[:20000] for path in contract.allowed_files if (contract.root / path).is_file()}
        reviewed = parse_result_json(run_phase(store,"review",attempt,review,json.dumps({"goal":goal,"canonical_requirement":contract.requirement_text,"acceptanceCriteria":contract.acceptance,"workunit_scope":workunit_scope,"source_snapshot":snapshot,"test_receipt":test_receipt,**contract.binding}),contract.review_max_turns).final_output)
        state.setdefault("reviews", []).append(reviewed)
        store.commit_state()
        if reviewed.get("complete") and not reviewed.get("findings"):
            verifier = make_agent(f"independent_final_verifier_{attempt}", "Verify requirement, source, migration safety, tests and reviewer evidence independently. Return JSON {complete:boolean,findings:string[],evidence:string[]}. Read-only.", review_tools,
                                  receipt, review_tools.tools(False), store, store.phase_id("verification", attempt))
            verified = parse_result_json(run_phase(store,"verification",attempt,verifier,json.dumps({"goal":goal,"canonical_requirement":contract.requirement_text,"acceptanceCriteria":contract.acceptance,"workunit_scope":workunit_scope,"review":reviewed,"test":test_receipt,"source_snapshot":snapshot,**contract.binding}),contract.review_max_turns).final_output)
            state["verification"] = verified
            acceptance = bool(verified.get("complete") and not verified.get("findings"))
            store.commit_state()
            if acceptance: break
    pending = store.pending_tool_receipts()
    state["pendingToolReceiptCount"] = len(pending)
    if pending:
        acceptance = False
        state["receiptSettlementError"] = "Unresolved scoped tool intents remain"
    browser_pending = bool(contract.browser_uat and contract.browser_uat.get("status") == "configured")
    state["modelAcceptance"] = bool(acceptance)
    state["status"] = "awaiting_browser_uat" if acceptance and browser_pending else ("completed" if acceptance else "retry_exhausted")
    state["browserUat"] = {"status": "UNVERIFIED", "reason": "No authorized browser UAT adapter is configured in this WorkUnit contract"} if contract.browser_uat is None or contract.browser_uat.get("status") == "unavailable" else {"status": "PENDING", "contract": contract.browser_uat}
    state["finishedAt"] = now()
    state["durationMs"] = round((time.time() - __import__("datetime").datetime.fromisoformat(state["createdAt"]).timestamp()) * 1000)
    state["codexTurnCount"] = len(state.get("modelReceipts", []))
    state["subscriptionTokenUsage"] = {k:sum(int(((r.get("usage") or {}).get("last") or {}).get(k,0)) for r in state.get("modelReceipts",[])) for k in ("inputTokens","outputTokens","totalTokens","cachedInputTokens")}
    completed_turns = store.connection.execute(
        "SELECT COUNT(DISTINCT turn_id) FROM model_calls WHERE turn_id IS NOT NULL AND status IN ('turn_completed','completed')"
    ).fetchone()[0]
    unknown_turns = store.connection.execute(
        "SELECT COUNT(*) FROM model_calls WHERE status IN ('planned','thread_started','turn_running','turn_reconciling')"
    ).fetchone()[0]
    state["modelTurnTelemetry"] = {"completedTurns": int(completed_turns), "unknownOrUnsettledCalls": int(unknown_turns)}
    store._refresh_event_projection()
    store.finish_run(acceptance and not browser_pending, terminal_status="awaiting_browser_uat" if acceptance and browser_pending else None); store.commit_state()
    print(json.dumps(state,ensure_ascii=False,indent=2)); store.close()
    return 0 if (acceptance and not pending) or state["status"] == "awaiting_browser_uat" else 1


if __name__ == "__main__":
    set_tracing_disabled(True)
    raise SystemExit(main())
