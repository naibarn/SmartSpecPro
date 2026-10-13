from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import urlopen

from agents import Agent, Runner, function_tool, set_tracing_disabled

from codex_model import CodexSubscriptionModel


HERE = Path(__file__).resolve().parent
ACCEPTANCE_TEST = HERE / "harness" / "hidden_acceptance.test.mjs"
BROWSER_UAT = HERE / "harness" / "browser_uat.cjs"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    ):
        self.workspace = workspace.resolve()
        self.state = state
        self.writable = writable
        self.save_state = save_state or (lambda: None)

    def _record_tool(self, record: dict[str, Any]) -> None:
        self.state.setdefault("toolInvocations", []).append(record)
        self.save_state()

    def list_files(self) -> list[str]:
        """List files in the disposable app workspace, without reading their contents."""
        self._record_tool({"tool": "list_files", "at": now()})
        return sorted(
            str(relative)
            for path in self.workspace.rglob("*")
            if path.is_file()
            for relative in [path.relative_to(self.workspace)]
            if relative.parts[0] != "evidence"
        )

    def read_file(self, relative_path: str) -> str:
        """Read a UTF-8 text file using a path relative to the disposable app workspace."""
        target = ensure_inside(self.workspace, relative_path)
        if not target.is_file():
            raise FileNotFoundError(relative_path)
        self._record_tool({"tool": "read_file", "path": relative_path, "at": now()})
        return target.read_text(encoding="utf-8")[:50000]

    def write_file(self, relative_path: str, content: str) -> str:
        """Write a UTF-8 text file inside the disposable app workspace. No deletes or external paths."""
        if not self.writable:
            raise PermissionError("This reviewer/verifier has read-only workspace tools")
        target = ensure_inside(self.workspace, relative_path)
        if len(content.encode("utf-8")) > 100000:
            raise ValueError("File exceeds 100 KB limit")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        self._record_tool({"tool": "write_file", "path": relative_path, "at": now()})
        return f"Wrote {relative_path} ({len(content)} characters)"

    def run_focused_tests(self) -> str:
        """Run visible Node tests plus the hidden acceptance tests. Returns real stdout/stderr."""
        visible = sorted(str(path) for path in self.workspace.glob("*.test.mjs"))
        env = os.environ.copy()
        env["MINIAPP_WORKSPACE"] = str(self.workspace)
        output = run_command(["node", "--test", *visible, str(ACCEPTANCE_TEST)], cwd=self.workspace, env=env)
        self._record_tool({"tool": "run_focused_tests", "at": now()})
        self.state.setdefault("checkReceipts", []).append({"kind": "node_tests", **output, "at": now()})
        self.save_state()
        return json.dumps(output, ensure_ascii=False)

    def run_browser_uat(self) -> str:
        """Start an isolated loopback server and run real Chromium Playwright interactions and screenshot capture."""
        self._record_tool({"tool": "run_browser_uat", "at": now()})
        receipt = run_browser_uat(self.workspace)
        self.state.setdefault("browserReceipts", []).append(receipt)
        self.save_state()
        return json.dumps(receipt, ensure_ascii=False)

    def tools(self, *names: str) -> list[Any]:
        """Expose bound implementations as schema-clean Agents SDK function tools."""
        return [function_tool(getattr(self, name), name_override=name) for name in names]


