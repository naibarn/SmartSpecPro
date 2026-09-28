# Section-11 Code Review — 2026-07-16 (ssp-reviewer, 2 rounds)

Verdict round 1: REQUEST_CHANGES (loop unwired, download route) → fixed.
Verdict round 2: REQUEST_CHANGES (3 BLOCKER + 2 MAJOR + 3 MEDIUM) → all fixed.

## Round-2 findings
1. **BLOCKER — capability never reached the server:** production call site
   used the old registration builder (not_installed default); heartbeat had
   no hermesMedia → advertised permanently false, min-version enforcement a
   no-op. FIXED at the real call site + heartbeat + server-side promotion.
2. **BLOCKER — no env_clear:** Rust Command inherits the full parent env →
   the Tauri app's secrets reach the prompt-injectable Hermes child. FIXED
   (env_clear + allow-list, proven by a test asserting ambient HOME absent).
3. **BLOCKER — control jobs outside the profile:** auth add/status/logout
   (token writers) had no HERMES_HOME and discarded ensure_profile's handle
   → ran against the user's real HOME. FIXED + test asserting the exact
   HERMES_HOME line.
4. **MAJOR — dual HERMES_HOME** for the same connection (ensure_profile
   base/home vs plan base). FIXED (single path, both tested).
5. **MAJOR — slot independence dead:** has_active_job gated all claims.
   FIXED with separate atomics + spawned execution; terminal-error shutdown
   preserved.
6. **MEDIUM — soft/inactivity timeouts computed but unenforced.** FIXED.
7. **MEDIUM — assetId path traversal** in reference filenames. FIXED
   (validated before any fetch).
8. **MEDIUM — control-job affinity** missing on probe/disconnect. FIXED
   (authorize exempt, commented).
9. MINOR — 60s doctor cache staleness window: accepted (self-heals; typed
   failure at spawn).

## Clean
enforceHermesMinVersion (numeric-segment compare, both ingestion points,
runtimeType-agnostic, no-op when absent); download route (basename + strict
regex + real-dir lookup + manifest.allowed gate); device-code never logged;
block_on always inside spawn_blocking (no runtime nesting).
