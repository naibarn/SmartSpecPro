# Autonomous Completion and Blocker Handling

The user delegates **technical execution**, not repeated requests to authorize progress. A normal error should trigger LLM diagnosis and repair, not stop the whole task.

## Development progression

- Implement the next ready useful slice, commit/integrate through protected Git, build on the authorized development runtime, test, debug and repeat.
- Track remaining requirements and checks in the existing HandOff; do not make final outcome acceptance a prerequisite of development integration.
- An unavailable or inconclusive verification route is not evidence that the code failed. Find an approved alternative or defer its evidence; continue independent work.

## Blocker challenge

For a failing operation: inspect the error, identify the cause, repair, retry with improved evidence, reduce the scope, use an available substitute, or resume independent work. Development DB schema/migration mismatches on an authorized environment are ordinary debugging tasks. Preserve unsuccessful attempts and the next action in HandOff without repeated mandatory classification paperwork.

Escalate to a human only when a concrete new product decision or unavailable external authority is essential, or an irreversible/destructive or demonstrated critical safety boundary cannot be resolved within the granted scope. State **exactly what new decision or permission** the human can supply. If the only possible answer is 'please continue', do not escalate.

## Evidence and completion

Distinguish `INTEGRATED` from `VALIDATION_PENDING`, `VERIFIED`, `DEPLOYED` and `ACCEPTED`. Do not convert failed, unrun, timed-out, resource-blocked or unavailable checks into PASS. A partial working application integrated into Main is genuine progress but not full acceptance. Continue autonomous gap closure until requirements actually pass or a true external boundary is documented.
