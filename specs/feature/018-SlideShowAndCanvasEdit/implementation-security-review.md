# Post-Implementation Security Re-Review

Date: 2026-02-22
Scope: Feature 018 slideshow/canvas presentation implementation

## mitigation_status_update
- updated_on: `2026-02-22`
- stream_a: `implemented` (bounded in-memory TTL/cap safeguards for export state)
- stream_b: `implemented` (strict shared slide-content schema + service byte-limit enforcement)
- stream_c: `implemented` (DB-backed conversion idempotency/locking with TTL + tenant/link composite integrity constraints migration + regression coverage)
- remaining_focus: `none within Streams A/B/C hardening plan`

## post_hardening_revalidation
- performed_on: `2026-02-22`
- outcomes:
  - conversion fallback now requires explicit opt-in (`useInMemoryStateFallback`), preventing accidental downgrade from durable DB-backed state.
  - conversion TTL cleanup now includes global expired lock/record pruning path.
  - stream-c migration uses additive/idempotent guards with `NOT VALID` constraints to lower rollout failure risk on legacy data while enforcing new writes.
  - drizzle migration metadata synchronized (`_journal` + snapshots) for `0033` lineage continuity.
  - presentation client type contracts aligned with strict shared schema; targeted presentation tests remain green.
- residual_risks:
  - full repository baseline failures remain outside presentation scope (not new from this feature).

## critical
- none identified in this review pass.

## high

### 1) Unbounded memory growth in export state registries
- files:
  - `apps/web/server/services/presentationPlaybackExport.ts:80`
  - `apps/web/server/services/presentationPlaybackExport.ts:81`
  - `apps/web/server/services/presentationPlaybackExport.ts:82`
  - `apps/web/server/services/presentationPlaybackExport.ts:311`
  - `apps/web/server/services/presentationPlaybackExport.ts:338`
  - `apps/web/server/services/presentationPlaybackExport.ts:377`
- risk:
  - Export dedupe/status/result registries are process-global maps with no runtime TTL eviction or bounded capacity. A sustained stream of queued exports can accumulate entries indefinitely and lead to memory pressure/OOM (availability risk).
- recommended fix direction:
  - Move export state and dedupe tracking to a bounded external store (for example Redis) with TTL.
  - If in-memory state remains for MVP, add periodic sweeping and hard max-entry caps per tenant/user plus global caps.

### 2) No size/depth bounds on `slideContent` write payloads
- files:
  - `apps/web/server/routers/presentation.ts:372`
  - `apps/web/server/routers/presentation.ts:413`
  - `apps/web/server/services/presentationService.ts:516`
  - `apps/web/server/services/presentationService.ts:595`
- risk:
  - Slide writes accept `z.record(z.any())` without structural or byte-size limits. Malicious or accidental oversized JSON payloads can increase memory usage and database row bloat, degrading service performance.
- recommended fix direction:
  - Replace permissive payload typing with a strict schema for allowed element shapes.
  - Enforce maximum element counts, string lengths, numeric bounds, and serialized payload-size limits before persistence.

## medium

### 1) Conversion idempotency/lock state is in-memory, unbounded, and non-distributed
- files:
  - `apps/web/server/services/presentationCompatibilityService.ts:41`
  - `apps/web/server/services/presentationCompatibilityService.ts:42`
  - `apps/web/server/services/presentationCompatibilityService.ts:43`
  - `apps/web/server/services/presentationCompatibilityService.ts:354`
  - `apps/web/server/services/presentationCompatibilityService.ts:355`
  - `apps/web/server/services/presentationCompatibilityService.ts:374`
- risk:
  - Conversion dedupe and locks are process-local and non-expiring. Multi-instance deployments or restarts can bypass idempotency guarantees and increase duplicate conversion risk, while maps can grow without bound over uptime.
- recommended fix direction:
  - Persist conversion idempotency and source locks in durable shared state (DB table or Redis lock/setnx with TTL).
  - Add expiration and compaction policy for cached conversion records.

### 2) Tenant consistency of asset links is application-enforced, not schema-enforced
- files:
  - `apps/web/drizzle/0032_presentation_schema.sql:42`
  - `apps/web/drizzle/0032_presentation_schema.sql:45`
  - `apps/web/drizzle/0032_presentation_schema.sql:47`
- risk:
  - `presentation_asset_links` stores `tenant_id`, `deck_id`, and `library_item_id`, but schema constraints do not guarantee that referenced deck/item belong to the same tenant. Future non-service writes or migrations could introduce cross-tenant linkage integrity issues.
- recommended fix direction:
  - Add composite constraints/foreign keys enforcing tenant alignment (`tenant_id` + referenced id pairs), or add DB-level validation triggers.

## low

### 1) Throttle key maps retain stale keys indefinitely
- files:
  - `apps/web/server/services/presentationPlaybackExport.ts:83`
  - `apps/web/server/services/presentationPlaybackExport.ts:84`
  - `apps/web/server/services/presentationPlaybackExport.ts:132`
  - `apps/web/server/services/presentationPlaybackExport.ts:145`
- risk:
  - Even after timestamp pruning, keys remain in throttle registries forever. This causes gradual memory drift over long-lived processes.
- recommended fix direction:
  - Remove keys when pruned windows are empty and/or run periodic map compaction.

## post_baseline_typescript_remediation
- performed_on: `2026-02-22`
- scope:
  - cross-domain baseline fixes outside slideshow feature (`AdminSkills/SkillBrowser`, chat DB nullability, prom-client typing, strict client guards)
- security-impact-summary:
  - no new high/critical findings introduced by this remediation pass.
  - chat router paths now fail closed with explicit DB-availability checks instead of unsafe nullable access.
  - restored skills admin procedures enforce ownership/admin checks for approval and group-sharing mutations.
- residual_risks:
  - test harness baseline remains partially unstable (`@jest/globals` wiring in one legacy router test file), but this is not a production runtime exposure.
