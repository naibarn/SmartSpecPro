# Section 04 — vision, Quick, and Full Scan

Add a capability-aware composition scan adapter beside the existing speaker
aware runner. Reuse available face/person evidence and activity sampling. Hand
and object tracking are optional model capabilities; missing models must yield
degraded evidence and a visible fallback. Full Scan is bounded, checkpointed,
resumable, idempotent, and emits evidence references rather than raw frames.

Proof: Python/unit tests cover capability truthfulness, malformed evidence,
checkpoint resume, object-model absence, and bounded output.

Status: IMPLEMENTED as a capability-aware Python evidence contract plus a
bounded browser Full Scan path. Hand/object model execution remains gated by
runtime capability and is not fabricated when unavailable.
