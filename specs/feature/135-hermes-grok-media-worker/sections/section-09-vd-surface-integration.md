# Section 09 — VD Surface Integration (`resolveVdMediaTransportDecision` + all 10 surfaces + 2 fail-closed remediations)

Feature: 135 Hermes Grok Media Worker
Section id: `section-09-vd-surface-integration`
Plan source: `../claude-plan.md` §11 (+ §12 for effective capability) · TDD source: `../claude-plan-tdd.md` §11 · Normative spec: `../spec.md` §11.2, §11.5, §11.6
Test command: `pnpm --dir apps/web test` (Vitest; run from `apps/web` — root run breaks `@shared`). All paths below are relative to `apps/web/` unless absolute.

## 1. Goal

Make the `hermes_worker` transport reachable from **every** generation surface — Media Studio's async image/video procedures and all ten Vertical Drama resolvers — by adding the transport decision **at the helper level, not per resolver**, and ship the two committed fail-closed remediations that this feature's no-silent-fallback policy requires.

Deliverables (server-side only — client picker/panel wiring is section-10):

1. **Generalize the two byte-equivalent VD transport helpers** into a transport-neutral decision function returning a discriminated union (`gateway` / `mcp` / `hermes`), with existing MCP/gateway behavior byte-identical.
2. **Wire all 10 VD surfaces** (characters ×3, locations ×1, episodes ×5, ad banner ×1) so a Hermes model id routes into `queueHermesMediaJob` (section-05) and returns the standard async task envelope with the `hermes_` taskId (polled via section-06's `getTask` branch).
3. **Remediation row 9:** `resolveEpisodeVideoModel` — remove the silent `DEFAULT_MODELS.video` fallback; throw BAD_REQUEST like `resolveEpisodeImageModelId`.
4. **Remediation row 10:** ad banner — remove the silent `DEFAULT_MODELS.image` fallback and route it through the shared VD transport decision helper (it is today the only VD generator with no transport branch at all).
5. **`media.ts` three-way branch** in the async image and video procedures (the existing binary `shouldUseMcpTransport` branches at `server/routers/media.ts:2969` and `:3247`).
6. **Formatter family:** Hermes-Grok video ids resolve to provider family `grok` in `verticalDramaVideoPromptFormatter` (prompt style follows model family, not transport).
7. **Reference trimming via effective capability:** `generateVideoClip`'s existing `maxReferenceImages` "identity before environment" trimming is driven by `effectiveHermesCapability(modelRow, connection manifest, operation)` for Hermes models (grok i2v = 1 → only the start frame survives).

**Landing order (phase gate — spec §18):** this section is ONE document but
TWO landable increments. Land **increment A (phase 2, image)** first: the
decision helpers, image surfaces rows 1–8 + 10 (incl. the ad-banner
remediation) and `media.ts` image branch — full suite green, phase-2
acceptance verified. Then land **increment B (phase 3, video)**: row 9
`generateVideoClip`, the `resolveEpisodeVideoModel` remediation, the
`media.ts` video branch, formatter family test. Each increment merges
independently; never bundle both in one review.

## 2. Dependencies and consumers (reference only — do not re-implement)

Depends on (must exist before this section):

- **section-01-shared-contracts:** `shared/hermesMedia.ts` (`hermesMediaJobContractSchema`, `HermesMediaOperation`, `HERMES_MEDIA_ERROR_CODES` + `hermesErrorCopy`, `effectiveHermesCapability`), `shared/mediaModelTransport.ts` hermes arm in `resolveMediaModelTransportConfig` (returns `{ transport: "hermes_worker", providerKey: "hermes-grok", providerModelId, creditSource: "provider_account" }`), widened `MediaTransport` union in `shared/mcpConnectTypes.ts`.
- **section-05-admission-scheduler:** `queueHermesMediaJob(rawInput, deps)` → `{ created, taskId: "hermes_" + jobId, job }` — the single entry point every surface calls. All flags/admission/fee/idempotency/worker-online enforcement lives THERE; surfaces never duplicate it.
- **section-06-task-projection-credits:** `hermes_` branch in `mediaGenerationService.getTask` + `reconcileTaskCredits` — this is why returning a `hermes_` taskId is sufficient: every existing polling client (VD workspace, portrait-candidate settlement, media history) works unchanged.
- **section-08-model-catalog-transport:** seeded `media_models` rows `hermes-grok/grok-imagine-image`, `hermes-grok/grok-imagine-image-quality`, `hermes-grok/grok-imagine-video` (configJson `transport: "hermes_worker"`, image `referenceImageLimit: 3`, video `1`), plus `mediaTransportResolver.ts`'s "hermesConnectionId requires transport=hermes_worker" rule.
- **section-03-connection-service-router (indirect):** connection rows + a read path for "the caller's default authorized connection for asset type" (used by the decision helper; inject it in tests).

Blocks: **section-10** (client threads `hermesConnectionId` props into the inputs added here), **section-12** (audit/load hardening over these paths).

Existing code this section edits or must read first:

- `server/routers/verticalDramaCharacters.ts` — exported `resolveVdCharacterMcpTransportMetadata` (L473), call sites at ~L1107 (`generatePortraitCandidateBatch` path), ~L2715 (`generateCharacterImage`), ~L3103 (`generateCharacterSheet`); `resolveCharacterImageModelId` (L541, the fail-closed convention to copy).
- `server/routers/verticalDramaLocations.ts` — imports the characters helper verbatim (L93, call site ~L650).
- `server/routers/verticalDramaEpisodes.ts` — private `resolveVdMcpTransportMetadata` (L2945, byte-equivalent twin), `resolveEpisodeVideoModel` (L2887 — the remediation target), call sites ~L9738 (`generateStartFrameImage`), ~L10395 (`generateStartFrameAngleVariations`), ~L10640 (`repairShotImage`), ~L11409 (`generateVideoClip`), ~L12623 (`generateShotReferenceFrameImage`).
- `server/routers/verticalDramaSeries.ts` — `generateAdBannerImage` (L6679; the silent fallback is `banner.generation.modelId || DEFAULT_MODELS.image` at L6758) + `server/services/verticalDramaAdBanner.ts` (`resolveAdBannerImageModelPricing` L516, `submitAdBannerImageGeneration` L573).
- `server/routers/media.ts` — async image procedure MCP branch (L2964–3044) and async video twin (~L3247–3310); input zod schemas of both procedures.
- `server/services/verticalDramaVideoPromptFormatter.ts` — `detectGrokOrSeedance` (L275, substring `"grok"` match over modelId+aliases) + `resolveVerticalDramaProviderFamily`.
- VD reference-mapping validator — `findCharacterImageIndexMappingMismatches` / `VdReferenceMappingError` (`VD_REFERENCE_MAPPING_MISMATCH`): keeps running BEFORE enqueue, unchanged.
- `shared/verticalDramaSeries/contactSheets.ts` — the "Image-N = <name>" labeling convention that carries into `references[].label`.

Namespace rule (hard): everything new is `hermesMedia*` / `hermes*` in the media namespace. Never import or reference `queueHermesWorkerJob` or `hermesAgentRuntime` (unrelated agent-gateway lane). Section-01's namespace-guard test auto-covers new `server/services/hermes*` files.

## 3. TDD — write these tests FIRST

Conventions: Vitest, injected deps / `vi.fn()` spies, module mocks for `queueHermesMediaJob`, no DB. Extend existing test files where a suite already covers the resolver (they encode the byte-identical regression baseline).

### 3.1 Helper generalization (extend `server/routers/__tests__/verticalDramaCharacters.modelSelection.test.ts` + `verticalDramaLocations.test.ts`; new episode-helper cases)

- **Zero-regression baseline:** every existing `resolveVdCharacterMcpTransportMetadata` / locations transport test passes UNCHANGED — MCP fixtures still produce identical `MediaTaskTransportMetadata`; gateway fixtures still produce the "proceed as before" outcome. Do not edit existing assertions.
- New decision function with a Hermes-transport model row (`configJson: { transport: "hermes_worker", hermes: {...} }`) + explicit `hermesConnectionId` → `{ kind: "hermes", connectionId }`.
- Hermes model with NO `hermesConnectionId` and no default connection (injected default-resolver returns null) → throws BAD_REQUEST with the `HERMES_CONNECTION_REQUIRED` Thai/English copy (mirror of the MCP "requires a connected MCP provider account" guard) — never falls through to gateway.
- Hermes model with no explicit id but an injected default connection → `{ kind: "hermes", connectionId: <default> }`.
- MCP model + `hermesConnectionId` supplied → BAD_REQUEST (cross-transport connection id rejected; mirrors section-08's resolver rule); gateway model + `hermesConnectionId` → BAD_REQUEST likewise.
- The characters copy and the episodes copy return identical decisions for identical fixtures (byte-equivalence convention test — table-drive both functions over the same fixture set).

### 3.2 Per-surface routing (rows 1–10; extend each surface's existing test file, or add `verticalDramaEpisodes.hermesTransport.test.ts`)

For EACH of the ten resolvers, with a Hermes model id selected and `queueHermesMediaJob` mocked:

- the resolver reaches `queueHermesMediaJob` (spy called once per output) with the correct `operation` (§4.4 mapping table), `connectionId`, prompt, and `references[]` (assetId + index + role + label + sha256; indices continuous from 1; labels follow "Image-N = <name>");
- NO platform-credit reserve happens on the surface (the existing MCP zero-cost-credit-guard convention — spy on the surface's `reserveCredits`/`hasEnoughCredits` path and assert not called for hermes; the shared-pool fee is the scheduler's job);
- the resolver returns the standard async envelope whose taskId is the scheduler's `hermes_<jobId>`;
- each resolver STILL fail-closes on empty/undefined model (existing BAD_REQUEST guards intact — rows 1–8 regression; rows 9–10 new, below).

Row-specific extras:

- **Row 3 (`generatePortraitCandidateBatch`):** N candidates ⇒ N independent `queueHermesMediaJob` calls sharing one `connectionId`, each with `idempotencyKey` = the existing `${batchId}:${candidateId}` convention; batch size ≤ 4 for Hermes connections (guard test).
- **Row 9 (`generateVideoClip`):** operation is `video.image_to_video`; references trimmed to `effectiveHermesCapability(...).maxReferences` — with grok video (model row 1, manifest 1) only the start frame (index 0 of the assembly order) survives; with a fixture manifest of 3 the "identity before environment" order is preserved (start frame, then portraits, location dropped last).
- **Mapping validator:** a conflicting Image-N mapping fixture still throws `VdReferenceMappingError` BEFORE `queueHermesMediaJob` is called (spy not called).

### 3.3 Remediation row 9 — `resolveEpisodeVideoModel`

- Empty/absent `selectedVideoModelId` → throws BAD_REQUEST (Thai/English copy matching `resolveEpisodeImageModelId`'s message style); `DEFAULT_MODELS.video` is never consulted (spy/fixture: the default row exists in the catalog but is NOT returned).
- Selected model disabled (`isEnabled === false`) or missing from catalog → BAD_REQUEST, no fallback.
- Valid enabled selection (gateway, MCP, or Hermes row) → returns the full `ModelDefinition` as before.
- Existing tests that asserted the fallback must be UPDATED to assert the throw (they encoded the bug).
- Call-site audit test: `generateVideoClip` (and any other caller found by grep) surfaces the BAD_REQUEST to the client instead of swallowing it.

### 3.4 Remediation row 10 — ad banner (extend `server/routers/__tests__/verticalDramaSeries.adBanner.test.ts` + `server/services/__tests__/verticalDramaAdBanner.test.ts`)

- `generateAdBannerImage` with `banner.generation.modelId` empty → BAD_REQUEST (`DEFAULT_MODELS.image` fallback gone; assert the lazy `DEFAULT_MODELS` import path is no longer the model source).
- Hermes model id on the banner → routes through the shared decision helper into `queueHermesMediaJob` (image operation), no platform-credit charge on the surface.
- MCP model id on the banner → routes through the decision helper into the MCP submit path (this surface gains MCP support as a side effect of the shared helper — assert it).
- Gateway model id → existing behavior byte-identical (pricing lookup, credit charge, `submitAdBannerImageGeneration`).

### 3.5 `media.ts` three-way branch (new `server/routers/__tests__/media.hermesGenerate.test.ts` or extend the existing async-generation suite)

- Async image procedure with a Hermes-transport model (or `input.transport === "hermes_worker"`) → `queueHermesMediaJob` called; returns MediaTask-shaped envelope with `hermes_` taskId; MCP and gateway fixtures unchanged (regression).
- Async video twin: same three cases.
- Input schema: `hermesConnectionId` accepted; `transport` enum accepts `"hermes_worker"`; `hermesConnectionId` with a non-hermes resolved transport → BAD_REQUEST.
- No upfront `hasEnoughCredits`/deduct for the hermes arm (creditSource `provider_account`).

### 3.6 Formatter family (extend the `verticalDramaVideoPromptFormatter` test suite)

- `resolveVerticalDramaProviderFamily` (and the underlying `detectGrokOrSeedance`) resolves `hermes-grok/grok-imagine-video` → `"grok"` — lock the behavior with a literal-id test even if the current substring match already passes, so a future rename cannot silently regress the prompt variant.
- Regression: existing kie.ai grok id and veo/seedance ids resolve unchanged.

## 4. Implementation guidance

### 4.1 The decision helper (two byte-equivalent copies, existing convention)

Add in `verticalDramaCharacters.ts` (exported, reused by locations — mirroring today's convention) and `verticalDramaEpisodes.ts` (private twin), keeping the two copies byte-equivalent apart from the export keyword and name prefix:

```ts
export type VdTransportDecision =
  | { kind: "gateway" }
  | { kind: "mcp"; transportMetadata: MediaTaskTransportMetadata }
  | { kind: "hermes"; connectionId: string };

/**
 * Transport-neutral generalization of resolveVd*McpTransportMetadata.
 * - hermes_worker model rows → { kind: "hermes" } with the explicit
 *   input.hermesConnectionId, else the caller's default authorized
 *   connection for the asset type (injected resolver), else BAD_REQUEST
 *   (HERMES_CONNECTION_REQUIRED copy) — fail closed, never gateway.
 * - everything else delegates to the EXISTING MCP helper unchanged:
 *   non-null → { kind: "mcp" }, null → { kind: "gateway" }.
 * - a hermesConnectionId supplied for a non-hermes model → BAD_REQUEST
 *   (mirror of section-08's mediaTransportResolver rule).
 */
export async function resolveVdCharacterMediaTransportDecision(params: {
  tenantId: string; actorUserId: number;
  assetType: "image" | "video";
  modelId: string; configJson: Record<string, unknown> | null;
  mcpConnectionId?: string; sharedGroupId?: number;
  hermesConnectionId?: string;
  idempotencyKey?: string;
}, deps?: { resolveDefaultHermesConnectionId?: (...) => Promise<string | null> }): Promise<VdTransportDecision>;
```

Key design point: **do not rewrite the MCP logic** — the decision function detects `resolveMediaModelTransportConfig(...).transport === "hermes_worker"` first, then delegates to the existing `resolveVd*McpTransportMetadata` for the remaining two arms. That makes the byte-identical MCP/gateway requirement trivially true and leaves the existing exported symbol (and its tests, and locations' import) untouched. The episodes twin is `resolveVdMediaTransportDecision` (private), delegating to the private `resolveVdMcpTransportMetadata`.

The default-connection resolver is a thin read over section-03's service (authorized connections for the caller, `defaultForImage`/`defaultForVideo` by asset type) — lazy-import it inside the function per the repo's lazy-import chain convention, and accept it as an injectable dep for tests.

### 4.2 Reference builder (small shared service)

New `server/services/hermesMediaReferences.ts`:

```ts
/** Convert an ordered VD reference set (media asset ids + roles + the
 *  "Image-N = <name>" labels from contactSheets.ts) into the contract's
 *  references[]: { assetId, index (1-based, continuous), role, label,
 *  sha256 }. sha256 comes from the media_assets checksum column; when
 *  absent, compute once by streaming the stored object and persist back
 *  (injectable hasher for tests). NEVER emits URL fields — the contract
 *  schema's .strict() would reject them (section-01), and minting is
 *  claim-time (section-06). */
export async function buildHermesMediaReferences(params: {
  tenantId: string; userId: number;
  orderedRefs: Array<{ assetId: string; role: string; label: string }>;
}, deps?: { repo?; hashObject? }): Promise<HermesMediaJobContract["references"]>;
```

Surfaces already hold the asset ids and the ordered ref assembly (e.g. `generateVideoClip`'s start-frame-first ordering at ~L11094–11210); this helper only normalizes shape + checksums. Trimming happens BEFORE this call (§4.5), the VD mapping validator runs on the trimmed set, then the contract parse inside `queueHermesMediaJob` is the final gate.

### 4.3 Wiring pattern per surface (rows 1–8)

Each resolver already: (a) fail-closes on missing model, (b) calls the transport helper, (c) branches MCP vs gateway. The change per surface is mechanical:

1. Accept optional `hermesConnectionId` in the procedure input zod (client threads it in section-10).
2. Replace the `resolveVd*McpTransportMetadata` call with the decision function; keep the `mcp`/`gateway` arms' existing code paths untouched.
3. `kind === "hermes"` arm: skip the credit reserve (same placement as the existing MCP zero-cost guard), build the contract — `operation` per §4.4, `prompt` from the already-authored skill-first prompt (no new prompt logic), `references` via §4.2, `settings.model` = the row's `providerModelId`, `entity` tagging the VD provenance (`{ type: "vertical_drama_character" | "vertical_drama_shot" | ..., id }` — same identifiers today written into `extraParams.__vd_*`), `traceId` from the auditContext — and call `queueHermesMediaJob({ ...contract, tenantId, requestedByUserId, idempotencyKey })`.
4. Return the same task-envelope shape the surface returns today (`{ taskId }` etc.) using the scheduler's `hermes_` taskId. Downstream persistence of the pending task id (shot plan entries, candidate rows) is format-agnostic — verify per surface, do not special-case.
5. Scheduler rejections already arrive as `TRPCError`s whose message was built with `formatHermesErrorMessage(code)` (pinned section-01 convention) — routers pass them through UNTRANSLATED; the client parses the `[HERMES_X]` prefix and renders `hermesErrorCopy` Thai/English itself. Do not re-wrap, re-word, or hand-write copy in routers.

Row 3 (portrait batch): loop candidates → one `queueHermesMediaJob` each with `idempotencyKey: \`${batchId}:${candidateId}\``; cap batch at 4 for hermes decisions (typed BAD_REQUEST above that); serialization on the connection is admission's running=1 — the surface just submits.

### 4.4 Operation mapping (frozen for this section)

| Surface | references | operation |
|---|---|---|
| Rows 1–8 + 10, no reference images | 0 | `image.generate` |
| Rows 1–8 + 10, ≥1 reference image | 1–3 (effective) | `image.edit` |
| Row 9 `generateVideoClip` (start frame always present) | start frame (+ trimmed extras when capability > 1) | `video.image_to_video` |

`video.generate` / `video.reference_to_video` are not produced by VD surfaces in this feature (Media Studio's video procedure may emit `video.generate` when no start image is provided; reference-to-video is phase-5, out of scope).

### 4.5 Reference trimming via effective capability (row 9 + image surfaces)

Where a surface resolves `maxReferenceImages` today (via `resolveVerticalDramaCapabilities` over the model row — e.g. `generateVideoClip` ~L11124–11131, ad banner's `resolveAdBannerImageModelPricing`), the hermes arm intersects it with the connection manifest: `effectiveHermesCapability(modelRowCaps, connection.capabilitiesJson, operation).maxReferences` (section-01 helper, min/AND semantics). Feed that number into the EXISTING trimming code ("identity before environment") — no new trimming logic. The connection row read **reuses section-03's exported `getHermesConnection`** (injectable in tests — do not write a second connection reader); when `capabilitiesJson` is null the model-row value stands (section-01 rule).

### 4.6 Remediation: `resolveEpisodeVideoModel` (`verticalDramaEpisodes.ts:2887`)

- Delete the `DEFAULT_MODELS.video` fallback AND the synthetic last-resort `ModelDefinition` (L2896–2908).
- Empty selection, unknown id, or disabled row → `throw new TRPCError({ code: "BAD_REQUEST", ... })` with bilingual copy matching `resolveEpisodeImageModelId`'s (L2860–2869 style).
- Rewrite the doc comment (it currently claims fail-closed symmetry it doesn't have — see plan §11; that lie is the bug's camouflage).
- Grep all call sites of `resolveEpisodeVideoModel` and confirm each lets the BAD_REQUEST propagate to the client (the UI surfaces model selection instead — section-10 handles the client state; server-side nothing may catch-and-default).

### 4.7 Remediation: ad banner (`verticalDramaSeries.ts:6679` + `verticalDramaAdBanner.ts`)

- Replace `banner.generation.modelId || DEFAULT_MODELS.image` (L6758) with a fail-closed guard: empty → BAD_REQUEST ("เลือกโมเดลภาพก่อนสร้างแบนเนอร์ / Select an image model…" — copy style of `resolveCharacterImageModelId`). Remove the lazy `DEFAULT_MODELS` import if now unused.
- Insert the decision helper (import the characters copy, as locations does) before the pricing/charge block: `mcp` → resolve transport metadata and pass it into the generation submit (extend `submitAdBannerImageGeneration` params with optional `transportMetadata`, mirroring `generateCharacterImage`'s call shape); `hermes` → build contract + `queueHermesMediaJob`, skip the credit charge; `gateway` → existing flow byte-identical.
- Router input gains optional `mcpConnectionId`/`sharedGroupId`/`hermesConnectionId` (the banner UI picker is section-10).

### 4.8 `media.ts` three-way branch

In both async procedures (image L2964–3044, video ~L3247–3310): compute `shouldUseHermesTransport = modelTransport.transport === "hermes_worker" || input.transport === "hermes_worker"` and branch BEFORE the MCP block. The hermes arm: tenant guard (same as MCP's), build contract (references from `input.referenceImageUrls` resolved to asset ids where the caller supplied library assets — Media Studio submits asset-backed references; raw external URLs are rejected with BAD_REQUEST for hermes, URLs cannot enter the contract), call `queueHermesMediaJob`, and return a MediaTask-shaped envelope (`id: taskId, status: "pending", creditsUsed: 0, ...` — mirror what `submitMcpMediaGeneration` returns so the client contract is unchanged). Widen the two input schemas: `transport: z.enum(["mcp","gateway_api","hermes_worker"]).optional()` (or the shared enum) + `hermesConnectionId: z.string().optional()`.

### 4.9 Formatter family

`detectGrokOrSeedance` (L275) already matches on substring `"grok"`, so `hermes-grok/grok-imagine-video` resolves to family `grok` with zero code change — but write the literal test (§3.6) to freeze it, and if the seed rows (section-08) carry aliases, assert the alias path too. Do NOT add transport awareness to the formatter: prompt style follows model family only.

## 5. Files summary

| File | Action |
|---|---|
| `server/routers/verticalDramaCharacters.ts` | edit — decision helper (exported) + hermes arms in rows 1–3 |
| `server/routers/verticalDramaLocations.ts` | edit — import decision helper, hermes arm in row 4 |
| `server/routers/verticalDramaEpisodes.ts` | edit — private decision twin, hermes arms rows 5–9, `resolveEpisodeVideoModel` remediation |
| `server/routers/verticalDramaSeries.ts` | edit — ad-banner fail-closed guard + transport routing (row 10) |
| `server/services/verticalDramaAdBanner.ts` | edit — accept transport metadata / hermes submit path |
| `server/routers/media.ts` | edit — three-way branch ×2 + input schemas |
| `server/services/hermesMediaReferences.ts` | create — assetId+sha256 reference builder |
| `server/routers/__tests__/verticalDramaCharacters.modelSelection.test.ts` | extend |
| `server/routers/__tests__/verticalDramaLocations.test.ts` | extend |
| `server/routers/__tests__/verticalDramaEpisodes.hermesTransport.test.ts` | create (decision twin, rows 5–9, remediation 9, trimming) |
| `server/routers/__tests__/verticalDramaSeries.adBanner.test.ts` + `server/services/__tests__/verticalDramaAdBanner.test.ts` | extend (remediation 10) |
| `server/routers/__tests__/media.hermesGenerate.test.ts` | create |
| formatter test suite (`verticalDramaVideoPromptFormatter*`) | extend (grok family) |

## 6. Verification

1. New/extended tests red → implement → green: `pnpm --dir apps/web test -- verticalDrama` and `-- media.hermes`.
2. **Zero-regression gate:** the full `pnpm --dir apps/web test` run passes with existing MCP/gateway transport tests UNCHANGED (except the two remediation suites, whose fallback assertions are deliberately flipped to throw-assertions).
3. `pnpm --dir apps/web check` typecheck clean (no new errors beyond the known pre-existing baseline).
4. Section-01 namespace-guard test still green (no `queueHermesWorkerJob`/`hermesAgentRuntime` in edited/new files).
5. Grep gate: no `DEFAULT_MODELS.video` reference in `resolveEpisodeVideoModel`; no `DEFAULT_MODELS.image` in the ad-banner path; no URL-shaped fields in any `HermesMediaJobContract` construction (`references` built only via `buildHermesMediaReferences`).
6. Acceptance mapping: each of the 10 rows of spec §11.5's table has at least one passing test proving Hermes routing + one proving the fail-closed empty-model guard.
---

## IMPLEMENTED — 2026-07-16 (as-built record)

Status: ✅ complete. New/extended tests green: characters.hermesTransport 4,
hermesMediaReferences 17, media.hermesGenerate 6, adBanner 24+24,
episodes.modelSelection 14, formatter 31, storyboardReviewWorkspace 37.
Typecheck baseline unchanged.

Review found 2 BLOCKERs — both fixed:

1. **Hermes jobs were blocked by the platform-credit gate** in
   `generateCharacterImage` + `generateCharacterSheet` (credit check ran
   BEFORE transport resolution, so a provider_account job could be denied
   for lack of SmartSpec credits). The other 8 surfaces were already
   correct. Now all four VD routers guard every credit path with
   `transportDecision.kind !== "hermes"` (characters 5, episodes 5,
   locations 1, series 1 guards) + spy-asserted tests.
2. Test edits existed only unstaged (the index would have shipped router
   changes against stale assertions). All six reviewer-named test files
   now land with the code.

Also from review: row 4 (locations) gained its missing hermes-routing
tests; dropped references are no longer silent —
`resolveHermesOrderedRefsFromUrls` audits each drop (traceId +
connectionId, never URL/content) and surfaces `droppedReferenceCount`
through the task envelope + mutation responses (7 VD call sites; media.ts
keeps its hard-reject).

Correction to an earlier assumption: `resolveEpisodeImageModelId`'s
fail-closed behavior predates this section (only tests were added here) —
the two declared remediations (row 9 `resolveEpisodeVideoModel`, row 10
ad banner) are exactly what this section changed.

Known pre-existing failures in the touched test files (verified
identical without this section's code, tracked separately as
task_bf5fa5be): the MCP `mcpConnectionId`-required guard removed by a
concurrent session's auto-resolve change (1 in characters, 1 in
locations) and 55 in episodes.shotReferencesAndQualityReview from other
in-flight work.

Review trail: `../implementation/code_review/section-09-{diff,review,interview}.md`.
