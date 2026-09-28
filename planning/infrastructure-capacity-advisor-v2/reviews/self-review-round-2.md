# Adversarial Self-Review — Round 2

## Attack questions

- Could a container-local disk look healthy while the host is full? Addressed by
  required namespace/mount identity and mismatch downgrade.
- Could a model invent a safe-looking forecast? Addressed by deterministic
  server forecast, evidence keys, and claim reconciliation.
- Could two Admin clicks or scheduler retries spend twice? Addressed by durable
  lifecycle, deployment lock, idempotency, timeout, and stale-run recovery.
- Could the health collector disappear behind media backlog? Addressed by queue
  isolation or explicit delayed-coverage evidence.
- Could an empty/error API response look healthy? Addressed by explicit no-row,
  failed, stale, partial, and insufficient-data UI states.
- Could history JSON grow without bound? Addressed by full/compact retention and
  observable bounded cleanup.
- Could migration proof be overstated because global Drizzle validation is red?
  Addressed by target-DB verification and explicit baseline separation.

## Result

No fatal gap found. The remaining operational choices (exact policy numbers,
retention durations, and whether the monitoring queue can be isolated safely)
must be decided from live deployment evidence during implementation, not guessed
in the UI or LLM prompt.
