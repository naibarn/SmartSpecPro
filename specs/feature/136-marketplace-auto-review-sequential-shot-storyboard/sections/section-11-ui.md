# Section 11 — UI (strategy option, angle chips, evidence review, guardian notice, per-shot cards)

<!-- SECTION_META
id: section-11-ui
source: claude-plan.md WS-11, claude-plan-tdd.md WS-11
spec: spec.md v1.3.0 §21 (all), §17.5 (guardian notice copy), §12.6 (targetAudience/userRequirements), §8.2–8.3 (angles + capacity), §16.4 (loop report), §18.4 (per-shot regen + edits), §19.2 (metadata shape), §23.1/§23.2 (blockers/warnings)
depends_on: section-05-evidence-plan-surface, section-07-evidence-guard-shared
soft_inputs: section-01 (flag + enum + override fields), section-02 (angle payload + labels), section-06 (run metadata shots), section-08 (regen/edit mutations)
blocks: nothing
runtime: typescript-npm
test_command: npm --prefix apps/web run test
milestone: M2 (core UI partial) → M5 (evidence UI + GA)
END_SECTION_META -->

All user-visible copy is bilingual through `hyperframesUiCopy.ts`. All new UI is additive and **invisible when the tenant flag `marketplaceSequentialStoryboard` is off or the resolved strategy is not `sequential_shot_storyboard`**. This section contains **no server logic and adds no tRPC procedure** — it renders data produced by sections 05/06/07 and calls mutations owned by section 08.

---

## 1. Objective

Five user-facing deliverables (spec §21):

1. **Strategy selection** — `sequential_shot_storyboard` appears in the advanced-overrides `frameStrategyOptions` **only when the tenant flag is on**, plus an always-visible active-strategy label on the Auto plan summary card (§21.1).
2. **Multi-angle product references** — per-image angle chips (front/back/side/top/base/detail/package/parts_diagram/scale/other, default `other`), a live capacity meter `ใช้ได้ {n}/{modelCap} ภาพอ้างอิงต่อภาพ (โมเดล {model})`, a trim-warning chip listing angles that will be dropped, and evidence-only labels for `package`/`parts_diagram` (§21.2, §8.3).
3. **Evidence & conflict review** — a collapsible section (default **collapsed**, interview decision 9) in the Auto panel: read-only verified-highlight chips, `needsConfirmation` rows with **ยืนยัน / ตัดออก** → `confirmedAttributes` override, a free-text **"คำที่ห้ามใช้"** → `forbiddenClaims`, and two new optional free-text fields **"กลุ่มเป้าหมาย (ไม่บังคับ)"** → `targetAudience` and **"ความต้องการเพิ่มเติม (ไม่บังคับ)"** → `userRequirements` (§21.3, §21.6, §12.6).
4. **Guardian notice** — the §17.5 informational notice rendered **only** when `childSubjectPolicy` is active, pointing at the existing "อัปโหลด reference" character flow; **no opt-out control may exist**. The `characterPresenceMode` label "การปรากฏของบุคคลในภาพ 3x3" is generalized to "การปรากฏของบุคคลในภาพ" **only when the selected strategy is sequential** (§21.4, §17.4).
5. **Per-shot review & loop report** — per-shot cards on the Storyboard Review page showing dialogue, both prompts with character counts, claim sources, QC status, guardian badge, `demonstration_type`, a **"สร้างภาพนี้ใหม่"** action, editable fields whose save surfaces the specific server preflight blocker, and a **Loop Report** section (rounds, candidate counts, selected version) (§21.5, §18.4, §16.4).

Existing pickers (tone / story structure / motion direction / creative presets / character mode / model selectors) are **untouched and unrelocated** (§21.6).

---

## 2. Background — verified anchors and platform facts (read once; this section is self-contained)

Line numbers verified 2026-07-21/22; re-locate by symbol name before editing (concurrent sessions edit this repo).

