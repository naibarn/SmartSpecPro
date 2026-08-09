# Section 02: Server Cover Lifecycle

## Depends on

Section 01.

## Owns

- `apps/web/server/services/verticalDramaEpisodeCover.ts`
- `apps/web/server/services/__tests__/verticalDramaEpisodeCover.test.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.episodeCover.test.ts`

## Implementation

1. Add a server helper that loads the owned series and episode, resolves the active current synopsis/key beats using the existing breakdown source, and reads only approved `startFramePlan.frames[].approvedMediaAssetId` values.
2. Verify every reference asset with tenant/user/episode ownership and image-type checks before resolving its URL. The browser must never supply reference URLs.
3. Add `generateEpisodeCover` with bounded input and a required idempotency key. Validate ownership, model catalog/capability, reference support, transport requirements, and rate/credit rules before submission.
4. Build the exact prompt and request one image through `mediaGenerationService.generateImageAsync` using existing transport/pricing/credit helpers. Persist a generating cover state with task id, model, selected shot numbers, prompt snapshot, and internal replay key.
5. Implement same-key replay as a no-op return of the persisted task/state; reject a different generate request while a task is pending. Do not reserve or submit twice.
6. Add `getEpisodeCoverStatus`. Reconcile pending/processing, completed-with-URL, failed, cancelled, expired, missing-result, and stale-task states. Import a completed URL into a canonical owned media asset and finalize exactly once.
7. Add `setEpisodeCoverAsset`. Verify the uploaded asset is owned by the caller and is an image. Make the manual upload immediately authoritative while retaining enough private superseded-task information for terminal credit/task reconciliation.
8. Ensure stale completion cannot overwrite manual upload or a newer generation. Never write `startFramePlan`, storyboard, assembly, or video fields.
9. Bound persisted error text and ensure provider/task metadata remains server-only.

## Exact procedure contracts

```ts
generateEpisodeCover({
  seriesId: string;
  episodeId: string;
  modelId: string;
  idempotencyKey: string;
  mcpConnectionId?: string;
})

getEpisodeCoverStatus({ seriesId: string; episodeId: string })

setEpisodeCoverAsset({
  seriesId: string;
  episodeId: string;
  mediaAssetId: string;
})
```

## Tests first

Mock only provider/task/credit/asset boundaries. Cover ownership, exact prompt forwarding, approved-reference filtering, model failure before credit, idempotent replay, pending status, one-time finalization, terminal failure, upload validation, stale completion, and no unrelated JSONB mutation.

## Completion proof

- Focused service/router tests pass.
- A replay has one provider call and one credit reservation.
- Completion/failure are durable and repeat-safe.
- Security review confirms every path has tenant/user/series/episode/asset predicates.

## UI/UX Contract

This server section supplies the durable state rendered by the Episodes tab.

### Target User / JTBD

The series owner must see truthful pending, ready, failed, and upload-replacement states for one episode.

### Surface Inventory

Generation status, model label, selected-shot metadata, bounded error, and cover asset URL are the browser-visible projection; prompt and ownership internals remain server-only.

### Component Map

Section 04 maps this DTO to the model picker, episode cover surface, polling status, and upload controls.

### State Matrix

Pending task is generating; terminal success is ready; provider/import failure is failed; manual upload is ready with upload precedence; stale completion is invisible.

### Responsive Matrix

The API has no layout dependency. DTO fields must remain optional/null-safe for narrow and read-only surfaces.

### Accessibility Acceptance

Server errors must be bounded and user-readable so the UI can announce them without exposing provider internals.

### Copy Contract

Errors may support Thai UI copy, but must not alter the generation prompt or include provider diagnostics in the browser DTO.

### Browser Evidence Required

No direct browser evidence here; status transitions are exercised through router tests and visual evidence is recorded in section 05.
