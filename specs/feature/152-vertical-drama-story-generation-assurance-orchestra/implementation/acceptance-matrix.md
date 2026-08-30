# Feature 152 implementation acceptance matrix

Updated: 2026-08-21

This is the closeout ledger for the first implementation slice. “Implemented”
means there is code plus focused local proof. “Boundary” means the contract or
runbook is present but requires an external system, a production migration, or
additional integration before it can be claimed as proven.

| AC | Result | Evidence / boundary |
|---:|---|---|
| 1-4 | Implemented | Durable status, source snapshot, missing-episode gate, reconnect-safe API/UI contract. |
| 5-7 | Partial | Checkpoint and fingerprints exist; active deep/extend writes are gated; per-attempt artifact ledger is not yet complete. |
| 8-10 | Implemented foundation | Bounded budget/policy, deterministic validator, and candidate-only final gate are present. |
| 11 | Boundary | Feature 151 typed adapter is present; `@openai/agents` is not installed, so active SDK execution is intentionally unavailable. |
| 12 | Boundary | Redacted event builder is present; production dashboard/metric sink is not part of this local proof. |
| 13 | Implemented foundation | Flag-off path remains the legacy path; focused assurance tests pass. |
| 14-15 | Implemented foundation | Tenant-scoped parent table, active uniqueness, lease/fence repository, and pre-activation gate exist. Full transactional active-version commit still belongs to the existing breakdown writer. |
| 16 | Boundary | Idempotent reservation API is hardened, but every legacy paid story call has not yet been migrated to per-unit reservation/reconciliation. |
| 17 | Implemented foundation | `generateStoryBible`, deep generation, extension, and repair admission share the durable source snapshot/status contract; plan generation is final-gated before its active write. |
| 18 | Partial | Legacy plans receive deterministic compatibility beat IDs; an explicit tenant readiness/backfill gate for strict legacy alignment is still required. |
| 19 | Boundary | Additive migration and runbook exist; production information-schema/backfill proof was not run. |
| 20-24 | Implemented foundation | Validator now reports only episodes implicated by blocking paths/alignment IDs; repair planning closes over admitted neighboring episodes and requires approval when a continuity finding crosses the admitted scope. Full continuity-ledger execution and provider/LLM repair evidence remain external/runtime boundaries. |
| 25 | Boundary | Durable reconciliation status/fields exist; provider charge ledger and recovery worker are not wired in this slice. |
| 26-27 | Partial | Approval/rejection API exists; active-story repair activation still uses the legacy confirm path and plan-candidate persistence needs the plan-stage integration. |
| 28-29 | Implemented foundation | Feature 151 contract/hash adapter, worker lease/fence CAS, and durable event cursor fields/tests exist. |
| 30 | Partial | Source snapshot retention is durable; signed skill/rule-pack manifest persistence is not yet connected to the run table. |
| 31 | Implemented foundation | Summary maps non-success states to non-completed transport outcomes; tRPC remains the transport boundary. |
| 32 | Partial | Criteria version and flag snapshot are stored; all legacy quality-loop/apply-season-critique write paths still need interception. |

## Latest gap-closure changes

- Fixed the over-broad `impactedEpisodes` calculation that previously treated
  every generated episode as repair scope. Missing-episode, shot-count, and
  plan-alignment findings now resolve to their concrete episode IDs, with a
  fail-closed fallback to the admitted scope for global findings.
- Added deterministic admitted-neighbor impact closure to the repair planner;
  this is metadata and scope safety, not permission to mutate an unadmitted
  episode.
- Durable writes that include a fence token now throw a typed fence-loss error
  when the compare-and-set updates zero rows. A stale worker exits before it
  publishes a terminal Redis result.

## Explicit non-local proof still required

- Apply and verify migration `0238_vertical_drama_story_generation_assurance.sql`
  in the target environment after information-schema and Drizzle-ledger
  preflight.
- Run provider/credit reconciliation fault tests and verify the production
  dashboard/alert sink.
- Run browser reconnect/accessibility proof for the series detail panel.
- Install and separately approve the Agents SDK dependency before enabling the
  Agents runtime flag; it is deliberately not added by this slice.

These are not hidden gaps: the rollout remains disabled until the boundaries
above are completed and verified.