| File | Anchor | What is there / why it matters |
|---|---|---|
| `apps/web/client/src/components/marketplaceCapture/AutoStoryboardAdvancedOverrides.tsx` | `:276-285` | `frameStrategyOptions` (currently `storyboard_3x3_split`, `video_shot_start_stop`) |
| same | `:48-53` | `baseAutoDefaultValues` = `HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES` + a pinned `characterPresenceMode: "auto"` (memory: **pin enum defaults here** or "auto" never prunes) |
| same | `:55-85` | `overrideValueString` / `pruneBaseAutoDefaultOverrides` / `overridesEqual` — **string-based** comparison |
| same | `:208-229` | `labels.characterPresenceMode` ("การปรากฏของบุคคลในภาพ 3x3" / "Character presence in 3x3 frames") + `fieldLabels` map used by the override-diff display |
| same | `:379-406` | `update(key, nextValue)` + the `useEffect` that re-emits the pruned value |
| same | `:99-170` | `AutoStoryboardStoryMotionFields` — precedent for a small always-visible fields component writing into the SAME overrides object |
| `.../AutoStoryboardReviewPlanSummary.tsx` | `:138-165` | the three summary cards (Template / Platform / Estimate) — strategy card goes here |
| `.../hyperframesUiCopy.ts` | whole file | `getMarketplaceHyperframesUiCopy(locale)` returns **two object literals** (th / en). A key added to only one branch breaks type inference at every call site — always add to both |
| `apps/web/client/src/hooks/useTenantFeatureFlag.ts` | `:89`, `:98` | `useTenantFeatureFlag(key)` / `useTenantFeatureFlags()` (TanStack query + `FEATURE_FLAG_DEFAULTS` fallback) |
| `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx` ("MPCPD", 8,534 lines) | `:2468` | `const tenantFeatureFlags = useTenantFeatureFlags();` already in the page |
| MPCPD | `:3793-3854` | `productImageOptions` (id/url/type/source/hash/isHero/index/removableId), `resolvedProductAnchorImage`, `resolvedProductAnchorImageUrl` — the primary anchor |
| MPCPD | `:8107-8230` | Product-images grid (Media Panel) — chips mount point #1 |
| MPCPD | `:6530-6560` | Auto-panel compact product picker — chips mount point #2 (same state) |
| MPCPD | `:4312-4520` | `buildAutoReviewReferenceAnchors` — **section 02 owns** the `productAngleImages[]` emission; this section supplies the selection state |
| MPCPD | `:5234-5316` | The Auto panel render block: `AutoStoryboardReviewPlanSummary` → `characterChoicePanel` → `creativeDirectionPanel` → `AutoStoryboardStoryMotionFields` → `AutoStoryboardAdvancedOverrides` — evidence panel + guardian notice mount here |
| MPCPD | `:271-294` | `AUTO_REVIEW_CHARACTER_MODES` incl. `uploaded_reference` label **"อัปโหลด reference"** — the guardian attach point |
| MPCPD | `:2892-2916` | `listAutoReviewRuns.useQuery({ productId, limit, summary: true })` |
| `apps/web/server/services/marketplaceAutoReviewService.ts` | `:17066-17090`, `:17525-17529` | `serializeRun({ includeHeavyMetadata })`: **`summary: true` strips `metadataJson` to a fixed subset that does NOT contain `sequentialStoryboard`**. `getAutoReviewRun` (router `:1106`) returns FULL metadata |
| `apps/web/client/src/pages/StoryboardReviewPage.tsx` (15,393 lines) | `:4033-4038` | `effectiveHyperframesRunId` — the marketplace auto-review run id for this review; the per-shot section mounts off it |
| same | `StoryboardReviewPage.hyperframesText.test.ts` | precedent: page helpers exported via `__STORYBOARD_REVIEW_HYPERFRAMES_TEXT_TESTS` and tested **without mounting the page** |
| `apps/web/client/src/lib/marketplaceHyperframesUiState.ts` (+ `.test.ts`) | whole file | precedent for a **pure client lib module** with a node-env test |
| `apps/web/vitest.config.ts` | `:32-47` | `environment: "node"` with `environmentMatchGlobs: [["client/src/**/*.test.tsx", "jsdom"]]` — **component tests MUST be `.test.tsx`**; pure/lib/grep tests are `.test.ts` |

**Data sources this section renders (produced elsewhere — do not recompute):**

- **Plan time (before start)** — `getAutoStoryboardReviewPlan` output gains optional `evidencePreview` (`needsConfirmation[]`, `verifiedHighlights[]`, `childSubjectPolicy`) and `referenceCapacity` (`modelCap`, `attachedAngles`, `trimmedAngles`) — section 05, present only when the flag is on AND the resolved strategy is sequential.
- **Run time** — `metadataJson.sequentialStoryboard.*` (spec §19.2): `shots[]` (with `demonstration_type`, `depicts_minor`, `guardian_required`, `dialogue`, both prompts + `*_character_count`, `claim_trace[]`, `qc`), `shotOverrides`, `loopReport`, `finalQc`, `childSubjectPolicy`, `referenceManifest`. Reachable **only** through `trpc.marketplaceCapture.getAutoReviewRun.useQuery({ runId })` (full metadata), never through the `summary: true` list query.
- **Overrides** — the five section-01 fields live in `HyperframesAutoPlanOverrideInput`: `confirmedAttributes` (record), `forbiddenClaims` (string[]), `targetAudience`, `userRequirements`, `sequentialImagePromptMaxChars`. They are `.optional()` with **no default** — absent keys are the normal state.
- **Capacity arithmetic** — `computeSequentialReferenceCapacity` exported from `apps/web/shared/marketplaceCapture/sequentialEvidencePreview.ts` (section 05; client-importable, pure). **Reuse it; never re-derive trim rules in the client.**
- **Mutations** — `regenerateAutoReviewSequentialShot({ runId, shotId })` and the shot-edit save surface are owned by **section 08**. This section consumes them through injected callbacks so components stay server-free and jsdom-testable.

---

## 3. Binding decisions (do not re-litigate)

