# SPEC-286 Motion Enhancement Dependency View — 2026-10-08

```mermaid
flowchart LR
  U[Prompt / existing Video Studio project] --> D[Existing Motion Template Registry discovery]
  D -->|compatible template| T[Existing template configuration]
  D -->|no fit / explicit novelty| C[Motion candidate in VideoProjectDocument]
  C --> S{Generated Motion Sandbox security gate}
  S -->|not passed| X[Reject; no code execution]
  S -->|passed in a future WP6| G[Generated Remotion component candidate]
  T --> R[Existing compiler and Remotion executor]
  G --> R
  R --> J[Existing worker_jobs + Runner Authority]
  J --> W[Windows first; Linux separately]
  W --> A[Immutable render artifact + revision/job provenance]
  A --> V[Visual evidence, QA ledger and critic]
  V -->|targeted repair| C
  V -->|approved| P[Existing approval / asset rights / billing]
  P --> M[Existing user, tenant or governed marketplace reuse]
  R -. prerequisite .-> B[WP0.4 A/B/C golden baseline]
  B -->|execution evidence required| R
```

## Authority boundaries

- Project/timeline/revision: existing Spec 133 / Feature 143 owners.
- Motion candidates/template registry/compiler: existing Video Intelligence and Remotion packages.
- Durable execution, assignment and fencing: existing `worker_jobs` and Runner Authority (SPEC-224/267 contracts).
- QA and repair: existing `qaLedger`, quality loop and repair applier.
- Generated code: no execution until a separate security gate passes.
- Rights, approvals, billing, and promotion: existing authorities only.

WP0.4 blocks behavior-changing implementation: the three fixture outputs must be captured first through an authorized current Remotion runner. Static source checks and old parity artifacts are not golden render evidence.
