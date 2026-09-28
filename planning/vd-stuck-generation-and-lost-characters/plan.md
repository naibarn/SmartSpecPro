# VD Stuck Character Generation + Lost-Character Detection (2026-07-16)

Two investigations (read-only) produced this plan. Both confirmed with file:line.

## Set A — Stuck / policy-rejected character portrait candidates never clear

Screen: "เลือกใบหน้าที่จะใช้เป็นตัวละครหลัก" candidate grid (variants 1/2/3). Code path
`generatePortraitCandidateBatch` → `settlePortraitCandidate` → `selectPortraitCandidate`
(NOT the single-portrait `generateCharacterImage`/`pollCharacterImageTask` path).

### Confirmed gaps (all TRUE)
1. Client poll timeout (30min) toasts once but never sets a terminal card status →
   card frozen at "กำลังสร้าง…" forever in that tab
   (`VerticalDramaCharacterStockPanel.tsx:2059-2065`, finally `:2070-2076`).
2. No automatic re-poll after timeout; `resumedPortraitCandidateTasksRef` blocks
   re-trigger within the mount (`:2110-2117`, `:2582-2599`).
3. Merge in `selectedPortraitCandidateBatches` (`:2748-2774`) only propagates durable
   `selected`/`superseded`; a later durable `failed` (+errorMessage) is NEVER copied
   over the frozen in-memory `queued` status → rejection never surfaces in that tab.
4. No per-candidate cancel/retry/delete affordance once a batch is submitted
   (footer gated by `isPreviewOnly` `:4755-4757`). `deleteAsset` exists server-side
   (`verticalDramaCharacters.ts:2116-2134`) but is not wired to any button here.
5. Background reconciler `reconcileStaleMcpMediaTasks` (`mcpMediaAdapter.ts:1498-1559`,
   hard timeout 24h `:44-47`) force-fails only `mcp_media_tasks`; it never cascades to
   `verticalDramaCharacterAssets.metadata.portraitCandidate.status` and never calls
   `reconcileTaskCredits`. Only a fresh `settlePortraitCandidate` (`verticalDramaCharacters.ts:1129-1278`)
   does both — and nothing calls it again once the client stops polling.
6. Credits reserved at submit (`verticalDramaCharacters.ts:965-1013`) are refunded only
   inside `settlePortraitCandidate`'s `failed` branch via `reconcileTaskCredits`
   (`media.ts:671-722`) → held indefinitely when that never re-runs.
7. No content-policy auto-soften for character candidates.
   `isCharacterLockPolicyFailureMessage`/`VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL`
   (`characterLock.ts:189-192`) used ONLY in start-frame/shot paths.

Start-frame comparison: same 30-min-timeout-with-no-terminal-state, but start-frame
has NO merge-suppression bug AND HAS auto-soften. Character candidate path is strictly worse.

### Fixes
- A-client (`VerticalDramaCharacterStockPanel.tsx`):
  1. Poll timeout → `updatePortraitCandidateUi(status:"failed", errorMessage:"timed out")`
     so the card visibly stops (not just a toast).
  2. Merge: also propagate durable `failed`/`completed` (with errorMessage/imageUrl)
     from `saved`, so a backend-corrected row always advances a stuck in-memory status.
  3. Per-candidate Cancel/Retry button for `queued`/`submitting` candidates: Cancel →
     `deleteAsset` (unstick); Retry → resubmit the same slot (fresh idempotency key).
  4. Client auto-soften: on a policy-classified `failed`, resubmit with `softenLevel+1`
     up to `VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL` (mirror `pollStartFrameTask`) — IF the
     server candidate submit accepts a softenLevel (see A-server); else surface the
     policy message + one-click Retry and note the deferral.
