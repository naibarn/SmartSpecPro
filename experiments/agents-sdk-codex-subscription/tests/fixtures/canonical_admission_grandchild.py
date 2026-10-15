from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from model_admission import FdCanonicalModelAdmissionTransport

run_id = sys.argv[1]
evidence_root = Path(sys.argv[2])
call_id = str(uuid.uuid4())
transport = FdCanonicalModelAdmissionTransport(3, 4)
reservation = transport.reserve({
    "runId": run_id,
    "modelCallId": call_id,
    "phase": "implementation",
    "role": "implementer",
    "requestedModel": "gpt-6-luna",
    "reasoningEffort": "medium",
    "promptBytes": 96,
    "threadId": None,
    "selection": {"profile": "GENERAL", "requestedModel": "gpt-6-luna", "reasoningEffort": "medium"},
})
operation_key = str(reservation["operationKey"])
transport.dispatching(operation_key)
transport.thread_created(operation_key, "mock-grandchild-thread")
transport.turn_started(operation_key, "mock-grandchild-thread", "mock-grandchild-turn")
transport.settle(operation_key, {
    "inputTokens": 13, "cachedInputTokens": 2, "outputTokens": 5,
    "threadId": "mock-grandchild-thread", "turnId": "mock-grandchild-turn",
    "effectiveModel": "gpt-6-luna", "observedAt": "2026-10-15T00:00:00.000Z",
})
evidence_root.mkdir(parents=True, exist_ok=True)
(evidence_root / "grandchild-admission-response.json").write_text(json.dumps({
    "runId": run_id, "modelCallId": call_id, "reservation": reservation,
}), encoding="utf-8")