def run_browser_uat(workspace: Path) -> dict[str, Any]:
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
    receipt_path = evidence_dir / "browser-uat.json"
    env = os.environ.copy()
    env.update({
        "MINIAPP_URL": f"http://127.0.0.1:{port}/",
        "BROWSER_UAT_RECEIPT": str(receipt_path),
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


def make_agent(
    role: str, instructions: str, toolbox: ToolBox,
    on_receipt: Any, tools: list[Any],
) -> Agent:
    codex_workdir = Path(os.getenv("TMPDIR", "/tmp")).resolve()
    model = CodexSubscriptionModel(codex_cwd=codex_workdir, role=role, on_receipt=on_receipt)
    return Agent(name=role.replace("_", " ").title(), instructions=instructions, model=model, tools=tools)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--goal", default=(
        "Build a self-contained, offline SplitFair Mini App for splitting a bill. Use only local assets; "
        "do not request fonts, scripts, APIs, or other resources from external hosts. Enter a dollar amount and "
        "number of people, calculate whole-cent shares that reconcile exactly to the total, show each "
        "person's share, validate invalid input, and make Reset clear the results. Keep allocateShares "
        "in split.mjs and add visible tests. Browser interaction uses labeled amount/people fields, a submit "
        "button, and a reset button; the results section exposes the rendered per-person amounts."
    ))
    parser.add_argument("--max-attempts", type=int, default=2)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    if args.max_attempts < 1 or args.max_attempts > 3:
        parser.error("--max-attempts must be from 1 to 3")
    set_tracing_disabled(True)
    seed_workspace(workspace)
    state: dict[str, Any] = {
        "schema": "agents-sdk-codex-subscription.v1",
        "runId": str(uuid.uuid4()),
        "mode": "AGENTS_SDK_CODEX_SUBSCRIPTION_EXPERIMENT",
        "goal": args.goal,
        "workspace": str(workspace),
        "status": "planning",
        "createdAt": now(),
        "startedMonotonic": time.monotonic(),
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
    state_path = workspace / "evidence" / "run-state.json"
    save_json(state_path, state)

    def record_model_receipt(receipt: dict[str, Any]) -> None:
        state["modelReceipts"].append(receipt)
        save_json(state_path, state)

    def source_snapshot() -> dict[str, str]:
        result: dict[str, str] = {}
        for path in sorted(workspace.iterdir()):
            if path.is_file() and path.suffix in {".html", ".mjs", ".js", ".css"}:
                result[path.name] = path.read_text(encoding="utf-8")[:30000]
        return result

    planner_tools = ToolBox(workspace, state, writable=False, save_state=lambda: save_json(state_path, state))
    plan_agent = make_agent(
        "planner",
        "Create a concise JSON plan with keys task_instruction (string) and acceptance (array of strings). "
        "Do not implement or diagnose hidden test failures. Inspect only the file list if useful.",
        planner_tools,
        record_model_receipt,
        planner_tools.tools("list_files"),
    )
    plan_result = Runner.run_sync(plan_agent, args.goal, max_turns=4)
    plan = parse_result_json(plan_result.final_output)
    if not isinstance(plan.get("task_instruction"), str) or not isinstance(plan.get("acceptance"), list):
        raise ValueError("Planner output did not satisfy the task plan contract")
    state["plan"] = plan
    state["plannerItems"] = [str(getattr(item, "type", type(item).__name__)) for item in plan_result.new_items]
    state["status"] = "implementing"
    save_json(state_path, state)

    accepted = False
    last_findings: list[str] = []
    for attempt_number in range(1, args.max_attempts + 1):
        toolbox = ToolBox(workspace, state, writable=True, save_state=lambda: save_json(state_path, state))
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
        )
        start = time.monotonic()
        try:
            result = Runner.run_sync(implementer, args.goal, max_turns=12)
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
            save_json(state_path, state)
            continue
        attempt = {
            "attempt": attempt_number,
            "status": "implemented",
            "durationMs": round((time.monotonic() - start) * 1000),
            "finalOutput": result.final_output,
            "newItems": [str(getattr(item, "type", type(item).__name__)) for item in result.new_items],
        }
        state["attempts"].append(attempt)
        # Harness-owned acceptance runs ensure evidence exists even if the
        # model implementation chooses to finish without invoking these tools.
        post_tools = ToolBox(workspace, state, writable=False, save_state=lambda: save_json(state_path, state))
        attempt["postImplementChecks"] = json.loads(post_tools.run_focused_tests())
        attempt["postImplementBrowserUat"] = json.loads(post_tools.run_browser_uat())
        attempt["sourceSnapshot"] = source_snapshot()
        state["status"] = "reviewing"
        save_json(state_path, state)

        review_tools = ToolBox(workspace, state, writable=False, save_state=lambda: save_json(state_path, state))
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
        )
        try:
            review_result = Runner.run_sync(
                review_agent,
                json.dumps({
                    "goal": args.goal,
                    "acceptance": plan["acceptance"],
                    "source_snapshot": attempt["sourceSnapshot"],
                    "test_receipt": attempt["postImplementChecks"],
                    "browser_receipt": attempt["postImplementBrowserUat"],
                }, ensure_ascii=False),
                max_turns=3,
            )
        except Exception as exc:
            attempt["review"] = {"complete": False, "findings": [f"Reviewer run failed: {type(exc).__name__}: {exc}"]}
            state["status"] = "retrying"
            last_findings = attempt["review"]["findings"]
            save_json(state_path, state)
            continue
        attempt["reviewFinalOutput"] = str(review_result.final_output)
        review = parse_result_json(review_result.final_output)
        attempt["review"] = review
        attempt["reviewItems"] = [str(getattr(item, "type", type(item).__name__)) for item in review_result.new_items]
        save_json(state_path, state)
        if review.get("complete") is True and not review.get("findings"):
            verifier_tools = ToolBox(workspace, state, writable=False, save_state=lambda: save_json(state_path, state))
            verifier = make_agent(
                f"independent_final_verifier_{attempt_number}",
                "You are a fresh independent final verifier. Validate the supplied current source snapshot and "
                "actual test/browser receipts against every acceptance criterion. The receipts are harness evidence; "
                "do not claim tools are unavailable or invent new results. Do not edit files. Return only JSON "
                "{complete:boolean, findings:string[], evidence:string[]}.",
                verifier_tools,
                record_model_receipt,
                [],
            )
            try:
                verify_result = Runner.run_sync(
                    verifier,
                    json.dumps({
                        "goal": args.goal,
                        "acceptance": plan["acceptance"],
                        "source_snapshot": attempt["sourceSnapshot"],
                        "test_receipt": attempt["postImplementChecks"],
                        "browser_receipt": attempt["postImplementBrowserUat"],
                        "independent_review": review,
                    }, ensure_ascii=False),
                    max_turns=3,
                )
            except Exception as exc:
                attempt["verification"] = {
                    "complete": False,
                    "findings": [f"Final verification run failed: {type(exc).__name__}: {exc}"],
                }
                last_findings = attempt["verification"]["findings"]
                save_json(state_path, state)
                continue
            attempt["verificationFinalOutput"] = str(verify_result.final_output)
            verification = parse_result_json(verify_result.final_output)
            attempt["verification"] = verification
            attempt["verificationItems"] = [str(getattr(item, "type", type(item).__name__)) for item in verify_result.new_items]
            save_json(state_path, state)
            if verification.get("complete") is True and not verification.get("findings"):
                accepted = True
                break
            last_findings = [str(item) for item in verification.get("findings", [])]
            continue
        last_findings = [str(item) for item in review.get("findings", [])]

    state["status"] = "completed" if accepted else "retry_exhausted"
    state["humanInterventions"] = 0
    state["finishedAt"] = now()
    state["durationMs"] = round((time.monotonic() - state.pop("startedMonotonic")) * 1000)
    usage_totals = {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "cachedInputTokens": 0}
    for receipt in state["modelReceipts"]:
        last = (receipt.get("usage") or {}).get("last") or {}
        usage_totals["inputTokens"] += int(last.get("inputTokens", 0))
        usage_totals["outputTokens"] += int(last.get("outputTokens", 0))
        usage_totals["totalTokens"] += int(last.get("totalTokens", 0))
        usage_totals["cachedInputTokens"] += int(last.get("cachedInputTokens", 0))
    state["subscriptionTokenUsage"] = usage_totals
    state["codexTurnCount"] = len(state["modelReceipts"])
    state["toolInvocationCount"] = len(state["toolInvocations"])
    state["files"] = sorted(str(path.relative_to(workspace)) for path in workspace.rglob("*") if path.is_file())
    save_json(state_path, state)
    print(json.dumps(state, ensure_ascii=False, indent=2))
    return 0 if accepted else 1


if __name__ == "__main__":
    raise SystemExit(main())