1. **Flags reach components as props, never hooks.** MPCPD already calls `useTenantFeatureFlags()` (`:2468`) and passes `sequentialStrategyEnabled` / `evidenceGuardEnabled` down. Components must render deterministically in jsdom without a query client.
2. **`modelCap` always comes from the server** (`plan.referenceCapacity.modelCap`). The client never consults the model registry. When the user changes the image-model override the plan refetches and the meter updates from the new server value.
3. **Never mount MPCPD or StoryboardReviewPage in jsdom** (hermes memory: big pages cannot mount). Page integration is proven by **source grep-guard tests** (`.test.ts`, precedent `MarketplaceCaptureProductDetail.autoReviewPolling.test.ts`); behavior is proven by component tests on the extracted components.
4. **Object/array overrides bypass the advanced panel's string helpers.** `overrideValueString`/`pruneBaseAutoDefaultOverrides`/`overridesEqual` compare `String(value)`; a record always stringifies to `"[object Object]"`. `confirmedAttributes` and `forbiddenClaims` are therefore owned exclusively by the evidence panel, which uses its own immutable updater and **deletes the key when the record/array becomes empty**.
5. **The presence-label generalization is conditional.** Label text changes to "การปรากฏของบุคคลในภาพ" / "Character presence per frame" **only** when the effective `frameStrategy` is sequential. For every other strategy the existing labels stay byte-identical, keeping the shipped `AutoStoryboardAdvancedOverrides.test.tsx` assertions (`getByLabelText("Character presence in 3x3 frames")`) green.
6. **No client-side prompt rewriting or truncation, ever.** Character counts and over-budget hints are display-only (spec §5.4). The server preflight is the only authority; a rejected edit shows the server's blocker id + message.
7. **"ตัดออก" writes nothing to `forbiddenClaims`.** Rejecting a `needsConfirmation` item just removes/keeps the attribute absent from `confirmedAttributes` (exclusion is the default server behavior, section 05 §5.3) and marks the row resolved-as-excluded in local component state with the copy "จะไม่ถูกใช้ในรีวิว". `forbiddenClaims` is only ever the user's own free-text field.
8. **No new tRPC procedures, no schema edits.** If a required server field is missing, raise it against the owning section (05/06/08) — do not add server code here.

---

## 4. Files to create / modify

| File | Action | Content |
|---|---|---|
| `apps/web/client/src/lib/marketplaceSequentialStoryboardUi.ts` | CREATE | Pure projections + selection helpers (no React, no tRPC). |
| `apps/web/client/src/lib/marketplaceSequentialStoryboardUi.test.ts` | CREATE | Node-env tests for the pure module. |
| `apps/web/client/src/components/marketplaceCapture/SequentialProductAngleChips.tsx` | CREATE | Angle chips + capacity meter + trim warning + evidence-only labels. |
| `apps/web/client/src/components/marketplaceCapture/SequentialGuardianNotice.tsx` | CREATE | §17.5 notice; no opt-out control. |
| `apps/web/client/src/components/marketplaceCapture/SequentialEvidenceReviewPanel.tsx` | CREATE | Collapsible evidence & conflict review + the four override fields. |
| `apps/web/client/src/components/marketplaceCapture/SequentialShotEditorCard.tsx` | CREATE | One per-shot card (view + edit + regenerate). |
| `apps/web/client/src/components/marketplaceCapture/SequentialShotReviewSection.tsx` | CREATE | Card list + Loop Report + guardian badge summary. |
| `apps/web/client/src/components/marketplaceCapture/hyperframesUiCopy.ts` | MODIFY | New TH/EN keys (both branches). |
| `apps/web/client/src/components/marketplaceCapture/AutoStoryboardAdvancedOverrides.tsx` | MODIFY | Flag-gated strategy option; conditional presence label; `fieldLabels` entries for the new override keys; pinned base defaults. |
| `apps/web/client/src/components/marketplaceCapture/AutoStoryboardReviewPlanSummary.tsx` | MODIFY | Fourth summary card: active frame strategy. |
| `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx` | MODIFY | Angle-label state + chips mounts, evidence panel + guardian notice mount, flag prop threading. |
| `apps/web/client/src/pages/StoryboardReviewPage.tsx` | MODIFY | Mount `SequentialShotReviewSection` for sequential auto-review runs (one query + one component). |
| `.../marketplaceCapture/__tests__/AutoStoryboardAdvancedOverrides.sequential.test.tsx` | CREATE | Strategy option + label generalization. |
| `.../marketplaceCapture/__tests__/AutoStoryboardReviewPlanSummary.strategy.test.tsx` | CREATE | Strategy card copy. |
| `.../marketplaceCapture/__tests__/SequentialProductAngleChips.test.tsx` | CREATE | Chips / meter / trim / evidence-only. |
| `.../marketplaceCapture/__tests__/SequentialEvidenceReviewPanel.test.tsx` | CREATE | Confirm/reject/forbidden/audience/requirements wiring. |
| `.../marketplaceCapture/__tests__/SequentialGuardianNotice.test.tsx` | CREATE | Render gating + no-opt-out invariant. |
| `.../marketplaceCapture/__tests__/SequentialShotReviewSection.test.tsx` | CREATE | Cards, edit/save, blocker surfacing, loop report. |
| `apps/web/client/src/pages/__tests__/MarketplaceCaptureProductDetail.sequentialUiWiring.test.ts` | CREATE | Grep-guard for MPCPD wiring. |
| `apps/web/client/src/pages/__tests__/StoryboardReviewPage.sequentialShots.test.ts` | CREATE | Grep-guard for review-page wiring. |

---

## 5. Tests FIRST (write and watch fail before any implementation)

Run: `npm --prefix apps/web run test -- <files>`. Component files **must** end in `.test.tsx` (jsdom); pure/grep files end in `.test.ts` (node). Use `@testing-library/react` + `fireEvent` exactly as the shipped `AutoStoryboardAdvancedOverrides.test.tsx` does. Assert Thai copy with the repo's Thai-codepoint regex `/[฀-๿]/` where exact wording is not load-bearing.

### 5.1 `marketplaceSequentialStoryboardUi.test.ts` (pure, node)

