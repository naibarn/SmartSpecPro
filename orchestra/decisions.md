# Orchestra Decisions

[2026-06-04T08:49:26Z] DECISION: Start a fresh Orchestra session for Feature 119 remediation.
  Context: Existing `orchestra/` contents were from prior Feature 117 work and no `snapshot.json` was present.
  Alternatives considered: Resume old session; rejected because this task targets Feature 119 and would mix unrelated state.

[2026-06-04T08:49:26Z] DECISION: Use direct-inline waves in Codex standard light mode.
  Context: The user explicitly invoked Orchestra but did not explicitly authorize sub-agent delegation. Scope is large/high-risk, so the conductor will preserve wave discipline, tests, and convergence reviews inline.
  Alternatives considered: Spawn sub-agents; deferred under standard light mode rules.
