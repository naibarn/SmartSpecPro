"""Small SQLite journal for crash-safe state around the existing Agents SDK loop."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: Any) -> str:
    raw = value if isinstance(value, bytes) else canonical_json(value).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def functional_progress_signature(progress: dict[str, Any]) -> str:
    """Hash only functional progress; another model response is not progress by itself."""
    return digest({key: value for key, value in progress.items() if key != "completedModelTurns"})


class DurableRunStore:
    """SQLite-backed phase, checkpoint, event, model-call, and tool receipt store.

    A nonblocking OS lock allows only one process to resume a run. All durable
    mutations use SQLite transactions with FULL synchronous writes. The JSON
    receipt is a projection and can be regenerated from the database.
    """

    def __init__(
        self,
        evidence_dir: Path,
        *,
        run_id: str,
        initial_state: dict[str, Any] | None = None,
        resume: bool = False,
        count_restart: bool = True,
    ) -> None:
        evidence_dir.mkdir(parents=True, exist_ok=True)
        self.evidence_dir = evidence_dir.resolve()
        self.state_path = self.evidence_dir / "run-state.json"
        self.db_path = self.evidence_dir / "runtime.sqlite3"
        self.lock_path = self.evidence_dir / "runtime.lock"
        self._lock_file = self.lock_path.open("a+")
        try:
            fcntl.flock(self._lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            self._lock_file.close()
            raise RuntimeError("This run already has an active owner; concurrent resume is denied") from exc
        self._lock_file.seek(0)
        self._lock_file.truncate()
        self._lock_file.write(f"pid={os.getpid()} run={run_id}\n")
        self._lock_file.flush()
        os.fsync(self._lock_file.fileno())

        self.connection = sqlite3.connect(self.db_path, timeout=30, isolation_level=None)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=FULL")
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.connection.execute("PRAGMA busy_timeout=30000")
        self._create_schema()
        existing = self.connection.execute("SELECT value FROM metadata WHERE key='run_id'").fetchone()
        if existing is not None and existing["value"] != run_id:
            self.close()
            raise RuntimeError("Run ID does not match durable store")
        if resume:
            row = self.connection.execute("SELECT state_json FROM projection WHERE id=1").fetchone()
            if row is None:
                self.close()
                raise FileNotFoundError("No durable run projection exists to resume")
            self.state = json.loads(row["state_json"])
            if self.state.get("runId") != run_id:
                self.close()
                raise RuntimeError("Run ID does not match persisted state")
            if count_restart:
                self.state["restartCount"] = int(self.state.get("restartCount", 0)) + 1
            if count_restart:
                self.state["status"] = "recovering"
                self.event("process.restarted", {"restartCount": self.state["restartCount"]}, stable_key=f"restart:{self.state['restartCount']}")
        else:
            if existing is not None or initial_state is None:
                self.close()
                raise FileExistsError("A durable run already exists; use --resume")
            self.connection.execute("INSERT INTO metadata(key,value) VALUES('run_id',?)", (run_id,))
            self.state = initial_state
            self._persist_projection()
            self.event("run.created", {"mode": self.state.get("mode"), "workspace": self.state.get("workspace")}, stable_key="run:created")
        self._refresh_event_projection()
        self.export()

    def _create_schema(self) -> None:
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS projection(id INTEGER PRIMARY KEY CHECK(id=1), state_json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS events(
              seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE,
              kind TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, payload_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS phases(
              phase_id TEXT PRIMARY KEY, name TEXT NOT NULL, attempt INTEGER NOT NULL,
              input_hash TEXT NOT NULL, status TEXT NOT NULL, input_json TEXT NOT NULL,
              output_json TEXT, checkpoint_json TEXT, checkpoint_hash TEXT,
              checkpoint_revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
              progress_signature TEXT, turn_limit_progress_signature TEXT,
              no_progress_segments INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS model_calls(
              call_id TEXT PRIMARY KEY, phase_id TEXT NOT NULL, role TEXT NOT NULL,
              request_hash TEXT NOT NULL, request_json TEXT NOT NULL, status TEXT NOT NULL,
              thread_id TEXT, turn_id TEXT, prior_turn_id TEXT, turn_attempt INTEGER NOT NULL DEFAULT 0,
              response_text TEXT, response_items_json TEXT NOT NULL DEFAULT '[]', selection_json TEXT,
              usage_json TEXT, receipt_json TEXT, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tool_receipts(
              operation_id TEXT PRIMARY KEY, phase_id TEXT NOT NULL, tool TEXT NOT NULL,
              input_hash TEXT NOT NULL, input_json TEXT, status TEXT NOT NULL, result_json TEXT,
              effect_hash TEXT, updated_at TEXT NOT NULL
            );
            """
        )
        tool_columns = {row["name"] for row in self.connection.execute("PRAGMA table_info(tool_receipts)")}
        if "input_json" not in tool_columns:
            self.connection.execute("ALTER TABLE tool_receipts ADD COLUMN input_json TEXT")
        model_columns = {row["name"] for row in self.connection.execute("PRAGMA table_info(model_calls)")}
        if "selection_json" not in model_columns:
            self.connection.execute("ALTER TABLE model_calls ADD COLUMN selection_json TEXT")
        if "prior_turn_id" not in model_columns:
            self.connection.execute("ALTER TABLE model_calls ADD COLUMN prior_turn_id TEXT")
        phase_columns = {row["name"] for row in self.connection.execute("PRAGMA table_info(phases)")}
        if "progress_signature" not in phase_columns:
            self.connection.execute("ALTER TABLE phases ADD COLUMN progress_signature TEXT")
        if "turn_limit_progress_signature" not in phase_columns:
            self.connection.execute("ALTER TABLE phases ADD COLUMN turn_limit_progress_signature TEXT")
        if "no_progress_segments" not in phase_columns:
            self.connection.execute("ALTER TABLE phases ADD COLUMN no_progress_segments INTEGER NOT NULL DEFAULT 0")

    @property
    def run_id(self) -> str:
        return str(self.state["runId"])

    def close(self) -> None:
        connection = getattr(self, "connection", None)
        if connection is not None:
            connection.close()
            self.connection = None
        lock_file = getattr(self, "_lock_file", None)
        if lock_file is not None and not lock_file.closed:
            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
            finally:
                lock_file.close()

    def __enter__(self) -> DurableRunStore:
        return self

    def __exit__(self, _exc_type: Any, _exc: Any, _tb: Any) -> None:
        self.export()
        self.close()

    def _event_id(self, stable_key: str | None) -> str:
        if stable_key is None:
            return str(uuid.uuid4())
        return str(uuid.uuid5(uuid.UUID(self.run_id), stable_key))

    def event(
        self,
        kind: str,
        payload: dict[str, Any],
        *,
        stable_key: str | None = None,
        actor: str = "system",
    ) -> str:
        event_id = self._event_id(stable_key)
        encoded = canonical_json(payload)
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            prior = self.connection.execute("SELECT payload_json,kind,actor FROM events WHERE event_id=?", (event_id,)).fetchone()
            if prior is not None:
                if prior["payload_json"] != encoded or prior["kind"] != kind or prior["actor"] != actor:
                    raise RuntimeError("Stable event ID was reused with different data")
            else:
                self.connection.execute(
                    "INSERT INTO events(event_id,kind,actor,at,payload_json) VALUES(?,?,?,?,?)",
                    (event_id, kind, actor, timestamp(), encoded),
                )
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.export()
        return event_id

    def phase_id(self, name: str, attempt: int = 0) -> str:
        return str(uuid.uuid5(uuid.UUID(self.run_id), f"phase:{name}:{attempt}"))

    def start_phase(self, name: str, attempt: int, phase_input: Any, max_turns: int) -> dict[str, Any]:
        phase_id = self.phase_id(name, attempt)
        encoded = canonical_json(phase_input)
        input_hash = digest(encoded.encode("utf-8"))
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute("SELECT * FROM phases WHERE phase_id=?", (phase_id,)).fetchone()
            if row is None:
                at = timestamp()
                self.connection.execute(
                    "INSERT INTO phases(phase_id,name,attempt,input_hash,status,input_json,updated_at) VALUES(?,?,?,?,?,?,?)",
                    (phase_id, name, attempt, input_hash, "running", encoded, at),
                )
                self._insert_event_in_tx("phase.started", {"phaseId": phase_id, "name": name, "attempt": attempt, "maxTurns": max_turns}, stable_key=f"phase:{phase_id}:started")
            elif row["input_hash"] != input_hash:
                raise RuntimeError("Phase input changed on resume; refusing to resume a different attempt")
            self.state.setdefault("phases", {})[phase_id] = {
                "phaseId": phase_id,
                "name": name,
                "attempt": attempt,
                "status": row["status"] if row is not None else "running",
                "inputHash": input_hash,
            }
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.export()
        return dict(self.connection.execute("SELECT * FROM phases WHERE phase_id=?", (phase_id,)).fetchone())

    def get_phase(self, phase_id: str) -> dict[str, Any] | None:
        row = self.connection.execute("SELECT * FROM phases WHERE phase_id=?", (phase_id,)).fetchone()
        return dict(row) if row else None

    def save_checkpoint(self, phase_id: str, checkpoint: dict[str, Any]) -> bool:
        encoded = canonical_json(checkpoint)
        checkpoint_hash = digest(encoded.encode("utf-8"))
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute("SELECT checkpoint_revision,checkpoint_hash FROM phases WHERE phase_id=?", (phase_id,)).fetchone()
            if row is None:
                raise KeyError(f"Unknown phase checkpoint: {phase_id}")
            if row["checkpoint_hash"] == checkpoint_hash:
                self.connection.execute("COMMIT")
                return False
            revision = int(row["checkpoint_revision"]) + 1
            phase = self.connection.execute("SELECT name,attempt FROM phases WHERE phase_id=?", (phase_id,)).fetchone()
            self.state.setdefault("phases", {}).setdefault(phase_id, {"phaseId": phase_id, "name": phase["name"], "attempt": phase["attempt"]})
            self.state["phases"][phase_id].update({"status": "running", "checkpointHash": checkpoint_hash, "checkpointRevision": revision})
            self.connection.execute(
                "UPDATE phases SET checkpoint_json=?,checkpoint_hash=?,checkpoint_revision=?,updated_at=? WHERE phase_id=?",
                (encoded, checkpoint_hash, revision, timestamp(), phase_id),
            )
            self._insert_event_in_tx(
                "agents.run_state.checkpointed",
                {"phaseId": phase_id, "revision": revision, "sha256": checkpoint_hash},
                stable_key=f"checkpoint:{phase_id}:{revision}",
            )
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.export()
        return True

    def observe_phase_progress(self, phase_id: str, progress: dict[str, Any]) -> tuple[bool, int]:
        """Persist only meaningful progress and count identical MaxTurns boundaries."""
        signature = digest(progress)
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute(
                "SELECT progress_signature,no_progress_segments FROM phases WHERE phase_id=?", (phase_id,)
            ).fetchone()
            if row is None:
                raise KeyError(f"Unknown phase progress: {phase_id}")
            prior = row["progress_signature"]
            changed = prior is None or prior != signature
            self.connection.execute(
                "UPDATE phases SET progress_signature=?,updated_at=? WHERE phase_id=?",
                (signature, timestamp(), phase_id),
            )
            if changed and prior is not None:
                self._insert_event_in_tx(
                    "phase.meaningful_progress",
                    {"phaseId": phase_id, "signature": signature, "progress": progress},
                    stable_key=f"phase:{phase_id}:progress:{signature}",
                )
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        if changed and prior is not None:
            self.export()
        return changed, 0

    def initialize_turn_limit_progress(self, phase_id: str, progress: dict[str, Any]) -> None:
        signature = functional_progress_signature(progress)
        self.connection.execute(
            "UPDATE phases SET turn_limit_progress_signature=COALESCE(turn_limit_progress_signature,?),no_progress_segments=COALESCE(no_progress_segments,0) WHERE phase_id=?",
            (signature, phase_id),
        )

    def record_no_progress_segment(self, phase_id: str, progress: dict[str, Any]) -> int:
        """Count MaxTurns boundaries lacking tool, source, or verified-test progress."""
        signature = functional_progress_signature(progress)
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute(
                "SELECT turn_limit_progress_signature,no_progress_segments FROM phases WHERE phase_id=?", (phase_id,)
            ).fetchone()
            if row is None:
                raise KeyError(f"Unknown phase progress: {phase_id}")
            changed = row["turn_limit_progress_signature"] != signature
            count = 0 if changed else int(row["no_progress_segments"] or 0) + 1
            self.connection.execute(
                "UPDATE phases SET turn_limit_progress_signature=?,no_progress_segments=?,updated_at=? WHERE phase_id=?",
                (signature, count, timestamp(), phase_id),
            )
            self._insert_event_in_tx(
                "phase.turn_limit_boundary",
                {"phaseId": phase_id, "signature": signature, "progressChanged": changed,
                 "consecutiveNoProgressSegments": count},
                stable_key=f"phase:{phase_id}:turn-limit-boundary:{signature}:{count}",
            )
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.export()
        return 0 if changed else count

    def meaningful_progress(self, source_hashes: dict[str, str] | None = None) -> dict[str, Any]:
        turns = int(self.connection.execute(
            "SELECT COUNT(DISTINCT turn_id) FROM model_calls WHERE turn_id IS NOT NULL AND status IN ('turn_completed','completed')"
        ).fetchone()[0])
        tools = int(self.connection.execute(
            "SELECT COUNT(*) FROM tool_receipts WHERE status='completed'"
        ).fetchone()[0])
        test_outcomes = []
        for item in self.state.get("iterations", []):
            if isinstance(item, dict) and isinstance(item.get("testReceipt"), dict):
                receipt = item["testReceipt"]
                browser = receipt.get("browserUat") if isinstance(receipt.get("browserUat"), dict) else {}
                test_outcomes.append({"iteration": item.get("iteration"), "exitCode": receipt.get("exitCode"),
                                      "revision": receipt.get("revision"), "browserUat": browser.get("result")})
        return {
            "completedModelTurns": turns,
            "completedToolReceipts": tools,
            "sourceHash": digest(source_hashes or {}),
            "verifiedTestOutcomes": test_outcomes,
        }

    def complete_phase(self, phase_id: str, result: dict[str, Any]) -> None:
        encoded = canonical_json(result)
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            self.connection.execute(
                "UPDATE phases SET status='completed',output_json=?,updated_at=? WHERE phase_id=?",
                (encoded, timestamp(), phase_id),
            )
            phase = self.connection.execute("SELECT name,attempt,input_hash FROM phases WHERE phase_id=?", (phase_id,)).fetchone()
            self.state.setdefault("phases", {}).setdefault(phase_id, {"phaseId": phase_id, "name": phase["name"], "attempt": phase["attempt"], "inputHash": phase["input_hash"]})
            self.state["phases"][phase_id].update({"status": "completed", "output": result})
            self._insert_event_in_tx("phase.completed", {"phaseId": phase_id, "outputHash": digest(encoded.encode())}, stable_key=f"phase:{phase_id}:completed")
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.export()

    def mark_phase_needs_replan(self, phase_id: str, *, diagnosis: str, progress: dict[str, Any]) -> None:
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute("SELECT name,attempt FROM phases WHERE phase_id=?", (phase_id,)).fetchone()
            if row is None:
                raise KeyError(f"Unknown phase: {phase_id}")
            self.connection.execute("UPDATE phases SET status='needs_replan',updated_at=? WHERE phase_id=?", (timestamp(), phase_id))
            self.state.setdefault("phases", {}).setdefault(phase_id, {"phaseId": phase_id, "name": row["name"], "attempt": row["attempt"]})
            self.state["phases"][phase_id].update({"status": "needs_replan", "diagnosis": diagnosis, "progress": progress})
            self._insert_event_in_tx(
                "phase.no_progress_diagnosed",
                {"phaseId": phase_id, "diagnosis": diagnosis, "progress": progress},
                stable_key=f"phase:{phase_id}:no-progress-diagnosed",
            )
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.export()

    def finish_run(self, accepted: bool, *, terminal_status: str | None = None) -> None:
        allowed = {None, "awaiting_browser_uat", "PARTIAL_CONTINUABLE", "WAITING_CAPACITY", "WAITING_BUDGET",
                   "IMPLEMENTED_READY_FOR_USER_TEST", "BLOCKED_EXTERNAL", "BLOCKED_MODEL_POLICY", "VERIFIED_COMPLETE"}
        if terminal_status not in allowed:
            raise ValueError("Unsupported run status")
        self.state["status"] = terminal_status or ("VERIFIED_COMPLETE" if accepted else "PARTIAL_CONTINUABLE")
        self.state["finishedAt"] = timestamp()
        kind = ("run.awaiting_browser_uat" if terminal_status == "awaiting_browser_uat" else
                "run.development_continuable" if terminal_status == "PARTIAL_CONTINUABLE" else
                "run.waiting_capacity" if terminal_status == "WAITING_CAPACITY" else
                "run.waiting_budget" if terminal_status == "WAITING_BUDGET" else
                "run.implemented_ready_for_user_test" if terminal_status == "IMPLEMENTED_READY_FOR_USER_TEST" else
                "run.blocked_model_policy" if terminal_status == "BLOCKED_MODEL_POLICY" else
                "run.blocked_external" if terminal_status == "BLOCKED_EXTERNAL" else
                "run.completed" if accepted else "run.development_continuable")
        iteration = self.state.get("developmentIteration", 0)
        self.event(kind, {"accepted": accepted, "status": self.state["status"], "iteration": iteration},
                   stable_key=f"run:result:{self.state['status']}:{iteration}")

    def continue_development(self, *, iteration: int, findings: list[str], reason: str) -> None:
        """Persist a useful checkpoint for the next WorkUnit iteration."""
        self.state["developmentIteration"] = iteration
        self.state["iterationInProgress"] = False
        self.state["lastFindings"] = findings
        self.state["nextAction"] = "implement_repair_or_next_milestone"
        self.state["functionalDeliveryStatus"] = "PARTIAL_CONTINUABLE"
        self.event("development.iteration.checkpointed", {
            "iteration": iteration, "nextIteration": iteration + 1,
            "findingCount": len(findings), "reason": reason,
        }, stable_key=f"development:iteration:{iteration}:checkpoint")
        self.finish_run(False, terminal_status="PARTIAL_CONTINUABLE")

    def wait_for_capacity(self, *, retry_after: str, detail: str, canonical_scheduler_owned: bool = False) -> None:
        """Persist a provider-capacity wait without terminating the mission."""
        self.state["status"] = "WAITING_CAPACITY"
        self.state["functionalDeliveryStatus"] = "PARTIAL_CONTINUABLE"
        self.state["retryAfter"] = retry_after
        self.state["capacityWaitDetail"] = detail[:1000]
        if canonical_scheduler_owned:
            self.state["canonicalWaitPersisted"] = True
            self.state["canonicalWaitReason"] = "provider_capacity"
            self.state["canonicalWaitSequence"] = int(self.state.get("canonicalWaitSequence", 0)) + 1
        else:
            self.state.pop("canonicalWaitPersisted", None)
            self.state.pop("canonicalWaitReason", None)
        self.event("run.waiting_capacity", {"retryAfter": retry_after, "detail": detail[:1000],
                                             "canonicalSchedulerOwned": canonical_scheduler_owned},
                   stable_key=f"capacity-wait:{retry_after}")

    def wait_for_budget(self, *, next_eligible_at: str, operation_key: str, canonical_scheduler_owned: bool = False) -> None:
        """Persist a local projection of the canonical Task Control budget wait."""
        self.state["status"] = "WAITING_BUDGET"
        self.state["functionalDeliveryStatus"] = "PARTIAL_CONTINUABLE"
        self.state["retryAfter"] = next_eligible_at
        self.state["budgetWaitOperationKey"] = operation_key
        if canonical_scheduler_owned:
            self.state["canonicalWaitPersisted"] = True
            self.state["canonicalWaitReason"] = "budget"
            self.state["canonicalWaitSequence"] = int(self.state.get("canonicalWaitSequence", 0)) + 1
        else:
            self.state.pop("canonicalWaitPersisted", None)
            self.state.pop("canonicalWaitReason", None)
        self.event("run.waiting_budget", {"nextEligibleAt": next_eligible_at, "operationKey": operation_key,
                                           "canonicalSchedulerOwned": canonical_scheduler_owned},
                   stable_key=f"budget-wait:{operation_key}:{next_eligible_at}")

    def reserve_model_call(self, call_id: str, phase_id: str, role: str, request: dict[str, Any],
                           selection: dict[str, Any] | None = None) -> dict[str, Any]:
        request_json = canonical_json(request)
        request_hash = digest(request_json.encode())
        selection_json = canonical_json(selection) if selection is not None else None
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute("SELECT * FROM model_calls WHERE call_id=?", (call_id,)).fetchone()
            if row is None:
                previous_selection_row = self.connection.execute(
                    "SELECT call_id,selection_json FROM model_calls WHERE selection_json IS NOT NULL ORDER BY rowid DESC LIMIT 1"
                ).fetchone()
                previous_selection = json.loads(previous_selection_row["selection_json"]) if previous_selection_row else None
                self.connection.execute(
                    "INSERT INTO model_calls(call_id,phase_id,role,request_hash,request_json,status,selection_json,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                    (call_id, phase_id, role, request_hash, request_json, "planned", selection_json, timestamp()),
                )
                self._insert_event_in_tx("model.call.planned", {
                    "callId": call_id, "phaseId": phase_id, "role": role,
                    "requestHash": request_hash,
                    "selection": selection,
                }, stable_key=f"model:{call_id}:planned")
                if selection is not None:
                    self._insert_event_in_tx("model.selection.persisted", {
                        "callId": call_id, "phaseId": phase_id, **selection,
                    }, stable_key=f"model:{call_id}:selection")
                    if previous_selection:
                        changed = any(previous_selection.get(key) != selection.get(key) for key in (
                            "profile", "requestedModel", "reasoningEffort",
                        ))
                        if changed:
                            self._insert_event_in_tx("model.selection.transitioned", {
                                "fromCallId": previous_selection_row["call_id"],
                                "toCallId": call_id,
                                "fromProfile": previous_selection.get("profile"),
                                "toProfile": selection.get("profile"),
                                "fromModel": previous_selection.get("requestedModel"),
                                "toModel": selection.get("requestedModel"),
                                "fromReasoningEffort": previous_selection.get("reasoningEffort"),
                                "toReasoningEffort": selection.get("reasoningEffort"),
                                "selectionReason": selection.get("selectionReason"),
                            }, stable_key=f"model:{call_id}:transition")
            elif row["request_hash"] != request_hash or row["phase_id"] != phase_id:
                raise RuntimeError("Stable model call ID was reused with different request data")
            elif selection_json and row["selection_json"] not in (None, selection_json):
                raise RuntimeError("Stable model call ID was reused with a different model selection")
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.export()
        return dict(self.connection.execute("SELECT * FROM model_calls WHERE call_id=?", (call_id,)).fetchone())

    def update_model_call(self, call_id: str, *, event: str, stable_suffix: str, **fields: Any) -> None:
        allowed = {"status", "thread_id", "turn_id", "prior_turn_id", "turn_attempt", "response_text", "response_items_json", "selection_json", "usage_json", "receipt_json"}
        if set(fields) - allowed:
            raise ValueError("Unsupported durable model-call field")
        assignments = ",".join(f"{field}=?" for field in fields)
        values = list(fields.values())
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            if fields:
                self.connection.execute(f"UPDATE model_calls SET {assignments},updated_at=? WHERE call_id=?", (*values, timestamp(), call_id))
            row = self.connection.execute("SELECT phase_id,role,request_hash FROM model_calls WHERE call_id=?", (call_id,)).fetchone()
            if row is None:
                raise KeyError(call_id)
            self._insert_event_in_tx(event, {"callId": call_id, **{k: v for k, v in fields.items() if k not in {"response_items_json", "request_json"}}}, stable_key=f"model:{call_id}:{stable_suffix}")
            if fields.get("receipt_json"):
                receipt = json.loads(fields["receipt_json"])
                self.state.setdefault("modelReceipts", [])
                if all(x.get("callId") != call_id for x in self.state["modelReceipts"]):
                    receipt["callId"] = call_id
                    receipt["phaseId"] = row["phase_id"]
                    self.state["modelReceipts"].append(receipt)
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.export()

    def get_model_call(self, call_id: str) -> dict[str, Any] | None:
        row = self.connection.execute("SELECT * FROM model_calls WHERE call_id=?", (call_id,)).fetchone()
        return dict(row) if row else None

    def reusable_model_thread(self, phase_id: str, role: str, *, exclude_call_id: str) -> dict[str, Any] | None:
        """Return the last completed thread for this phase/role, refusing unresolved turns."""
        row = self.connection.execute(
            "SELECT call_id,status,thread_id,turn_id FROM model_calls "
            "WHERE phase_id=? AND role=? AND call_id<>? AND thread_id IS NOT NULL "
            "ORDER BY rowid DESC LIMIT 1",
            (phase_id, role, exclude_call_id),
        ).fetchone()
        if row is None:
            return None
        if row["status"] != "completed" or not row["turn_id"]:
            raise RuntimeError("Prior Codex thread has an unresolved model call")
        return dict(row)

    def begin_tool(self, operation_id: str, phase_id: str, tool: str, input_value: Any) -> dict[str, Any]:
        encoded = canonical_json(input_value)
        input_hash = digest(encoded.encode())
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute("SELECT * FROM tool_receipts WHERE operation_id=?", (operation_id,)).fetchone()
            if row is None:
                self.connection.execute(
                    "INSERT INTO tool_receipts(operation_id,phase_id,tool,input_hash,input_json,status,updated_at) VALUES(?,?,?,?,?,?,?)",
                    (operation_id, phase_id, tool, input_hash, encoded, "intent", timestamp()),
                )
                self._insert_event_in_tx("tool.intent", {"operationId": operation_id, "phaseId": phase_id, "tool": tool, "inputHash": input_hash}, stable_key=f"tool:{operation_id}:intent")
            elif row["input_hash"] != input_hash or row["phase_id"] != phase_id or row["tool"] != tool:
                raise RuntimeError("Stable tool operation ID was reused with different input")
            elif row["status"] == "completed":
                self.connection.execute(
                    "INSERT INTO events(event_id,kind,actor,at,payload_json) VALUES(?,?,?,?,?)",
                    (self._event_id(None), "tool.receipt.reused", "system", timestamp(), canonical_json({"operationId": operation_id, "tool": tool})),
                )
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.export()
        return dict(self.connection.execute("SELECT * FROM tool_receipts WHERE operation_id=?", (operation_id,)).fetchone())

    def complete_tool(self, operation_id: str, result: Any, *, effect_hash: str | None = None, recovered: bool = False) -> None:
        encoded = canonical_json(result)
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute("SELECT * FROM tool_receipts WHERE operation_id=?", (operation_id,)).fetchone()
            if row is None:
                raise KeyError(operation_id)
            if row["status"] == "completed":
                if row["result_json"] != encoded:
                    raise RuntimeError("Completed tool receipt conflicts with replayed result")
                self.connection.execute("COMMIT")
                return
            self.connection.execute(
                "UPDATE tool_receipts SET status='completed',result_json=?,effect_hash=?,updated_at=? WHERE operation_id=?",
                (encoded, effect_hash, timestamp(), operation_id),
            )
            event_kind = "tool.effect.reconciled" if recovered else "tool.completed"
            self._insert_event_in_tx(event_kind, {"operationId": operation_id, "tool": row["tool"], "resultHash": digest(encoded.encode()), "effectHash": effect_hash}, stable_key=f"tool:{operation_id}:completed")
            self.state.setdefault("toolInvocations", [])
            if all(x.get("operationId") != operation_id for x in self.state["toolInvocations"]):
                self.state["toolInvocations"].append({"operationId": operation_id, "tool": row["tool"], "phaseId": row["phase_id"], "status": "completed", "recovered": recovered})
            self._append_tool_result_projection(row["tool"], result, operation_id)
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.export()

    def get_tool_receipt(self, operation_id: str) -> dict[str, Any] | None:
        row = self.connection.execute("SELECT * FROM tool_receipts WHERE operation_id=?", (operation_id,)).fetchone()
        return dict(row) if row else None

    def pending_tool_receipts(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self.connection.execute("SELECT * FROM tool_receipts WHERE status='intent' ORDER BY updated_at")]

    def supersede_tool(self, operation_id: str, result: Any, *, reason: str) -> None:
        encoded = canonical_json(result)
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute("SELECT * FROM tool_receipts WHERE operation_id=?", (operation_id,)).fetchone()
            if row is None:
                raise KeyError(operation_id)
            if row["status"] != "intent":
                raise RuntimeError("Only unresolved tool intents may be superseded")
            self.connection.execute(
                "UPDATE tool_receipts SET status='superseded',result_json=?,updated_at=? WHERE operation_id=?",
                (encoded, timestamp(), operation_id),
            )
            self._insert_event_in_tx(
                "tool.intent.superseded",
                {"operationId": operation_id, "tool": row["tool"], "reason": reason, "resultHash": digest(encoded.encode())},
                stable_key=f"tool:{operation_id}:superseded",
            )
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.export()

    def count_tool_invocations(self) -> int:
        row = self.connection.execute(
            "SELECT COUNT(*) AS n FROM events WHERE kind IN ('tool.intent','tool.receipt.reused')"
        ).fetchone()
        return int(row["n"])

    def _append_tool_result_projection(self, tool: str, result: Any, operation_id: str) -> None:
        if tool == "run_focused_tests":
            self.state.setdefault("checkReceipts", [])
            if all(x.get("operationId") != operation_id for x in self.state["checkReceipts"]):
                self.state["checkReceipts"].append({"operationId": operation_id, **result})
        elif tool == "run_browser_uat":
            self.state.setdefault("browserReceipts", [])
            if all(x.get("operationId") != operation_id for x in self.state["browserReceipts"]):
                self.state["browserReceipts"].append({"operationId": operation_id, **result})

    def _insert_event_in_tx(self, kind: str, payload: dict[str, Any], *, stable_key: str, actor: str = "system") -> str:
        event_id = self._event_id(stable_key)
        self.connection.execute(
            "INSERT OR IGNORE INTO events(event_id,kind,actor,at,payload_json) VALUES(?,?,?,?,?)",
            (event_id, kind, actor, timestamp(), canonical_json(payload)),
        )
        row = self.connection.execute("SELECT kind,actor,payload_json FROM events WHERE event_id=?", (event_id,)).fetchone()
        if row["kind"] != kind or row["actor"] != actor or row["payload_json"] != canonical_json(payload):
            raise RuntimeError("Stable event ID was reused with different data")
        return event_id

    def _refresh_event_projection_in_tx(self) -> None:
        rows = self.connection.execute("SELECT seq,event_id,kind,actor,at,payload_json FROM events ORDER BY seq").fetchall()
        self.state["eventCount"] = len(rows)
        self.state["lastEventId"] = rows[-1]["event_id"] if rows else None
        self.state["humanInterventions"] = sum(
            1 for row in rows if row["actor"] == "human" and row["kind"].startswith("human.intervention.")
        )
        self.state["lifecycleEvents"] = [
            {"seq": row["seq"], "eventId": row["event_id"], "kind": row["kind"], "actor": row["actor"], "at": row["at"], "payload": json.loads(row["payload_json"])}
            for row in rows
        ]

    def _persist_projection_in_tx(self) -> None:
        self.connection.execute(
            "INSERT INTO projection(id,state_json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json",
            (json.dumps(self.state, ensure_ascii=False),),
        )

    def _persist_projection(self) -> None:
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise

    def commit_state(self) -> None:
        """Durably commit caller-owned run metadata and its JSON projection."""
        self._persist_projection()
        self.export()

    def _refresh_event_projection(self) -> None:
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            self._refresh_event_projection_in_tx()
            self._persist_projection_in_tx()
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise

    def export(self) -> None:
        self.state["restartCount"] = int(self.state.get("restartCount", 0))
        tmp = self.state_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self.state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        with tmp.open("rb") as stream:
            os.fsync(stream.fileno())
        tmp.replace(self.state_path)
        try:
            dir_fd = os.open(self.state_path.parent, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except OSError:
            pass
        event_path = self.evidence_dir / "events.jsonl"
        with event_path.open("w", encoding="utf-8") as stream:
            for row in self.connection.execute("SELECT seq,event_id,kind,actor,at,payload_json FROM events ORDER BY seq"):
                stream.write(json.dumps({"seq": row["seq"], "eventId": row["event_id"], "kind": row["kind"], "actor": row["actor"], "at": row["at"], "payload": json.loads(row["payload_json"])}, ensure_ascii=False) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