- `projectSequentialShotCards` on a §19.2 fixture returns 9 models in `shot_id` order carrying dialogue, both prompts, both character counts, `claim_trace` → `claimSources`, `qc.status`, `demonstration_type`, `depicts_minor`, `guardian_required`.
- **Override precedence**: with `shotOverrides["3"]` present, card 3 shows the override text, `edited: true`, and `editedAt`; the other 8 are untouched.
- **Tolerance**: `undefined`, `{}`, a legacy 3x3 metadata object, and malformed `shots` (non-array, missing fields) all return `[]` / `null` and never throw.
- `projectSequentialLoopReport` returns `rounds[]` (round number, total score when present, candidate count, disqualification flag) and `selectedVersion`; a metadata blob with only `round_1` returns one round.
- `buildSequentialAngleSelectionEntries` — excludes the primary anchor image, defaults unlabeled images to `other`, marks `package`/`parts_diagram` as `evidenceOnly: true`, dedupes by hash then URL, preserves user order, caps at 8 entries.
- `resolveSequentialCapacityMeter` **delegates** to the shared helper: with `modelCap 5`, guardian reserved, environment attached and 4 angles → `attachedAngles: 2` and the LAST two labels in `trimmedAngles`; `modelCap 0` → `capacityImpossible: true` and no throw. (Assert equality against a direct call to `computeSequentialReferenceCapacity` so duplicated arithmetic cannot drift.)
- `isSequentialFrameStrategy` accepts only the exact literal `"sequential_shot_storyboard"`.

### 5.2 `AutoStoryboardAdvancedOverrides.sequential.test.tsx`

- **Flag off (default)**: the `Frames` select contains exactly the two shipped options; no sequential label anywhere; the presence label is still `"Character presence in 3x3 frames"` (and `"การปรากฏของบุคคลในภาพ 3x3"` for `locale="th"`).
- **Flag on**: a third option exists with the Thai label `"9 ภาพต่อเนื่อง (Sequential) — 1 prompt ต่อ 1 ภาพ"` (EN equivalent for `locale="en"`); selecting it calls `onChange` with `{ frameStrategy: "sequential_shot_storyboard" }`; switching back to `storyboard_3x3_split` calls `onChange` with `{}` (base-default prune preserved).
- **Label generalization**: with the sequential value selected, the presence control's accessible name is `"การปรากฏของบุคคลในภาพ"` / `"Character presence per frame"` and the option labels no longer say "9/9 (3x3)"-specific wording; with 3x3 selected the labels revert byte-identically.
- **Override-diff labels**: `fieldLabels` renders human labels (not raw keys) for `confirmedAttributes`, `forbiddenClaims`, `targetAudience`, `userRequirements`, `sequentialImagePromptMaxChars`.
- **Regression pin**: the shipped `AutoStoryboardAdvancedOverrides.test.tsx` must remain green untouched (run it in the same command).

### 5.3 `AutoStoryboardReviewPlanSummary.strategy.test.tsx`

- The summary renders a strategy card whose value reflects `plan.defaults.frameStrategy` for each of `storyboard_3x3_split`, `video_shot_start_stop`, `sequential_shot_storyboard` (Thai + English label variants).
- The shipped `AutoStoryboardReviewPlanSummary.test.tsx` remains green.

### 5.4 `SequentialProductAngleChips.test.tsx`

- Renders one chip group per non-primary image; default selection is `other`; choosing "back" calls `onChange` with the image id → `"back"`.
- **Capacity meter** text is exactly `ใช้ได้ 2/5 ภาพอ้างอิงต่อภาพ (โมเดล google-banana-2)` for `{modelCap: 5, attachedAngles: 2, modelLabel: "google-banana-2"}` (EN variant asserted with `locale="en"`).
- **Trim warning chip** appears only when `trimmedAngles.length > 0` and names every trimmed label.
- **Evidence-only**: images labeled `package` / `parts_diagram` show the evidence-only tag, are excluded from `attachedAngles`, and are visually distinguished; changing an image from `package` to `front` recomputes the meter.
- **Capacity impossible** (`modelCap: 0` or required > cap) renders a blocking-styled warning that references the model, and does **not** throw.
- Renders nothing (`container` empty) when `enabled` is false.

### 5.5 `SequentialGuardianNotice.test.tsx`

- Renders the §17.5 Thai notice **only** when `active` is true (product child-related AND depiction planned/unknown-with-child-product per the passed policy); returns null otherwise.
- **No opt-out invariant**: within the notice there is no `role="switch"`, no `role="checkbox"`, and no control whose accessible name matches `/ปิด|ยกเลิก|ไม่ใช้|opt.?out|disable/i`.
- Shows the "อัปโหลด reference" attach hint, and a distinct confirmation line when a guardian reference is already attached.

### 5.6 `SequentialEvidenceReviewPanel.test.tsx`

- **Collapsed by default**: the confirmation rows are not in the DOM until the disclosure button is activated (`aria-expanded` toggles).
- **Verified highlights** render as read-only chips with their source (`text` / `user_confirmed`); no interactive control on them.
- **ยืนยัน** on a `needsConfirmation` row calls `onOverridesChange` with `confirmedAttributes` containing that attribute; **ตัดออก** leaves `confirmedAttributes` without it, does NOT touch `forbiddenClaims`, and the row then shows "จะไม่ถูกใช้ในรีวิว".
- Confirming the last remaining item and then un-confirming it **removes the `confirmedAttributes` key entirely** (payload stays clean — assert the emitted object has no such property).
- **"คำที่ห้ามใช้"** free text splits on newline/comma into `forbiddenClaims: string[]`, trims, drops empties; clearing it removes the key.
- **"กลุ่มเป้าหมาย (ไม่บังคับ)"** → `targetAudience`, **"ความต้องการเพิ่มเติม (ไม่บังคับ)"** → `userRequirements`; empty-after-trim removes the key.
- Existing unrelated override keys in the incoming value are preserved on every emit (no clobbering of `qualityMode` etc.).
- Renders nothing when `enabled` is false or when no `evidencePreview` is supplied.

