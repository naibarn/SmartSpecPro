[2026-08-30T12:40:41Z] DECISION: Start a fresh Orchestra session and archive the previous session.
  Context: Existing orchestra/ state belonged to earlier work; safe archive moved it to .orchestra-archive/20260830T124041Z.
  Alternatives considered: overwrite old state (rejected because it would lose recoverable audit context).

[2026-08-30T12:41:00Z] DECISION: Use direct inline standard-light execution.
  Context: This is a cross-layer bug requiring data-first debugging; no SocratiCode or sub-agent MCP tool is available in the current session.
  Alternatives considered: broad parallel dispatch (not available and would risk overlapping a heavily dirty worktree).

[2026-08-30T19:52:00Z] DECISION: Preserve the intentional description-only roster lifecycle and repair the failure boundary instead of fabricating DNA or auto-spending credits.
  Evidence: series 57 rows 206-208 contain descriptions but no visualBible/designDna, while the design spec persists DNA only after confirmed generation; no task/error exists for those characters.
  Repair: `needsSetup` now validates `visualBible.designDna`; candidate-first preview falls through to normal prompt generation when age cannot be safely resolved.

[2026-08-30T20:00:00Z] DECISION: Reconcile all eligible repository changes while excluding generated payloads.
  Context: `main` and `origin/main` were both `42a8b303a`; the worktree contained 917 tracked changes plus 2,396 untracked files, including about 22.5 GB of cache/build/release output that cannot be published to GitHub.
  Alternatives considered: stage every filesystem path (rejected because it would include generated caches, multi-GB release archives, and an unexplained zero-byte root file).
  Boundary: stage tracked changes and reviewed source/spec/doc/test/config/evidence paths; ignore generated outputs and leave `=.*new` untouched.

[2026-08-30T20:10:00Z] DECISION: Mark repository reconciliation complete after remote parity verification.
  Evidence: commits `13a313d47` and `a1cd6a4ad` pushed successfully; local HEAD and `origin/main` are identical and `git status --short --branch` is clean.
  Residuals: ignored local build/cache/release outputs remain on disk; aggregate typecheck is red and Python lint is unavailable, both reported as verification limitations.
