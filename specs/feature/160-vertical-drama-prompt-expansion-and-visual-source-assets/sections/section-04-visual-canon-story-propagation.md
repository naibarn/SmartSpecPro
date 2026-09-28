# Section 04 — Visual Canon and Story Propagation

## Objective

Freeze accepted visual sources into an immutable snapshot and thread the same snapshot through standard draft, full story, deep/premium story, retry/resume, start-frame, references, B-roll planning, and final readiness.

## Dependencies

- Sections 01–03.
- Existing story-generation run contract, source-pack digest/manifest, story bible, architecture planner, storyboard/start-frame services, and durable job executor.

## Ownership

- Add apps/web/server/services/verticalDramaVisualSourceSnapshotService.ts.
- Extend apps/web/server/services/verticalDramaStoryGenerationContracts.ts.
- Extend verticalDramaStoryBible.ts, verticalDramaStoryArchitecturePlanner.ts, verticalDramaStoryboardGeneration.ts, verticalDramaStartFrameGeneration.ts, and adapters with snapshot input/output metadata.
- Extend apps/web/server/routers/verticalDramaSeries.ts admission/job/resume paths.
- Add focused server tests for every entry point and stale fence.

## Snapshot behavior

Create an owner-scoped snapshot from accepted source-pack slots/assets/segments, profile, evidence, rights/disclosure, and coverage obligations. Persist immutable JSON projection, revision, and deterministic fingerprint. Signed URLs, provider URLs, volatile timestamps, and raw prompt payloads do not participate in identity.

Expose create/read/validate/reconcile operations. Reconcile creates a new revision and marks dependent artifacts stale; it never mutates historical snapshots. Use existing story-generation run fields sourceRevision, sourceFingerprint, and sourceSnapshotJson as the durable parent-run boundary.

## Propagation behavior

Precedence is explicit user-approved binding/segment, then snapshot, then approved source plan, then LLM prose. LLM output may propose bounded slot/claim/segment keys only. The server resolves keys against the snapshot and owner scope.

Every standard draft, full story, deep story, premium, retry, resume, start-frame, motion-prompt, B-roll, and final-gate path receives and persists the same snapshot ID/revision/fingerprint. Deep/premium resume loads the snapshot from the parent run; it must reject a changed pack with stale-input/restart-required instead of mixing current rows with historical partial output.

Run deterministic coverage gates after prompt expansion, source planning, draft/full/deep story, start-frame/reference resolution, B-roll planning, and final assembly. Required missing/news visual obligations block; optional gaps warn. A source/segment/evidence/rights/profile change stales dependent outputs and forces a new snapshot.

## Tests-first requirements

Write tests before implementation for immutable snapshot ownership, stable fingerprints, source-change stale cascade, unchanged unrelated series, standard/deep/premium/retry/resume propagation, LLM proposal sanitization, missing coverage blocking, and resume mismatch rejection. Keep existing story-generation flag-off tests green.

## Acceptance

- All story paths use one visual-source snapshot, not independently reconstructed media lists.
- Historical runs remain auditable and cannot be silently reinterpreted.
- Start-frame/reference/B-roll outputs retain semantic role and snapshot provenance.
- No paid generation is called when snapshot/coverage admission is stale or blocked.

## UI/UX Contract

### Target User / JTBD
N/A — this section changes server-side story input propagation; UI states are verified in sections 03, 05, 06, and 07.

### Existing Pattern Reference
N/A — no new interaction is introduced here; existing story/start-frame surfaces consume the propagated projection.

### Surface Inventory
N/A — server generation paths and run artifacts only.

### Component Map
N/A — service/contract integration only.

### State Matrix
N/A — stale/blocking findings are covered by downstream UI and gate sections.

### Responsive Matrix
N/A — no layout is changed here.

### Accessibility Acceptance
N/A — no direct user-facing control is added here.

### Copy Contract
N/A — no direct copy is added here.

### Browser Evidence Required
N/A — propagation/unit/integration tests and run evidence are applicable.

## Implementation record

- Added `verticalDramaVisualSourceSnapshotService.ts` for immutable snapshot creation, stable fingerprinting, stale-fence validation, owner-scoped persistence, and identity immutability.
- Added optional `visualSourceSnapshot` admission input to `verticalDramaStoryGenerationRuntime.ts`; when supplied, draft/full/deep admission uses the accepted visual fingerprint and snapshot payload as the durable story-source boundary.
- Focused proof covers stable snapshot fencing and B-roll/news propagation contracts; remaining caller coverage is verified by the final traceability pass.
