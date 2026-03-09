[2026-03-08T12:56:55Z] DECISION: Start a fresh orchestra session for the note-divergence investigation
  Context: `orchestra/` already existed without `snapshot.json`, so the session artifacts were archived and recreated per workflow.
  Alternatives considered: resume the stale orchestra directory

[2026-03-08T12:56:55Z] DECISION: Route the request as a medium-scope bug investigation with sequential inline waves
  Context: The user explicitly invoked orchestra for a cross-domain bug spanning AI draft generation, persistence, and Presentation Editor display, but the environment does not expose a dedicated Task/sub-agent tool.
  Alternatives considered: quick-plan-chain; direct ad-hoc debugging without session artifacts

[2026-03-08T12:56:55Z] DECISION: Treat frontend note dialogs as non-transforming surfaces unless code evidence proved otherwise
  Context: The bug symptoms suggested possible UI drift, but code inspection showed the editor only reads `deck.notes` / `slide.notes` from API state and writes them back directly.
  Alternatives considered: prioritizing frontend state bugs as the primary root cause

[2026-03-08T20:23:40Z] DECISION: Make AI article drafts use a canonical text chain
  Context: The investigation showed three independent text artifacts drifting from each other. The fix makes `Presentation Note` the saved article source, rebuilds `Slide Note` deterministically from that article, and derives visible slide body/sections from the same slide note chunk.
  Alternatives considered: keeping free-form model-generated slide notes and only post-syncing visible slide text; preserving the previous article excerpt + top-up architecture