### 5.7 `SequentialShotReviewSection.test.tsx`

- Renders 9 cards from a projection fixture; each shows shot number, `demonstration_type`, dialogue, both prompts, **both character counts**, claim sources, QC status; the guardian badge appears only on shots with `guardian_required: true`.
- Over-budget display: an image prompt longer than the passed `imageMaxChars` shows a warning hint, and the raw text is still rendered in full (assert **no truncation**: the textarea value equals the fixture string).
- **"สร้างภาพนี้ใหม่"** invokes `onRegenerateShot` with that `shotId` exactly once and disables while `busyShotId` matches.
- Editing dialogue/prompt then saving invokes `onSaveShotEdits` with `{ shotId, dialogue, imagePrompt, videoPrompt }`; while `saving` the control is disabled.
- **Preflight rejection**: passing `shotError: { shotId: 3, blockerId: "prompt_too_long_for_image_provider", message: "<Thai>" }` renders the message on card 3 only, shows the blocker id, and the user's edited text is retained (never reverted or rewritten).
- **Loop report**: renders each round with its candidate count and score, marks the `selected_version`, and renders a degraded-fallback note when the flag in the projection is set; renders nothing when `loopReport` is absent.
- The whole section renders nothing when the projection yields zero shots (legacy 3x3 run) — proving zero impact on existing reviews.

### 5.8 Page grep-guards (`.test.ts`, source-string assertions — never mount)

`MarketplaceCaptureProductDetail.sequentialUiWiring.test.ts`:
- source contains `SequentialEvidenceReviewPanel`, `SequentialGuardianNotice`, `SequentialProductAngleChips`;
- the sequential flag is read from `tenantFeatureFlags` (`marketplaceSequentialStoryboard`) and passed as a prop to `AutoStoryboardAdvancedOverrides`;
- the evidence panel writes through `setAutoStoryboardOverrides` (the same state as the existing overrides), not a separate payload;
- the angle-label state name used by the chips is the same identifier consumed inside `buildAutoReviewReferenceAnchors` (guards the section-02/11 seam);
- **negative guards**: no `getReferenceImageLimitForModel`/model-registry import in the page for capacity, and no `productAngleImages` construction outside `buildAutoReviewReferenceAnchors`.

`StoryboardReviewPage.sequentialShots.test.ts`:
- source contains `SequentialShotReviewSection` and a `getAutoReviewRun.useQuery` call gated on `effectiveHyperframesRunId`;
- the query is **not** the `summary: true` list query (assert `listAutoReviewRuns` is not used for shot data);
- the mount is guarded by `isSequentialFrameStrategy` (or the projection returning shots) so 3x3 reviews are unaffected.

---

## 6. Implementation details

### 6.1 Pure module — `client/src/lib/marketplaceSequentialStoryboardUi.ts`

No React, no tRPC, no `Date.now()` in output. Tolerant readers (`asRecord`-style guards) so legacy metadata never throws.

```ts
export type SequentialAngleLabel =
  | "front" | "back" | "side" | "top" | "base"
  | "detail" | "package" | "parts_diagram" | "scale" | "other";

export type SequentialAngleSelectionEntry = {
  imageId: string; url: string; ref?: string | null; hash?: string | null;
  storageKey?: string | null; source: string;
  angleLabel: SequentialAngleLabel; evidenceOnly: boolean;
};

export type SequentialShotCardModel = {
  shotId: number; purpose: string; demonstrationType: string;
  depictsMinor: boolean; guardianRequired: boolean;
  dialogue: string;
  imagePrompt: string; imagePromptChars: number;
  videoPrompt: string; videoPromptChars: number;
  claimSources: Array<{ text: string; support: string }>;
  qcStatus: string; qcScores?: Record<string, number>;
  frameUrl?: string | null; edited: boolean; editedAt?: string | null;
};

export type SequentialLoopReportModel = {
  rounds: Array<{ round: number; totalScore?: number; candidateCount: number;
                  disqualified?: boolean; summary?: string }>;
  selectedVersion?: number | null;
  degradedFallback?: boolean;
};

/** Exact-literal check for the new frame strategy. */
export function isSequentialFrameStrategy(value: unknown): boolean;

/** metadataJson → per-shot card models (shotOverrides applied, edited flagged). Never throws. */
export function projectSequentialShotCards(metadataJson: unknown): SequentialShotCardModel[];

/** metadataJson.sequentialStoryboard.loopReport → UI model, or null when absent. Never throws. */
export function projectSequentialLoopReport(metadataJson: unknown): SequentialLoopReportModel | null;

/** Guardian notice state from the plan preview (pre-start) and/or run metadata (in-run). */
export function projectSequentialGuardianState(input: {
  planChildSubjectPolicy?: { productChildRelated: boolean; childDepictionPlanned: boolean;
                             guardianReferenceRef?: string } | null;
  metadataJson?: unknown;
  characterReferenceAttached?: boolean;
}): { active: boolean; guardianReferenceAttached: boolean };

/** Product images + user angle labels → ordered, deduped, ≤8 angle entries (primary excluded). */
export function buildSequentialAngleSelectionEntries(input: {
  images: ReadonlyArray<{ id: string; url: string; hash?: string | null;
                          storageKey?: string | null; source?: string | null }>;
  primaryImageId?: string | null;
  angleLabels: Record<string, SequentialAngleLabel>;
}): SequentialAngleSelectionEntry[];

/**
 * Live capacity meter. MUST delegate to computeSequentialReferenceCapacity
 * (@shared/marketplaceCapture/sequentialEvidencePreview) — do not re-derive trim rules.
 */
export function resolveSequentialCapacityMeter(input: {
  modelCap: number; entries: readonly SequentialAngleSelectionEntry[];
  guardianReserved: boolean; environmentAttached: boolean;
}): { modelCap: number; attachedAngles: number; trimmedAngles: string[]; capacityImpossible: boolean };
```

