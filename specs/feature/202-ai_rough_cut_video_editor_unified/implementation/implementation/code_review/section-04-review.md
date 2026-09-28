# Section 04 code review

Status: reviewed by the main conductor.

- Review scope is bounded and uses a radio-group keyboard path.
- Missing transcript/change-set data renders unavailable, not successful.
- Stale change sets disable Apply/Reject and explain recompute guidance.
- Manual locks and skipped/protected operations remain visible.
- Evidence/confidence and before/after controls are inspectable.
- Blocking QC prevents render readiness unless an explicit server-approved
  override callback is provided.

No backend apply mutation was invented; callback ownership remains with the
canonical runtime integration.
