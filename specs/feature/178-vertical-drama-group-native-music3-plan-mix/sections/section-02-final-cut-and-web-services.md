# Section 02 — Final-Cut Publication and Web Services

## Goal

Make the completed Production Episode final cut a managed, checksummed,
revisioned source and expose a durable Web-owned semantic/rights workflow for
group-native audio.

## Ownership paths

- `apps/web/shared/verticalDramaSeries/assembly.ts`
- `apps/web/server/services/verticalDramaProductionEpisodeAssembly.ts`
- `apps/web/server/services/verticalDramaProductionEpisodeRemotion.ts`
- new `apps/web/server/services/verticalDramaProductionGroupAudio.ts`
- `apps/web/server/services/verticalDramaAudioScoring.ts` for explicitly shared helpers only
- `apps/web/server/routers/verticalDramaAudioScoring.ts`
- service/router tests under `apps/web/server/services/__tests__/` and `routers/__tests__/`

## Implementation requirements

1. At final-cut publication, persist managed storage reference, SHA-256,
   artifact revision, duration/probe, source-lineage hash, content type,
   publication timestamp and ordered membership snapshot. Include normalized
   group ID/revision in the manifest display projection.
2. Resolve old URL-only groups as `final_cut_artifact_required`; do not queue
   Worker audio from a browser URL. Expose a reassemble/readiness reason.
3. Build an immutable group source snapshot containing final-cut identity,
   ordered members, member plan hashes as evidence, story/script/dialogue/
   emotion inputs, per-region timing origins and source hash. Do not use member
   1 as proxy.
4. Implement group analysis, critique/revision, semantic approval, independent
   rights review, pipeline-run stage dependencies, take listing and score-mix
   admission as durable services. Enforce `(groupRevision, planRevision,
   sourceHash)` compare-and-swap rules and reconcile existing `worker_jobs`/
   `worker_artifacts` before creating a retry.
5. Add dedicated group-only router procedures with tenant/user ownership checks,
   bounded display projections and deterministic stale/blocked reasons. Keep
   existing episode procedure inputs unchanged.
6. Use the existing skill-first semantic path. Exact skill/model failure is
   failed/blocked; run `analyze_regions` → `critique_plan` → optional
   `revise_plan`/re-critique → `compile_music_caption` → `critique_caption`
   before exact-hash approval. Do not fall back to rules, mock output or
   alternate models. Require observed-ASR, human-verified or reviewed
   silent-material evidence for critical anchors.
7. Check paid-provider/credit admission before the first genuine MiniMax request
   and make idempotent replay charge-safe.
8. Enforce the tenant-scoped `verticalDramaGroupNativeMusic3` flag server-side;
   the readiness projection remains available when the flag is off.

## TDD stubs

- Assembly publication persists complete managed artifact identity and increments
  group revision on membership/artifact change.
- Source snapshot preserves ordered member IDs and rejects contradictory or
  ambiguous inputs.
- Approval, rights, stale, duplicate and terminal-state transitions follow the
  documented state machine.
- Old URL-only groups cannot queue analysis/generation/mix.
- Router procedures enforce ownership, group revision, read-only access and
  bounded response shape.

## UI/UX Contract

### Target User / JTBD

The producer needs actionable readiness, plan, rights and stale reasons for one
publishable Production EP.

### Surface Inventory

The group router feeds the Production-tab readiness card, group audio panel and
read-only archive view.

### Component Map

`VerticalDramaProductionEpisodesPanel` owns group placement; the dedicated group
panel owns stage actions; this service owns authoritative state and admission.

### State Matrix

Return loading, no group, artifact required, review, rights pending, queued,
blocked, failed and published projections with deterministic next actions.

### Responsive Matrix

No direct layout change; section 04 consumes compact projections at all required
mobile/tablet/desktop viewports.

### Accessibility Acceptance

Blocked/stale reasons and action eligibility must be visible in text and exposed
to assistive technology through semantic status/alert content.

### Copy Contract

Use `วิเคราะห์อารมณ์และวางแผนเพลงระดับ Production EP` for the group action and
`แผนระดับตอนย่อย (Source)` for member evidence.

### Browser Evidence Required

Section 05 must capture authenticated empty, blocked, published and read-only
router-driven states; an unauthenticated app shell is not sufficient.

## Exit criteria

An approved group plan can be admitted to a durable Worker job using only
server-owned artifact refs and a stable source/plan/revision identity. No group
service mutates episode-scoped plan rows.
