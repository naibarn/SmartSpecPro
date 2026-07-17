# Section-10 Code Review — 2026-07-16 (ssp-reviewer)

Verdict: **REQUEST_CHANGES** (1 MAJOR + 1 MEDIUM blocking) → fixed.

## Findings
1. **MAJOR — error presentation structurally unreachable:** MediaTask had no
   errorCode and hermesMediaAdapter resolved the code into Thai copy before
   the wire, so extractHermesErrorCode had nothing to parse for any
   generate/poll failure. FIXED cross-section (section-06 amendment
   719000420) + consumed here.
2. **MEDIUM — non-admin dead-end reconnect** on tenant-visible server_shared
   rows → raw untranslated FORBIDDEN. FIXED (isAdmin gate + contact-admin copy).
3. **MEDIUM — presentHermesError wired only in the connect flow;** VD/MediaStudio
   toasts still leaked the raw "[HERMES_X] …" prefix for synchronous rejections.
   FIXED (both channels swept).
4. **MEDIUM — single picker can't disambiguate simultaneous image+video hermes
   models** (mirrors the pre-existing MCP limitation). ACCEPTED + commented.
5. **MINOR — reconnect button ignores retryable** (OAuth reconnect ≠ job retry).
   ACCEPTED.
6. **NIT — guard duplication** between the exported builders and inline spreads.
   ACCEPTED (structurally safe; consolidate later).

## Clean
Secret/UX safety (no token fields rendered; userCode/verificationUrl in component
state only; verificationUrl opened verbatim; consent gate real; server_shared
addendum scope-conditional); picker eligibility/auto-select/stale-clear/
disabled-with-reason; polling stops on terminal states; hydration guard
semantics + lazy connections query; safeStorage state-first; shared parser used
for the wire prefix.
