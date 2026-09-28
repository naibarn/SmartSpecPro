# Plan Adversarial Self-Review — Round 4

The plan was attacked for silent failure modes:

- A read could mutate detector state: explicitly prohibited; detection moves to
  an advisory mutation/outbox.
- Unlink could delete legacy references: projection lineage and preservation
  rule are explicit.
- A normal prop could inherit commercial policy: explicit mode and bridge
  boundary are repeated in catalog, Special, resolver, and UI sections.
- Drag/drop could trust arbitrary URLs: managed-media IDs and ownership
  recheck are required.
- A failed optional object could block an episode: fail-open behavior is an
  invariant and a browser/release gate.

Result: PASS. No fix required.
