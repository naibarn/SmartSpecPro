# Section-03 Code Review — 2026-07-16 (ssp-reviewer)

Verdict: **REQUEST_CHANGES** → all fixes applied (see interview file).

## Findings

1. **BLOCKER — setHermesDefaultConnection authz bypass:** assertReadable
   passes for any tenant member on server_shared rows → non-owners could
   mutate defaultForImage/Video on an admin-owned shared connection
   (cross-user corruption + partial-unique collisions). FIXED: owner-only
   regardless of scope + test.
2. **MAJOR — probe-failure settlement dead states:** reauth_required /
   HERMES_REAUTH_REQUIRED unreachable (probe failures were silent no-ops).
   FIXED: failure-classification paths added + tests.
3. **MAJOR — control-job insert contract mismatch:**
   capabilityRequirementsJson lacked `capabilityFamilies` (the array the
   existing workerJobMatchesSelection matcher actually reads). FIXED.
4. **MEDIUM — namespace guard not extended to server/routers/hermes***
   (spec §3.3 requirement). FIXED.
5. **MEDIUM — multi-write sequences not transactional** (setDefault
   clear-then-set; startConnect insert+enqueue) despite comments claiming
   so. FIXED via db.transaction in the default repo impl.
6. **MINOR — probe/disconnect error-surface inconsistency.** FIXED (one
   convention).
7. **MINOR — failureReason substring sniffing** with no vocabulary
   contract. DEFERRED → carried into section-04 brief: define shared
   failure-reason constants.
8. **NIT — settlement seam lacks internal tenant check.** DEFERRED →
   section-04 brief: pass/verify tenantId when calling the seam directly.

## Clean
Router registration (3-line hunk), zod inputs on all procedures,
admin-procedure split, secret hygiene (no token fields, no device-code
logging), getAvailability flag accuracy, mcp-template scoping for
list/read paths.