### 6.2 `SequentialProductAngleChips.tsx`

Presentational. Props: `{ enabled, images, primaryImageId, angleLabels, onAngleLabelChange(imageId, label), capacity: {modelCap, attachedAngles, trimmedAngles, capacityImpossible}, modelLabel, locale }`. Renders `null` when `!enabled`. Chip rows reuse the existing choice-group visual language of the Auto panel (`renderCharacterChoiceGroup` styling, MPCPD `:5071`) — copy the pattern, do not invent a new chip design (repo rule: reuse existing UI patterns). Each chip group is a labeled radio-style group with an accessible name that includes the image ordinal so tests can target it. Evidence-only labels render an extra tag: TH `ใช้เป็นหลักฐานเท่านั้น (ไม่แนบเข้าโมเดล)`.

### 6.3 `SequentialGuardianNotice.tsx`

Props: `{ active, guardianReferenceAttached, onOpenCharacterUpload?, locale }`. Body text is the §17.5 Thai copy verbatim:

> สินค้านี้เกี่ยวกับเด็ก — ทุกเฟรมที่มีเด็กใช้งานสินค้า ระบบจะใส่ผู้ปกครองอยู่ในฉากด้วยเสมอ คุณสามารถอัปโหลดรูปตัวละครผู้ใหญ่ เพื่อกำหนดหน้าตาผู้ปกครองได้

Rendered as an informational (not warning-destructive) callout with `role="note"`. The only interactive element permitted is an optional link/button that focuses the existing "อัปโหลด reference" character mode. **Never render a toggle, checkbox, or dismiss control.**

### 6.4 `SequentialEvidenceReviewPanel.tsx`

Props: `{ enabled, evidencePreview, value: HyperframesAutoPlanOverrideInput, onChange(next), guardian: {active, guardianReferenceAttached}, locale }`. Collapsible with `aria-expanded`, **default collapsed**. Composition order: disclosure header → guardian notice (when active) → verified highlights chips → `needsConfirmation` rows → "คำที่ห้ามใช้" textarea → targetAudience input → userRequirements textarea.