- A-server:
  5. `reconcileStaleMcpMediaTasks` (or companion sweep): when force-failing a task
     tagged with the VD portrait-candidate marker (`__vd_portrait_candidate_asset_link_id`
     in `task.parameters`), also call `markPortraitCandidateSubmissionFailed`
     (`verticalDramaCharacterStock.ts:840-863`) + `reconcileTaskCredits` so the VD row
     and credit refund don't depend on the browser tab. (fixes 5 & 6.)
  6. `settlePortraitCandidate` failed branch: classify via `isCharacterLockPolicyFailureMessage`
     and (if the candidate submit path can accept a soften level) support a soften
     resubmit; otherwise persist a clear policy errorMessage the client can show.

## Set B — No UI to detect story-introduced characters with no slot / no DNA/portrait

`ensureRosterCharactersFromStory` (`verticalDramaCharacterRosterAutoRegister.ts:295-391`)
inserts a row (name+characterKey, `roleTier:null`, `roleReviewStatus:"needs_role_review"`,
`data.source:"auto_registered_from_story"`) during deep-draft generate/extend ONLY
(`verticalDramaSeries.ts:1644`,`:2033`) — no DNA, no portrait. Its `VdRosterAutoRegisterSummary`
return value (incl. createdCharacters) is DISCARDED at both call sites.

### Confirmed gaps
- No query/endpoint computing "dialogue speaker with no roster row" or "auto-registered
  row lacking DNA/portrait". `characterRowToDto` (`verticalDramaCharacters.ts:693-721`)
  returns `roleReviewStatus`/`roleProvenance`/raw `data` but no completeness field.
- UI only shows an amber "ต้องตรวจบทบาท" badge from `roleReviewStatus`
  (`VerticalDramaCharacterStockPanel.tsx:3228`,`:4164`,`:4270`) — a coincidental proxy
  (fires for any role-tier-null character; disappears once a role is set even if still
  no portrait). No `data.source` read anywhere in client. No filter/count/toast.

### Fixes
- B-server:
  1. `characterRowToDto`: add `needsSetup: boolean` + `needsSetupReasons` (e.g.
     `auto_registered_from_story`, `missing_portrait`, `missing_dna`) computed from
     `data.source`, an approved/generated portrait asset lookup, and `data.description`.
  2. Return `createdCharacters` (count + names) from the deep-draft generate/extend
     mutation responses (like `createdLocationCount` already does at `:1624`/`:2018`).
- B-client (`VerticalDramaCharacterStockPanel.tsx`):
  3. Distinct badge "auto-สร้างจากเรื่อง — ยังต้องทำ DNA/ภาพ" driven by `needsSetup`
     (separate from the role-review badge) + a filter/sort toggle to jump to incomplete rows.
  4. Toast/banner after a deep-draft generate/extend succeeds: "สร้างตัวละครใหม่ N ตัว
     ต้องตั้งค่า DNA/ภาพ" using the returned `createdCharacters`.

## Sequencing (avoid same-file concurrent edits)
- Wave 1 (parallel, disjoint files): A-server (server files) ‖ A-client (panel).
- Wave 2 (after A-server, same `verticalDramaCharacters.ts`): B-server.
- Wave 3 (after A-client + B-server): B-client (panel; needs `needsSetup` DTO field).
- Then verify + build:deploy + restart web (server changed).

