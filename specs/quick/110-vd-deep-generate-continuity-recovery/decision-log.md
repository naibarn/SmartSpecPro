# Decision log

## Decision 1 — standard depth

Use standard quick-plan depth. The change is medium risk and crosses shared continuity, Premium generation, job recovery, and tests, but it does not require a schema migration or a new external service.

## Decision 2 — structured IDs over free-text recap

Carry exact canonical IDs as a separate structured input. Free-text `openThreads` remains useful for narrative context but is not sufficient for exact-ID resolution.

## Decision 3 — fail closed over deterministic auto-resolution

Do not add a rule that marks a thread resolved merely because its expected episode has arrived. A model or author must supply the exact ID, and the validator must confirm the lifecycle.

## Decision 4 — checkpoint recovery before fresh generation

Prefer the existing complete checkpoint for series #25. This avoids paying for a second full draft and preserves the original candidate for audit.
