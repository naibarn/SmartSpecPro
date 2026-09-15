# Orchestra Decisions

[2026-09-15T01:09:06Z] DECISION: Start a fresh Orchestra review session.
  Context: A prior Orchestra directory existed; it was archived with the safe archiver.
  Alternatives considered: Reuse prior session; rejected to keep this ten-round review auditable.

[2026-09-15T01:09:06Z] DECISION: Use direct-inline-waves in standard light mode.
  Context: SocratiCode MCP and callable review subagents are unavailable, and the worktree has unrelated dirty changes.
  Alternatives considered: Parallel writers; rejected because shared contract files would increase conflict risk.

[2026-09-15T01:09:06Z] DECISION: Treat Cloudflare target-account, Hyperdrive, rollback, provider recovery/PITR, and Vectorize target evidence as external gates.
  Context: Local mocks cannot honestly prove deployment/account behavior.
  Alternatives considered: Mark local tests as production proof; rejected by Feature 186/192 contract.

[2026-09-15T08:10:04+07:00] DECISION: Keep provider cancellation fail-closed and make partial storyboard output reviewable.
  Context: The user confirmed providers generally cannot cancel after submission, while pending work must stop immediately and completed images must be inspectable before deciding whether to continue.
  Result: Add a lightbox for completed managed images, project durable partial output on cancellation, preserve control-plane fencing for late provider results, and reuse successful image assets without re-submission.
  Alternatives considered: Browser-only image caching and assuming provider cancellation were rejected because they lose recovery evidence or create false cancellation guarantees.
