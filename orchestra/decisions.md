[2026-08-18T16:00:00Z] DECISION: Use explicit credit context with conservative fallback routing.
  Context: Ordinary user-credit failures must not create admin feedback; suspicious user requests and provider-account credit failures must escalate.
  Alternatives considered: message-only keyword matching, per-router notification patches.

[2026-08-18T16:00:00Z] DECISION: Thresholds are LLM >3000, media >10000, and unknown >3000 credits.
  Context: User-approved policy; media is the only explicit high-cost exception.
  Alternatives considered: existing 10000 single-job cap for all model types.

[2026-08-18T16:50:00Z] DECISION: Keep the existing tracked orchestra files intact while preserving the archived prior session.
  Context: The prior session files were tracked and the archive directory is intentionally gitignored; restoring unchanged files avoids unrelated deletions.
  Alternatives considered: leave tracked session files deleted in the fresh archive-only layout.