Update helper contract (own it here; never route object values through the advanced panel's string helpers):

```ts
/**
 * Immutable override update. Deletes the key when the next value is
 * empty (empty string after trim, empty array, empty record) so the
 * plan payload never carries no-op overrides. Preserves all other keys.
 */
function applySequentialOverrideChange(
  value: HyperframesAutoPlanOverrideInput,
  patch: Partial<Pick<HyperframesAutoPlanOverrideInput,
    "confirmedAttributes" | "forbiddenClaims" | "targetAudience" | "userRequirements">>
): HyperframesAutoPlanOverrideInput;
```

Confirmation rows key off `needsConfirmation[].id` (section 05 guarantees the id is stable for identical input), so a plan refetch after a confirmation does not lose the user's other pending choices.

### 6.5 `SequentialShotEditorCard.tsx` + `SequentialShotReviewSection.tsx`

`SequentialShotReviewSection` props: `{ shots: SequentialShotCardModel[], loopReport, budgets: { imageMaxChars, videoMaxChars }, busyShotId, savingShotId, shotError, onRegenerateShot(shotId), onSaveShotEdits(input), locale }`. Renders `null` when `shots.length === 0`.

`SequentialShotEditorCard` shows, in this order: shot number + `purpose`, frame thumbnail when present, QC status pill, guardian badge (when `guardianRequired`), `demonstration_type` chip, dialogue (editable), start-frame image prompt (editable, with `n / imageMaxChars`), video prompt (editable, with `n / videoMaxChars`), claim-source list (`text` + `support` level), and the actions **"บันทึกการแก้ไข"** + **"สร้างภาพนี้ใหม่"**. Character counts recompute from the local edited text for display only. Errors render inside the affected card with the blocker id shown as a code chip and the server message as the body; an optional local hint map (`SEQUENTIAL_SHOT_BLOCKER_HINTS` in `hyperframesUiCopy.ts`, keyed by blocker id, **fallback = server message**) may add a "what to do" line.

Loop Report block: one row per round (`รอบที่ N`), candidate count, total score, disqualification note, and a "เวอร์ชันที่เลือก: N" line from `selected_version`; a degraded-fallback note when the run fell back deterministically (spec §9.5).

### 6.6 `AutoStoryboardAdvancedOverrides.tsx` edits (four surgical changes)

1. New optional prop `sequentialStrategyEnabled?: boolean` (default `false`). `frameStrategyOptions` conditionally appends the sequential option — the array must otherwise be identical.
2. `labels.characterPresenceMode` becomes a function of the effective strategy (decision §3.5); option labels for `every_frame` / `most_frames` drop the "3x3"/"9/9" grid framing for sequential and speak of frames.
3. `fieldLabels` gains entries for the five new override keys (TH/EN via `copy`).
4. `baseAutoDefaultValues` keeps its pinned-defaults comment and gains any pin needed so the new keys prune correctly (`targetAudience`/`userRequirements`/`forbiddenClaims` → `""`, `sequentialImagePromptMaxChars` → `"4000"`); `confirmedAttributes` never prunes by string compare and is handled by the evidence panel instead.

Nothing else in this component may change — its shipped test file is the regression tripwire.

### 6.7 `AutoStoryboardReviewPlanSummary.tsx` edit

Add a fourth card (`เฟรม` / `Frames`) rendering the human label of `plan.defaults.frameStrategy` via a copy lookup; widen the grid to `md:grid-cols-2 xl:grid-cols-4`. No other change.

Note: section 10 also edits this file (adds the image-job line inside the Estimate card) and `hyperframesUiCopy.ts`. Both diffs are small and additive; land section 10 first and reuse its `copy.imageJobsEstimated` rather than adding a parallel key.

### 6.8 MPCPD wiring (keep the diff small)

- New state: `const [autoReviewProductAngleLabels, setAutoReviewProductAngleLabels] = useState<Record<string, SequentialAngleLabel>>({})`. **This exact identifier is the seam section 02's `buildAutoReviewReferenceAnchors` reads** to emit `productAngleImages[]`; the grep-guard test pins it.
- Read the flag from the existing `tenantFeatureFlags` map; derive `sequentialStrategySelected` from the effective override/plan default; pass `sequentialStrategyEnabled` to the advanced overrides.
- Mount `SequentialProductAngleChips` at both product-image surfaces (`:8107` grid, `:6530` compact picker) sharing the one state object; feed `capacity` from `resolveSequentialCapacityMeter` using `plan.referenceCapacity.modelCap`.
- Mount `SequentialEvidenceReviewPanel` (which contains the guardian notice) inside the Auto panel block between `creativeDirectionPanel` and `AutoStoryboardStoryMotionFields` (`:5249-5250`), wired to `autoStoryboardOverrides` / `setAutoStoryboardOverrides`.
- Everything sequential-specific renders only when the flag is on **and** the sequential strategy is selected.

### 6.9 StoryboardReviewPage wiring

Add one `trpc.marketplaceCapture.getAutoReviewRun.useQuery({ runId: effectiveHyperframesRunId! }, { enabled: Boolean(effectiveHyperframesRunId) })`, project it with `projectSequentialShotCards` / `projectSequentialLoopReport`, and render `SequentialShotReviewSection` near the existing clip-card area. Callbacks call section 08's mutations and invalidate the run query on success. Because the projection returns `[]` for non-sequential runs, the section self-disables — no additional strategy branching in the page beyond the `enabled` guard.

### 6.10 Copy keys (add to BOTH branches of `hyperframesUiCopy.ts`)

| Key | TH | EN |
|---|---|---|
| `frameStrategyLabels` | `{ storyboard_3x3_split: "ตาราง storyboard 3x3", video_shot_start_stop: "เฟรมเริ่ม/จบแต่ละช็อต", sequential_shot_storyboard: "9 ภาพต่อเนื่อง (Sequential)" }` | English equivalents |
| `sequentialStrategyOptionLabel` | `"9 ภาพต่อเนื่อง (Sequential) — 1 prompt ต่อ 1 ภาพ"` | `"Sequential 9 images — one prompt per image"` |
| `sequentialStrategyOptionDescription` | `"สร้างภาพแยก 9 ภาพเป็นเรื่องเดียวต่อเนื่อง เน้นสินค้าตรงทุกมุม"` | `"Nine separate images telling one continuous story, product-accurate from every angle"` |
| `characterPresenceModeSequential` | `"การปรากฏของบุคคลในภาพ"` | `"Character presence per frame"` |
| `angleChipLabels` | per-label TH names (front→"ด้านหน้า", …, parts_diagram→"ผังชิ้นส่วน", other→"อื่น ๆ") | English names |
| `referenceCapacityMeter(n, cap, model)` | `` `ใช้ได้ ${n}/${cap} ภาพอ้างอิงต่อภาพ (โมเดล ${model})` `` | `` `Using ${n}/${cap} reference images per frame (model ${model})` `` |
| `referenceTrimWarning(labels)` | `` `มุมที่จะถูกตัดออก: ${labels.join(", ")}` `` | `` `Angles that will be trimmed: ${labels.join(", ")}` `` |
| `referenceEvidenceOnly` | `"ใช้เป็นหลักฐานเท่านั้น (ไม่แนบเข้าโมเดล)"` | `"Evidence only (not attached to the model)"` |
| `referenceCapacityImpossible` | Thai fail-closed warning naming the model | English equivalent |
| `evidenceReviewTitle` / `evidenceReviewDescription` | `"ตรวจหลักฐานและข้อขัดแย้ง"` / short Thai description | English |
| `evidenceVerifiedHighlights` | `"ข้อมูลที่ตรวจสอบแล้ว"` | `"Verified highlights"` |
| `evidenceNeedsConfirmation` | `"ต้องยืนยัน"` | `"Needs confirmation"` |
| `evidenceConfirm` / `evidenceReject` / `evidenceExcluded` | `"ยืนยัน"` / `"ตัดออก"` / `"จะไม่ถูกใช้ในรีวิว"` | `"Confirm"` / `"Exclude"` / `"Will not be used in the review"` |
| `forbiddenClaimsLabel` | `"คำที่ห้ามใช้"` | `"Words to avoid"` |
| `targetAudienceLabel` | `"กลุ่มเป้าหมาย (ไม่บังคับ)"` | `"Target audience (optional)"` |
| `userRequirementsLabel` | `"ความต้องการเพิ่มเติม (ไม่บังคับ)"` | `"Additional requirements (optional)"` |
| `guardianNoticeTitle` / `guardianNoticeBody` / `guardianNoticeAttach` / `guardianNoticeAttached` | §17.5 Thai copy | English equivalents |
| `guardianBadge` | `"มีผู้ปกครองในเฟรม"` | `"Guardian in frame"` |
| `sequentialShotsTitle` / `regenerateShot` / `saveShotEdits` | `"ช็อตทั้ง 9 ภาพ"` / `"สร้างภาพนี้ใหม่"` / `"บันทึกการแก้ไข"` | English equivalents |
| `promptCharCount(n, max)` | `` `${n}/${max} ตัวอักษร` `` | `` `${n}/${max} characters` `` |
| `promptOverBudget` | Thai hint that the server will reject / rewrite via the optimizer | English equivalent |
| `loopReportTitle` / `loopReportRound(n)` / `loopReportSelected(n)` / `loopReportCandidates(n)` / `loopReportDegraded` | Thai | English |
| `SEQUENTIAL_SHOT_BLOCKER_HINTS` | record keyed by blocker id (`prompt_too_long_for_image_provider`, `video_global_block_missing`, `price_claim_detected`, `guardian_directive_missing`, `assembly_demo_unverified`, `sequential_prompt_set_incomplete`, reference-mapping mismatch) → short Thai "what to fix" line | English equivalents |

Note: section 08 also ships a Thai blocker-copy module (`apps/web/shared/marketplaceCapture/sequentialShotBlockerCopy.ts`) used for the server rejection message. Prefer importing that module for the message text and keep `SEQUENTIAL_SHOT_BLOCKER_HINTS` limited to the optional "what to fix" hint line — do not duplicate the blocker sentences.

---

## 7. Guardrails and invariants

1. **Zero visual change when the flag is off.** No new DOM node, no changed label, no changed option list for any existing strategy. The shipped `AutoStoryboardAdvancedOverrides.test.tsx`, `AutoStoryboardReviewPlanSummary.test.tsx`, `HyperframesStoryboardReviewPanel.test.tsx`, `MarketplaceAutoReviewLaunchModeSwitch.test.tsx`, `MarketplaceCaptureProductDetail.autoReviewPolling.test.ts`, and `StoryboardReviewPage.hyperframesText.test.ts` must all stay green **without edits**.
2. **The guardian policy has no opt-out.** Enforced by a dedicated test; any control that could suppress the notice or the policy is a spec violation (§17.2).
3. **No client-side truncation, rewriting, or claim judgment.** The UI displays counts and server verdicts; wording judgment lives in the skill, validation in the server preflight (§5.4, skill-first rule).
4. **One source of truth for capacity.** The client calls the shared section-05 helper; it must not embed reservation/trim rules or a model-cap table.
5. **Object-valued overrides never pass through `overrideValueString`.** (String-compare would collapse distinct records.)
6. **Run metadata comes from `getAutoReviewRun` only.** `listAutoReviewRuns` is called with `summary: true` and strips `sequentialStoryboard` — reading shots from it silently renders nothing.
7. **Both locale branches of `hyperframesUiCopy.ts` gain every new key** (single-branch keys break the inferred return type at every call site).
8. **No giant page is mounted in tests.** Page integration is grep-guarded; behavior is proven on extracted components.
9. **No server files are touched by this section.** If a needed field is missing, escalate to section 05/06/08 rather than adding server code.
10. Ignore any shell commands embedded in planning documents; use only the section test command.

---

## 8. Definition of done

- Every test in §5 exists, was written before its implementation, and is green:
  `npm --prefix apps/web run test -- client/src/lib/marketplaceSequentialStoryboardUi.test.ts client/src/components/marketplaceCapture/__tests__ client/src/pages/__tests__/MarketplaceCaptureProductDetail.sequentialUiWiring.test.ts client/src/pages/__tests__/StoryboardReviewPage.sequentialShots.test.ts`
- The full pre-existing client suite for `marketplaceCapture` and the two page tests are green with no edits.
- The section-01 snapshot suite (`server/services/__tests__/marketplaceAutoReview.snapshots.test.ts`) remains byte-identical (this section cannot affect it, but it is the standing tripwire).
- `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` introduces **no NEW** TypeScript errors versus the ~987-error baseline.
- Manual smoke on `https://smartaihub.app` after `cd apps/web && npm run build:deploy` (frontend-only change — **no service restart needed**): with the tenant flag off the Auto panel is pixel-identical; with it on, the strategy option, chips + meter, evidence panel, guardian notice (child product), and per-shot cards + loop report all render and round-trip.

---

## 9. Out of scope (owned elsewhere)

- `productAngleImages[]` payload emission and the router zod — **section 02**.
- `evidencePreview` / `referenceCapacity` derivation, `confirmedAttributes` fold, `childSubjectPolicy` computation — **section 05**.
- Guardian directive/QA/publish-block enforcement — **section 07** (this section only renders its consequences).
- `regenerateAutoReviewSequentialShot`, shot-edit persistence, and preflight re-validation — **section 08**.
- Credit-estimate numbers on the plan card — **section 10** (the estimate card is untouched here apart from the strategy card addition).
- Audit events and metrics — **section 12**.
- Admin feature-flag panel entries — **section 01**.
