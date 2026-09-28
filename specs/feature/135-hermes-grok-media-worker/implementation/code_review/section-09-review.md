# Section-09 Code Review — 2026-07-16 (ssp-reviewer)

Verdict: **REQUEST_CHANGES** (2 BLOCKER + 3) → all fixed.

Foreign hunks excluded by the reviewer (concurrent sessions, not this
section): MCP auto-resolve guard removal; character-DNA/roleTier/needsSetup;
shot-character-reference + dialogue/speaker-order fixes; deep-story-draft
executor + genre presets.

## Findings
1. **BLOCKER — hermes blocked by platform-credit gate:** generateCharacterImage
   (~L2893) + generateCharacterSheet (~L3374) ran hasEnoughCredits BEFORE
   transport resolution → a provider_account job denied for lack of SmartSpec
   credits; the other 8 surfaces were already correct. FIXED (guards now in all
   4 routers: characters 5, episodes 5, locations 1, series 1) + spy tests.
2. **BLOCKER — test coverage unstaged/stale:** index shipped router changes
   against assertions that still expected the old DEFAULT_MODELS fallback.
   FIXED (all six test files land with the code).
3. **MAJOR — row 4 had zero hermes tests.** FIXED (+ incidentally healed 4
   pre-existing cascade-polluted failures in that file via mock resets).
4. **MEDIUM — silent reference drop** (identity lock lost with no signal).
   FIXED: resolveHermesOrderedRefsFromUrls audits each drop (traceId +
   connectionId, never URL/content) + droppedReferenceCount through the
   envelope and mutation responses (7 VD call sites; media.ts keeps hard-reject).
5. **MEDIUM — suspected undeclared third remediation:** investigation showed
   resolveEpisodeImageModelId's fail-closed behavior PREDATES this section
   (only tests added). No action.
6. MINOR — media.ts imports the decision helper from a VD-named module
   (layering follow-up, matches existing convention). Accepted.

## Clean
Decision helpers delegate to the existing MCP helpers (byte-equivalence holds,
both copies); row-9 + row-10 remediations correct; effectiveHermesCapability
feeds the existing identity-before-environment trim; sha256 compute-and-persist
best-effort; storyboardReviewWorkspace preserves hermes values; namespace guard.
