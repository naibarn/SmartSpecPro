# Deep-plan adversarial/self-review — Round 1

Date: 2026-09-18

## Scorecard before fixes

| Category | Score | Finding |
|---|---:|---|
| Structural integrity | 5/5 | All planned modules have paths and section ownership. |
| Completeness vs synthesized spec | 4/5 | REST parity and Media Studio handoff were too implicit; ownership timestamp/key-history requirements needed explicit coverage. |
| Implementability | 4/5 | Provider capability admission and final-artifact gate needed a sharper interface. |
| Internal consistency | 5/5 | Shared names and route IDs were consistent. |
| Edge cases/failure modes | 4/5 | Provider unavailable, stale, OFF, IDOR, and retries were covered; external evidence lifecycle needed explicit revocation and legal-confirmation handling. |

## MUST_FIX findings

1. The source spec defines `/v1/content-protection/*` and a well-known public
   key-history endpoint; tRPC alone would leave an API contract gap.
2. Phase 1 includes Media Studio image/video export, but the compound section
   only named Web Editor and Vertical Drama.
3. Revision 1.3 requires separate first-observed/claimed creation times,
   external timestamp anchors, historical signer key availability, and explicit
   legal declaration confirmation. The plan must name these persistence and UI
   behaviors.
4. Worker capability admission must be tied to a concrete required capability,
   otherwise a queued job could be accepted by a Worker that cannot embed or
   detect the selected modality.

## Fixes applied

- Added REST adapter and public reviewer/key-history responsibilities to plan and
  section 04.
- Added Media Studio final image/video handoff to plan and section 06.
- Added shared feature-flag type/service location to rollout plan.
- Tightened worker capability admission wording.

## Remaining review action

Add explicit ownership/evidence time semantics, key rotation history, and
manual legal-declaration confirmation to the plan before the next review.