## Status
- [x] Investigation (both, read-only)
- [x] A-server (fixes 5, 6, 7-server-half) — files: `server/services/mcpMediaAdapter.ts`,
  `server/services/verticalDramaCharacterStock.ts`, `server/routers/verticalDramaCharacters.ts`,
  `shared/verticalDramaSeries/characterAssets.ts`:
  1. **VD portrait-candidate marker key** (confirmed): `__vd_portrait_candidate_asset_link_id`,
     read from `task.parameters.extraParams` (MCP-transport tasks store submission
     `extraParams` verbatim there — `buildMcpServiceParameters` in
     `mediaGenerationService.ts`). Companion markers on the same task:
     `__vd_series_id`, `__vd_character_id`, `__vd_portrait_candidate_batch_id`,
     `__vd_portrait_candidate_id`, `__reserved_credits`, `__origin_surface`.
  2. **Reconciler cascade (fixes 5 & 6)** — new
     `cascadeFailedVdPortraitCandidateTask(task: MediaTask): Promise<void>` in
     `mcpMediaAdapter.ts`, called from `reconcileStaleMcpMediaTasks`'s per-task
     loop whenever `refreshMcpMediaTaskStatus` resolves a task to `"failed"`
     (covers all 3 failure paths: hard timeout, provider-positively-rejected,
     provider-reported-failed — the hook is at the sweep-loop level, not inside
     `refreshMcpMediaTaskStatus`, so the client-triggered `getTask`/
     `settlePortraitCandidate` poll path is untouched). No-ops for any task
     without the marker (non-VD tasks — generic reconcile behavior unchanged).
     Lazy `import()`s both `reconcileTaskCredits` (`../routers/media` — avoids
     pulling `adminProcedure`/tRPC router wiring into this bootstrap-loaded
     module; same convention `settlePortraitCandidate` already uses) and
     `verticalDramaCharacterStockService` (`./verticalDramaCharacterStock` —
     no actual cycle today, lazy for footprint symmetry). Small local
     `readVdPortraitCandidateTaskMarker` helper duplicates (not imports)
     `verticalDramaCharacters.ts`'s private `readMediaTaskInternalParameter`.
  3. **Idempotency**: centralized inside
     `VerticalDramaCharacterStockService.markPortraitCandidateSubmissionFailed`
     (signature unchanged: `{ ...owner, assetLinkId: number, errorMessage: string }
     => Promise<void>`) — it now only acts when the candidate's durable status
     is still `"submitting"`/`"queued"`; any other status (`failed`, `completed`,
     `selected`, `superseded`) is left untouched (no DB write). This covers BOTH
     callers (background sweep and client-triggered `settlePortraitCandidate`)
     without per-call-site guards. `reconcileTaskCredits`'s own pre-existing
     Redis idempotency key (`credit:reconciled:${task.id}`) covers the refund
     side — unchanged, reused as-is.
  4. **Policy classification (fix 7, server half)** — also centralized inside
     `markPortraitCandidateSubmissionFailed`: classifies via
     `isCharacterLockPolicyFailureMessage` (`@shared/verticalDramaSeries/characterLock`).
     Persists a NEW `errorMessage`/`policyRejected` pair under
     `metadata.portraitCandidate` (raw provider text is UNCHANGED, still in
     `submissionError`, for audit) AND — to close the loop with the
     already-shipped A-client fix below, which reads the asset-level
     `rejectionReason` (`characterAssetRowToContract`) since
     `portraitCandidate.errorMessage` didn't exist when that wave landed — the
     SAME display text is also written to root `metadata.rejectionReason`.
     New exported constant `VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE`
     (Thai) in `verticalDramaCharacterStock.ts`, single source of truth,
     reused by `settlePortraitCandidate`'s failed-branch immediate RPC
     response (now also returns `policyRejected: boolean` and a classified
     `errorMessage`, additive fields). Shared type
     `VerticalDramaPortraitCandidateProjection` (`characterAssets.ts`) gains
     optional `errorMessage`/`policyRejected` (bounded, non-secret lifecycle
     fields — never a prompt/DNA snapshot), and `projectPortraitCandidateMetadata`
     now projects them.
  5. **Soften: DEFERRED, not implemented.** Checked whether the candidate
     submit path could accept a `softenLevel` the way
     `generateStartFrameImage`/`generateShotImageAction` do (soften authored
     by the `vertical-drama-shot-image-action` skill). No equivalent exists
     for character-portrait-candidate prompts: candidates are all batch-authored
     in ONE LLM call by the `vertical-drama-character-visual-bible` skill
     (`verticalDramaCharacterImageGeneration.ts`), which has no `soften_level`
     input or single-candidate re-authoring entry point. Building one would be
     a real new feature (new skill action + re-authoring call), not a
     surgical fix — deliberately out of scope here, matching the A-client
     agent's independent same conclusion (`generatePortraitCandidateBatch`'s
     Zod input has no `softenLevel` field). Mitigation shipped instead: a
     clear, classified Thai policy message (`VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE`)
     surfaced both durably and in the immediate RPC response, so the client's
     already-shipped manual Retry (`TODO(soften)` in the panel) has something
     clear to show. A future soften feature can wire a `softenLevel` field
     onto `generatePortraitCandidateBatch`'s resubmit input once that
     skill-authoring path exists.
  Tests: extended `mcpMediaAdapter.reconciler.test.ts` (4 new: cascade fires
  + refunds + marks failed; non-VD task untouched; per-call error isolation;
  incomplete-marker skip), `verticalDramaCharacterStock.test.ts` (6 new:
  raw-vs-classified errorMessage, `rejectionReason` mirror, 3x idempotency —
  selected/failed/completed all untouched), `verticalDramaCharacters.customInstruction.test.ts`
  (2 new: immediate-response classification, generic vs policy). `npx vitest run`
  on all 3 files: 50 passed, 12 failed — the 12 failures are PRE-EXISTING and
  unrelated (verified via `git diff --stat` showing zero diff in `media.ts`/its
  own contract test, and a 677-insertion pre-existing uncommitted diff already
  in `verticalDramaCharacters.ts` before this task started, from other in-flight
  work — `resolveCharacterImageModelId` now requires an explicit model id these
  older tests don't pass). `pnpm check` (`tsc --noEmit`, 8GB heap): 0 new errors
  in any of the 7 files touched (baseline has ~140 pre-existing errors elsewhere,
  none in these files).
- [x] A-client — `VerticalDramaCharacterStockPanel.tsx`:
  1. Poll timeout → `updatePortraitCandidateUi(status:"failed", ...)` via new
     `buildPortraitCandidateTimeoutPatch(lang)`; also fixed the adjacent
     `catch` block (thrown poll error) to set `status:"failed"` too, same bug
     class.
  2. Merge fix (`selectedPortraitCandidateBatches`) → extracted pure
     `mergeDurablePortraitCandidateStatus`: durable `failed`/`completed` now
     also advance a stuck in-memory non-terminal candidate;
     `selected`/`superseded` still win unconditionally (unchanged); an
     already-terminal in-memory status is never downgraded. Reads the
     failure message from `asset.rejectionReason` (the one field the current
     DTO already exposes for this — `portraitCandidate` itself carries no
     `errorMessage` yet; forward-compatible with whatever A-server lands).
  3. Per-candidate Cancel/Retry buttons (queued/submitting/failed) wired to
     `trpc.verticalDramaCharacters.deleteAsset` (Cancel — already
     auto-invalidates) and a fresh single-candidate
     `previewCharacterPrompt` → `generatePortraitCandidateBatch` resubmit
     (Retry — `claimPortraitCandidateBatch` requires ALL rows in a
     `batchId` at `status:"previewed"`, so the same `batchId` can never be
     resubmitted after first submission; a new `batchId` gives a fresh
     idempotency key instead, per the plan's own fallback instruction).
  4. Auto-soften: **deferred to manual Retry** — confirmed
     `generatePortraitCandidateBatch`'s Zod input
     (`server/routers/verticalDramaCharacters.ts:909-920`) has no
     `softenLevel` field, unlike `generateStartFrameImage`/
     `generateShotImageAction`. Added `shouldAutoSoftenPortraitCandidate`
     (always `false` today, gated by `PORTRAIT_CANDIDATE_SOFTEN_SUPPORTED`)
     + a policy-classified-failure toast pointing at Retry +
     `TODO(soften)` comment for A-server to wire when/if it adds the field.
  Tests: `__tests__/VerticalDramaCharacterStockPanel.portraitCandidateRecovery.test.ts`
  (11 new tests on the extracted pure helpers, following this file's
  established pure-function-test convention). `npx vitest run` on all 9
  `VerticalDramaCharacterStockPanel*.test.ts*` suites: 78/78 passing.
  `pnpm check`: no new errors (0 errors reference this file; remaining
  errors are the pre-existing `packages/ui`/`webhookDeliveryService`
  baseline).
- [x] B-server — files: `server/routers/verticalDramaCharacters.ts`,
  `server/routers/verticalDramaSeries.ts`,
  `shared/verticalDramaSeries/characterAssets.ts`:
  1. **`characterRowToDto` completeness fields** (DTO contract for B-client):
     `needsSetup: boolean` + `needsSetupReasons: VdCharacterNeedsSetupReason[]`
     where `VdCharacterNeedsSetupReason = "auto_registered_from_story" |
     "missing_portrait" | "missing_dna"` (new shared type + `VD_CHARACTER_NEEDS_SETUP_REASONS`
     const, `shared/verticalDramaSeries/characterAssets.ts` — re-exported via
     the `@shared/verticalDramaSeries` barrel). `needsSetup =
     needsSetupReasons.length > 0`. Computed by new pure/exported
     `computeCharacterNeedsSetupReasons({ data, hasApprovedOrGeneratedPortrait })`
     in `verticalDramaCharacters.ts`:
     - `"auto_registered_from_story"` — `data?.source === "auto_registered_from_story"`.
     - `"missing_portrait"` — only added when `hasApprovedOrGeneratedPortrait === false`
       (an explicit `true`/`false` from a batched lookup); `undefined` (unknown,
       no batched lookup available) deliberately does NOT add this reason —
       avoids a false positive rather than guessing.
     - `"missing_dna"` — DNA field confirmed to be **`data.description`**
       (same field `extractCharacterDescription` already treats as the
       authoritative physical/demographic source for the portrait prompt) —
       empty/whitespace/absent triggers this reason.
     `characterRowToDto` gained a new options key
     `hasApprovedOrGeneratedPortrait?: boolean`; every pre-existing call site
     (createCharacter, updateCharacter, createCharacterVariant,
     createCharacterTwin, the single-character generate/update paths) omits
     it — byte-identical `needsSetup`/`needsSetupReasons` computation for
     those (never asserts `missing_portrait` without knowing), no behavior
     change to any other field.
  2. **Batched portrait lookup — no N+1**: only `listCharacters` passes
     `hasApprovedOrGeneratedPortrait`, derived from the `manifest` it
     ALREADY loads via `verticalDramaCharacterStockService.getManifest(...)`
     (one query, pre-existing) — a `Set<characterId>` built by filtering
     `manifest.assets` for `role === "primary_portrait"` AND `state` in
     `("approved", "generated", "imported")` (same selection rule
     `VerticalDramaCharacterStockPanel.tsx`'s `resolveCharacterCardPortraitAsset`
     roster-thumbnail logic uses, so the badge and the thumbnail never
     disagree). Zero additional DB round trips.
  3. **`createdCharacters` on deep-draft generate/extend responses**:
     `ensureRosterCharactersFromStory`'s return value (`VdRosterAutoRegisterSummary`,
     previously discarded at both call sites) is now captured and projected
     via a new `toDeepDraftCreatedCharactersSummary` helper into
     `createdCharacters: { count: number; names: string[] }` — new exported
     `VdDeepDraftCreatedCharactersSummary` interface + an
     `EMPTY_DEEP_DRAFT_CREATED_CHARACTERS` (`{ count: 0, names: [] }`) constant
     in `verticalDramaSeries.ts`, mirroring the pre-existing
     `createdLocationCount` convention (always present, never `undefined`,
     falls back to empty on any error — the auto-register block stays
     best-effort, a failure there must not fail the mutation). Present in:
     - `runGenerateStoryBibleDeepJob`'s early-return "nothing to draft" branch
       (`createdCharacters: EMPTY_DEEP_DRAFT_CREATED_CHARACTERS`, mirrors that
       branch's `createdLocationCount: 0`) AND its normal return.
     - `runExtendStoryDraftHorizonJob`'s single return point.
     These are the two BullMQ job-executor functions the async
     `generateStoryBibleDeep`/`extendStoryDraftHorizon` tRPC mutations enqueue
     (mutation itself returns `{jobId, deduped}` and the client polls job
     status) — `createdCharacters` lands in the polled job **result**, same
     place `createdLocationCount` already does (confirmed via
     `VerticalDramaDeepStoryDraftsPanel.tsx`'s `resolveDeepDraftCreatedLocationsCount`
     reading `result.createdLocationCount`).
  Tests: new `verticalDramaCharacters.needsSetup.test.ts` (6 tests,
  `computeCharacterNeedsSetupReasons` pure-helper coverage: auto-registered +
  no-portrait/DNA -> all 3 reasons; fully-built -> `[]`; unknown portrait
  signal skips `missing_portrait` rather than guessing; whitespace-only /
  null/undefined `data` -> `missing_dna`; manual character never gets
  `auto_registered_from_story`). New `verticalDramaSeries.deepDraftCreatedCharacters.test.ts`
  (5 tests, isolated from the large shared `deepStoryDrafts.test.ts` because
  that file never mocks `verticalDramaCharacterRosterAutoRegister` — mocks it
  directly here to assert `createdCharacters` flows through for both jobs,
  defaults to empty on zero-created and on a rejected auto-register call).
  `npx vitest run` — new files: 11/11 passing. Full affected-file check:
  `verticalDramaCharacterRosterAutoRegister.test.ts` 9/9 passing;
  `verticalDramaCharacters.{characterSheetType,customInstruction,extractDescription,manualVariantTwinCrud,modelSelection,voiceChain}.test.ts`
  + `verticalDramaCharacterStock.test.ts`: 133 passed, 12 failed — all 12
  failures confined to `verticalDramaCharacters.customInstruction.test.ts`,
  same `resolveCharacterImageModelId` pre-existing failure class the A-server
  agent already documented above (unrelated to `characterRowToDto`/DTO
  fields, confirmed by reading each failure's stack — none touch
  `characterRowToDto`/`listCharacters`). `verticalDramaSeries.deepStoryDrafts.test.ts`:
  59 passed, 1 pre-existing failure (`updateEpisodeDraftDialogue` happy path;
  confirmed pre-existing via `git diff --stat` on `verticalDramaSeries.ts`
  showing a 725-insertion diff already present before this task started, and
  the failing assertion sits in a code path this task never touches —
  `presetCharacterProfileSchema`/`characterProfiles` wiring from other
  in-flight work). `pnpm check` (8GB heap): 140 pre-existing errors, ALL in
  `packages/ui` (unrelated `Ref<HTMLElement>` typing) — 0 errors in any of
  the 3 files this wave touched
  (`verticalDramaCharacters.ts`/`verticalDramaSeries.ts`/`characterAssets.ts`).
  Deviation from the brief: did not add `createdCharacters` to
  `recordDeepStoryDraftAuditEvent`'s audit-event metadata (unlike
  `createdLocationCount`, which IS in that event) — out of the literal ask
  ("mutation response object" only) and kept out to stay surgical; a
  follow-up can add it if the audit trail should track this too.
- [x] B-client — files: `VerticalDramaCharacterStockPanel.tsx`,
  `VerticalDramaDeepStoryDraftsPanel.tsx`, `verticalDramaCopy.ts`:
  1. **Distinct "needs setup" badge** — new pure `needsSetupBadgeLabel(lang,
     reasons)` (module scope, near `getCanonicalRoleLabel`), rendered from
     `character.needsSetup`/`needsSetupReasons` in BOTH the roster list row
     (after the amber role-review badge) and the selected-character detail
     card (same relative position), using a distinct fuchsia badge style
     (`border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700` / dark variants) so
     it never visually collides with the amber `roleReviewStatus ===
     "needs_role_review"` badge — the two are driven by independent DTO
     fields and can show/hide independently. `auto_registered_from_story`
     always wins the composed label (most actionable); otherwise composes
     from `missing_portrait`/`missing_dna`. Inline Thai/English strings
     (matches this panel's existing `getCanonicalRoleLabel`/badge
     convention — no `VD_COPY`/copy-module entry needed here since none of
     the nearby badges use one either).
  2. **Filter/jump to incomplete** — new pure `filterRosterEntriesNeedingSetup`
     + `countCharactersNeedingSetup` (next to `buildCharacterRosterEntries`,
     same file). `VdRosterCharacterFields` gained optional
     `needsSetup`/`needsSetupReasons`. New `showOnlyNeedsSetup` state (off
     by default) + a count chip Button ("เฉพาะที่ต้องตั้งค่า (N)") in the
     roster Card's header, only rendered when `needsSetupCount > 0`; toggling
     it swaps the `<ul>`'s source from `rosterEntries` to
     `visibleRosterEntries`, with a distinct empty-state message when the
     filtered list is empty but the full roster isn't.
  3. **Post-deep-draft toast** — new `resolveDeepDraftCreatedCharactersSummary`
     (mirrors `resolveDeepDraftCreatedLocationsCount`'s tolerant-read
     convention, `VerticalDramaDeepStoryDraftsPanel.tsx`) reads the job
     result's `createdCharacters: {count, names}`; new Copy Contract
     `deepStoryDraftsNewCharactersCreatedText(lang, count, names?)`
     ("สร้างตัวละครใหม่ {n} ตัวจากเนื้อเรื่อง — ต้องตั้งค่า DNA/ภาพ", names
     appended in parens when non-empty) in `verticalDramaCopy.ts`. Wired
     into the SAME `pollStoryJob`'s `onSucceeded` handler that already
     surfaces `deepStoryDraftsNewLocationsCreatedText` (single shared
     handler for both `deep_generate` and `extend` job kinds) as a SEPARATE
     `toast.info(...)` call placed right after the locations toast — both
     fire independently in the same run when a chunk introduces new
     locations AND new characters, so they compose rather than overwrite.
  Tests: new `VerticalDramaCharacterStockPanel.needsSetup.test.ts` (10
  tests: badge label composition incl. auto-registered precedence and the
  empty-reasons fallback; count; filter incl. the parent-complete-but-
  variant-incomplete case). Extended
  `VerticalDramaDeepStoryDraftsPanel.pureHelpers.test.ts` (+4 tests for
  `resolveDeepDraftCreatedCharactersSummary`) and
  `verticalDramaCopy.deepStoryDrafts.test.ts` (+4 tests for
  `deepStoryDraftsNewCharactersCreatedText`). `npx vitest run` on all 4
  touched/new suites: 138/138 passing. Broader sweep across every
  `VerticalDramaCharacterStockPanel*`/`VerticalDramaDeepStoryDraftsPanel*`
  suite: 271 passed, 5 failed — all 5 confined to
  `VerticalDramaDeepStoryDraftsPanel.improveScript.test.tsx` (unrelated
  "ตอน" vs "ตอนย่อย" terminology-drift assertions in
  `VerticalDramaImproveScriptCard.tsx`, a component this task never
  touched; confirmed pre-existing via `git status --porcelain` showing zero
  diff on both that test file and the component). `pnpm check` (8GB heap):
  0 errors reference any of the 3 files this wave touched; remaining errors
  are the same pre-existing `packages/ui`/ioredis-dual-version/editor/
  dashboard baseline noted by A-server/B-server above, confirmed by
  grep-filtering the full error list for this wave's 3 filenames (zero
  hits).
- [x] Verify + deploy — 2026-07-16 09:16 (+07): conductor traced full A+B wiring (server rejectionReason→client asset.rejectionReason; reconciler cascade keys __vd_portrait_candidate_asset_link_id; cancel→deleteAsset, retry→preview→batch; needsSetup DTO→badge/filter; createdCharacters job-result→toast) — no dangling. 197 new A+B tests pass; build:deploy + web restart (backend untouched, stays up); web :3000→200. Soften DEFERRED both sides (candidate submit has no softenLevel — manual Retry + clear policy message cover it).
