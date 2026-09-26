# Spec 208 Release Gate

Computer Use routes are capability candidates, not independent authority:

| Gate | สถานะ | Required evidence |
| --- | --- | --- |
| Capability graph and policy/fallback separation | Pass | route resolver tests |
| Semantic preview/commit/verification/idempotency | Pass | semantic action tests |
| Local browser/desktop Runner owner/session fencing | Pass | Runner binding tests |
| Economic reserve and failure release | Pass | Spec 207 integration tests |
| Spec 209 inspector/run-drawer projection | Pass | projection contract; browser evidence in 209 |
| Authenticated browser/provider/device certification | Unverified | per-profile local Runner evidence |
| Production enablement/rollback | Unverified | feature flag and rollback drill |

Policy denial and approval blockers are never technical fallback conditions.
Visual fallback cannot be used to authorize a financial or destructive effect.
