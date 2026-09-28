# Section-04 Code Review — 2026-07-16 (ssp-reviewer)

Verdict: **REQUEST_CHANGES** → fixes applied (see interview file).

## Findings

1. **MAJOR — _core/index.ts foreign hunk:** staged diff carries an
   unrelated "warm model registry cache" block from a concurrent session.
   DISPOSITION: ride-along accepted per shared-tree policy (removing it =
   destroying another session's uncommitted work; prod already runs it) —
   noted in the commit body, consistent with schema.ts precedent.
2. **MAJOR — device-code raw-fallback never posted:** authorize handler
   only posted on a full clean parse; undocumented CLI format would hang
   the OAuth flow silently for the whole timeout. FIXED: raw-fallback
   latch-and-post once; no double-post on later clean parse.
3. **MEDIUM — outcome missing raw classification:** failure variant
   carried only errorCode, so downstream constants-first classifiers
   would always fall to legacy substring path. FIXED: `failureReason`
   (HermesControlFailureReason) added to the outcome.
4. **MEDIUM — enqueue lacked tenant defense-in-depth** (+ no tenant filter
   in findNonTerminalControlJobForConnection). FIXED.
5. **MEDIUM — unique-conflict recovery swallowed any insert error.**
   FIXED: only Postgres 23505 treated as the idempotency race.
6. **LOW — diagnostic picked the first stdout line** (usually the device-
   code instruction). FIXED: stderr-first, else scan stdout from end.
7. **NIT — terminal-status SQL lists duplicated.** FIXED: single constant.

## Clean
Secret hygiene (maskTokenLike at every boundary, logger never sees
code/URL, .strict() schemas), event contracts frozen, fixture quality
(node-builtins-only, 100755, full scenario API incl. generate branch),
web/worker separation (no db imports in hermesWorker/), sweep mechanics
(unref, idempotent start/stop, per-job error isolation, settled-marker).
