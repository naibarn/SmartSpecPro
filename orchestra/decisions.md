[2026-08-19T01:06:51Z] DECISION: Start a fresh Orchestra session by archiving the prior completed session.
  Context: The repository had an existing completed `orchestra/` state without a snapshot; it belonged to an earlier credit-routing task.
  Alternatives considered: Reuse stale artifacts; rejected because they describe a different task.

[2026-08-19T01:12:00Z] DECISION: Keep `legacyControlArchive` as server-managed audit metadata rather than treating it as an active mutable story-control field.
  Context: The shared story-design repair intentionally rewrites this archive when canonical windows/beats are repaired, while QC must continue enforcing active control fields.
  Alternatives considered: Remove the archive; rejected because it is needed for audit/recovery. Mark all unknown storyDesign keys mutable; rejected because it would weaken the revision contract.
