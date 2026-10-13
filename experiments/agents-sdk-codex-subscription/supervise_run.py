"""Small subprocess harness for demonstrating process crash and automatic resume."""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from durable_store import DurableRunStore


HERE = Path(__file__).resolve().parent


def write_recovery_receipt(evidence: Path, logs: Path, *, run_id: str | None, restarts: int,
                           started: float, crash_at: str, supervisor_result: str,
                           reason: str | None = None, return_code: int | None = None) -> dict[str, Any]:
    state_path = evidence / "run-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.is_file() else {}
    receipt = {
        "schema": "agents-sdk-crash-recovery.v1",
        "runId": run_id,
        "status": state.get("status", "UNVERIFIED"),
        "supervisorResult": supervisor_result,
        "reason": reason,
        "returnCode": return_code,
        "restartCount": restarts,
        "processCount": restarts + 1,
        "durationMs": round((time.monotonic() - started) * 1000),
        "faultBoundaries": crash_at.split(","),
        "faultsConsumed": state.get("crashConsumed", []),
        "eventCount": state.get("eventCount"),
        "humanInterventions": state.get("humanInterventions"),
        "statePath": str(state_path),
        "eventsPath": str(evidence / "events.jsonl"),
        "processLogs": str(logs),
    }
    receipt_path = evidence / "recovery-receipt.json"
    temp_path = receipt_path.with_suffix(".json.tmp")
    temp_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(receipt_path)
    return receipt


def record_operator_signal(evidence: Path, run_id: str, signum: int) -> None:
    """Persist an actual operator signal; intervention totals are event-derived."""
    with DurableRunStore(evidence, run_id=run_id, resume=True, count_restart=False) as store:
        store.event(
            "human.intervention.signal_received",
            {"signal": signal.Signals(signum).name},
            stable_key=f"human.intervention.signal:{signum}:{store.count_events()}" if hasattr(store, "count_events") else f"human.intervention.signal:{signum}:{len(store.state.get('lifecycleEvents', []))}",
            actor="human",
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--spec-contract", type=Path, help="Resume a validated SPEC WorkUnit with the existing Agents SDK runner")
    parser.add_argument("--evidence-dir", type=Path, help="Durable run state directory; required with --spec-contract")
    parser.add_argument("--run-id", help="Stable run identity; generated once by the supervisor when omitted")
    parser.add_argument("--crash-at", default="model.after_receipt,model.after_turn_created_before_receipt,tool.write_file.after_effect,browser.after_receipt,verification.after_phase_complete")
    parser.add_argument("--max-restarts", type=int, default=8)
    parser.add_argument("--max-attempts", type=int, default=2)
    parser.add_argument("--implementation-max-turns", type=int, default=12)
    args = parser.parse_args()
    if not 0 <= args.max_restarts <= 12:
        parser.error("--max-restarts must be from 0 to 12")
    workspace = args.workspace.resolve()
    if args.spec_contract and not args.evidence_dir:
        parser.error("--evidence-dir is required with --spec-contract")
    if not args.spec_contract and args.evidence_dir:
        parser.error("--evidence-dir is only supported with --spec-contract")
    evidence = args.evidence_dir.resolve() if args.evidence_dir else workspace / "evidence"
    logs = evidence / "process-logs"
    existing_state = evidence / "run-state.json"
    run_id = args.run_id or (json.loads(existing_state.read_text(encoding="utf-8")).get("runId") if existing_state.is_file() else None) or str(uuid.uuid4())
    restarts = 0
    started = time.monotonic()
    operator_signals: list[int] = []
    def receive_operator_signal(signum: int, _frame: Any) -> None:
        if signum not in operator_signals:
            operator_signals.append(signum)
    prior_handlers = {sig: signal.signal(sig, receive_operator_signal) for sig in (signal.SIGINT, signal.SIGTERM)}
    while True:
        if args.spec_contract:
            command = [sys.executable, str(HERE / "run_spec_workunit.py"), "--workspace", str(workspace),
                       "--contract", str(args.spec_contract.resolve()), "--evidence-dir", str(evidence), "--run-id", run_id]
        else:
            command = [sys.executable, str(HERE / "run_experiment.py"), "--workspace", str(workspace), "--max-attempts", str(args.max_attempts), "--implementation-max-turns", str(args.implementation_max_turns), "--run-id", run_id]
        if existing_state.is_file():
            command += ["--resume"]
        env = os.environ.copy()
        env["AUTONOMY_CRASH_AT"] = args.crash_at
        result = subprocess.run(command, cwd=HERE, env=env, text=True, capture_output=True, check=False)
        logs.mkdir(parents=True, exist_ok=True)
        (logs / f"process-{restarts + 1:02d}.json").write_text(json.dumps({
            "command": command,
            "returnCode": result.returncode,
            "stdout": result.stdout[-30000:],
            "stderr": result.stderr[-12000:],
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if not run_id and (evidence / "run-state.json").is_file():
            run_id = json.loads((evidence / "run-state.json").read_text(encoding="utf-8"))["runId"]
        for signum in operator_signals:
            if existing_state.is_file():
                record_operator_signal(evidence, run_id, signum)
            receipt = write_recovery_receipt(
                evidence, logs, run_id=run_id, restarts=restarts, started=started,
                crash_at=args.crash_at, supervisor_result="INTERRUPTED",
                reason=f"operator signal {signal.Signals(signum).name}", return_code=128 + signum,
            )
            for sig, handler in prior_handlers.items():
                signal.signal(sig, handler)
            print(json.dumps(receipt, ensure_ascii=False, indent=2))
            return 128 + signum
        if result.returncode == 0:
            break
        recoverable_partial_exit = False
        if result.returncode == 1 and (evidence / "run-state.json").is_file():
            failed_state = json.loads((evidence / "run-state.json").read_text(encoding="utf-8"))
            recoverable_partial_exit = failed_state.get("status") not in {"completed", "retry_exhausted"}
        if result.returncode >= 0 and result.returncode != 75 and not recoverable_partial_exit:
            receipt = write_recovery_receipt(
                evidence, logs, run_id=run_id, restarts=restarts, started=started,
                crash_at=args.crash_at, supervisor_result="FAILED",
                reason=f"terminal nonrecoverable run failure (exit {result.returncode})",
                return_code=result.returncode,
            )
            print(json.dumps(receipt, indent=2))
            return result.returncode or 1
        if restarts >= args.max_restarts or not run_id:
            receipt = write_recovery_receipt(
                evidence, logs, run_id=run_id, restarts=restarts, started=started,
                crash_at=args.crash_at, supervisor_result="FAILED", reason="restart limit reached or run ID unavailable",
                return_code=result.returncode,
            )
            print(json.dumps(receipt, indent=2))
            return result.returncode or 1
        restarts += 1
        # The prior process has exited and released its run lock. This recovery
        # record is durable before any resumed worker is launched.
        with DurableRunStore(evidence, run_id=run_id, resume=True, count_restart=False) as store:
            store.event("supervisor.restart_scheduled", {"restart": restarts, "priorReturnCode": result.returncode}, stable_key=f"supervisor:restart:{restarts}")
    state = json.loads((evidence / "run-state.json").read_text(encoding="utf-8"))
    state_status = state.get("status")
    supervisor_result = {"completed": "COMPLETED", "awaiting_browser_uat": "AWAITING_BROWSER_UAT"}.get(state_status, "FAILED")
    receipt = write_recovery_receipt(
        evidence, logs, run_id=run_id, restarts=restarts, started=started,
        crash_at=args.crash_at, supervisor_result=supervisor_result,
    )
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    return 0 if state_status in {"completed", "awaiting_browser_uat"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
