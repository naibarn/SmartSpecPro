# Section 03 — Storyboard paired actions and one-editor variant UX

## Objective

Give the creator a visible Legacy/Enhanced choice while preserving the existing
Storyboard prompt editor, action placement, keyboard behavior, and all Legacy
interactions.

## UI/UX Contract

### Target User / JTBD

The primary user is a Vertical Drama creator entering from the existing
Storyboard prompt card. The user wants to compare Legacy and Enhanced, edit one
variant, and explicitly apply it without risking the current render prompt.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Shot action row | `VerticalDramaStoryboardPanel.tsx` | Add adjacent gated Enhanced action |
| Prompt editor | Existing panel/page | Add viewed variant selector, keep one editor |
| Async status | Existing page/panel | Add per-variant and split-group states |
| Apply/model summary | Existing prompt card | Add explicit Apply/Restore and role badges |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Parent mutation/poll orchestration | `VerticalDramaEpisodePage.tsx` | Query/mutation lifecycle | Router procedures |
| Shot presentation | `VerticalDramaStoryboardPanel.tsx` | CTA/selector/status rendering | Parent callbacks and clip metadata |
| One editor | Existing `InlineEditablePromptBox` area | Local edit buffer | Viewed variant projection |
| Variant contract | `shared/verticalDramaSeries/videoPromptVariants.ts` | Validation/projection | Persisted clip JSONB |

### State Matrix

Use the detailed state matrix below as the canonical matrix. It covers
loading, empty, error, success, partial group, stale, disabled, selected,
hover, focus, active/render mismatch, and unknown provenance.

### Responsive Matrix

Use the detailed responsive matrix below. The four required evidence sizes are
390x844 mobile, 768x1024 tablet, 1440x900 desktop, and 360x800 small-mobile.

### Accessibility Acceptance

Use the detailed accessibility acceptance below, including keyboard operation,
focus visibility, semantics, contrast, live status, unsaved-edit safety, and
reduced motion.

### Copy Contract

Use the Thai/English key table below as the source of truth for labels,
validation, loading, success, stale, and error copy.

### Browser Evidence Required

Use the browser evidence list below and follow
`skills/orchestra/references/ui-browser-verification.md`.

## Target user and job to be done

**Target user:** a Vertical Drama creator who already understands the current
shot-level video-prompt flow and wants to compare a higher-quality, model-aware
prompt before spending credits on video rendering.

**JTBD:** “For this shot, let me generate an Enhanced prompt, inspect its full
bundle and target model, compare it with Legacy in the familiar editor, and
explicitly apply it without changing or risking my existing prompt/media.”

## Existing pattern reference

Before implementation, search the current UI for:

`VerticalDramaStoryboardPanel InlineEditablePromptBox VideoPromptAiEditDialog
shot-level generate button loading stale error`

The implementation must reuse the current `VerticalDramaStoryboardPanel`,
`InlineEditablePromptBox`, `VideoPromptAiEditDialog`, existing prompt action
placement, shadcn/Tailwind tokens, toast/error conventions, and parent-page
mutation/polling patterns. No exact existing Legacy/Enhanced variant selector
pattern was found; only that selector and its active/viewed state treatment are
new. The Legacy button, callback, payload, editor save path, and layout affordance
are not redesigned.

## Surface inventory

| Surface | Existing pattern | Feature 173 addition | Legacy impact |
|---|---|---|---|
| Shot action row | Existing Legacy action | Adjacent Enhanced action, once per shot | None when flag off |
| Prompt title row | Existing prompt metadata | Legacy/Enhanced selector and active-render badge | Existing title/edit affordances remain |
| Prompt editor | `InlineEditablePromptBox` | Shows selected variant only | Existing Legacy edit behavior unchanged |
| AI edit dialog | `VideoPromptAiEditDialog` | Enhanced edits route to variant-scoped save | Legacy callback unchanged |
| Status area | Existing loading/error copy | Independent `shotNumber + variantId` status and group status | No shared active-shot clobber |
| Apply area | None for alternate prompt | Free explicit Apply/Restore with stale/partial guards | Hidden when Apply flag is off |
| Model summary | Existing video-model mismatch warning | Image/authoring/video role summary and capability snapshot | Existing warning remains |
| Render result | Existing media/task card | Variant/hash/model provenance and `prompt_mismatch` state | Existing media is preserved |

## Component contract

Extend the existing shot-level prompt area with:

- `สร้างพรอมต์วิดีโอ` — existing Legacy action, unchanged;
- `สร้างพรอมต์วิดีโอ (Enhanced)` — new gated action;
- Legacy/Enhanced selector;
- active-render badge that is independent of the selected tab;
- exact target video-model/provenance summary;
- `ใช้ prompt นี้` and `ใช้ Legacy`/restore actions;
- independent job status, stale, error, partial-group, and readiness copy.

The Enhanced action is rendered once for a shot, including split shots. The
prompt editor remains one `InlineEditablePromptBox` per clip/sub-shot. For a
split shot, the selector reflects the shot-group selection while each editor
still shows its exact clip mapping; Apply is group-atomic.

## State matrix

| State | Legacy | Enhanced | UI behavior |
|---|---|---|---|
| Existing prompt only | ready/active | empty/not generated | Legacy editor works exactly as today; Enhanced CTA is available only when gated. |
| Enhanced queued/running | unchanged | loading | Show Enhanced progress; keep active Legacy prompt/render state unchanged. Disable duplicate Enhanced admission and explain if Legacy is already active for the same shot. |
| Enhanced ready | unchanged | success/preview | Show Enhanced preview; Apply is explicit and free; active badge still says Legacy. |
| Enhanced stale | unchanged | blocked | Show exact changed input/model reason; disable Apply and offer regenerate. |
| Enhanced failed | unchanged | error/retryable | Show actionable error; do not clear Legacy or any ready Enhanced result from another job. |
| Runtime not ready | unchanged | disabled | Show exact package/SDK/manifest/model/asset reason; never imply Legacy generated Enhanced. |
| Apply disabled by flag | unchanged | preview | Preview remains readable; Apply is disabled with rollout reason. |
| Split group partial | ready per available clip | partial/blocked | List every missing/stale/failed sub-shot; no clip switches until the group is complete. |
| Applied Enhanced | stored Legacy | active Enhanced | Active projection/render use Enhanced full bundle; selector can still view Legacy. |
| Legacy generated while Enhanced active | preview/ready | active Enhanced | Legacy result is stored for comparison only; explicit Apply Legacy is required to switch. |
| Existing media after variant switch | old media | active prompt differs | Preserve media and show `prompt_mismatch`; provide explicit new-render action. |
| Existing media without provenance | preserved media | unknown | Show `provenance_unknown`; never claim prompt match and offer explicit render. |
| `viewedVariant` differs from active | active badge unchanged | selected tab | Show both “กำลังดู …” and “ใช้ render อยู่ …”; tab selection alone has no side effect. |
| Viewed preview rendered | active projection | preview selected | Keep the existing paid render action bound to active state; show a clear prompt to Apply first rather than silently rendering the preview. |
| Any generation/finalization active | unchanged | loading on one variant | Disable Apply for the shot and explain that another variant is running; do not race projection. |
| Selected control | unchanged | selected tab/action | Use semantic selected state plus text; keep active-render badge independent. |
| Hover | unchanged | actionable control | Show a non-color affordance without changing viewed/active state or starting a job. |
| Keyboard focus | unchanged | focused control | Show a visible focus ring and preserve the same no-side-effect rule until activation. |

The UI must model `loading`, `empty`, `error`, `success`, `partial success`,
`disabled`, `selected`, `hover`, and `focus` states explicitly. Status and error
keys are `shotNumber + variantId`; split shots additionally expose aggregate
group status without overwriting per-clip state.

## Display and edit semantics

`viewedVariant` is local display state. Once a store exists, `activeVariant`
comes from the server and changes only after atomic Apply; first store creation
seeds Legacy as a no-op state stamp. The active badge must remain visible while
the user switches tabs. Enhanced preview edits call `updateVideoPromptVariant`,
write only Enhanced, preserve Legacy, and remain unapplied until explicit Apply.
The existing Legacy free-edit callback remains unchanged for old/no-store clips;
for an opted-in clip it writes `variants.legacy` first and only updates active
projection when Legacy is active. It is not reused for Enhanced. Dirty editor
buffers are keyed by exact clip/sub-shot and variant; tab switches, reloads,
Apply, and a new generation must save, cancel, or explicitly confirm discarding
those buffers rather than losing them.

The readiness query is display-only and free; it must not reserve credits or
start a job. The server rechecks readiness at generation/finalize/Apply. The
first successful Enhanced generation may create the hidden Legacy snapshot, but
the UI must continue to show `Legacy` as the active render variant until Apply.

An Enhanced edit sets `user_edited` and invalidates terminal equality. Apply and
paid video render stay blocked until the user explicitly invokes the bounded
`finalizeVideoPromptVariant` action (with any estimate shown), or discards the
edit to restore the prior terminal variant. No hidden re-finalization may spend
credits during Apply/render. Finalize is a durable, idempotent operation and
uses a revision/hash conflict guard so a stale editor cannot replace newer
text.

## Confirmation, cost, and concurrency

The Enhanced confirmation must state that it is a separate paid operation, its
estimated cost/quality mode, target model, authoring model, required references,
and that the current prompt remains unchanged until Apply. Apply and restore are
free. Each button has an independent pending/error state, and a second active
variant job for the same shot is disabled with an explanation rather than
creating an ambiguous comparison or duplicate spend.

## Responsive matrix

The implementation and browser proof must cover these canonical viewports:

| Viewport | Required behavior |
|---|---|
| 390×844 mobile | Actions remain individually tappable; selector, active badge, Apply, and blocking reason remain visible or reachable without hiding Legacy. |
| 768×1024 tablet | Action row may wrap; prompt text and model summary remain readable; no status overlap. |
| 1440×900 desktop | Paired actions, selector, editor, model roles, status, and Apply fit without changing existing card hierarchy. |
| 360×800 small mobile | Long Thai/English diagnostics wrap or collapse accessibly; no horizontal clipping or lost active state. |

## Accessibility acceptance

- distinct accessible names for Legacy, Enhanced, selector options, Apply, and
  restore;
- full keyboard operation with visible focus and logical tab order;
- selected, active, stale, loading, disabled, and error states are conveyed by
  text/semantics, not color alone;
- status updates use an appropriate live region without stealing focus;
- contrast, hit targets, labels, and error association meet the existing app
  accessibility baseline;
- unsaved edits are preserved on tab switch and the user receives a clear
  warning before any destructive replacement (none is allowed implicitly);
- reduced-motion preferences do not remove progress or state information.

## Visual and copy direction

Reuse current Storyboard/shadcn/Tailwind component patterns and design tokens.
Do not add a global reset, raw colors, or a parallel visual system. Copy must
have stable Thai and English keys, including:

| Key | Thai | English meaning |
|---|---|---|
| enhancedAction | สร้างพรอมต์วิดีโอ (Enhanced) | Generate video prompt (Enhanced) |
| applyVariant | ใช้ prompt นี้ | Apply this prompt |
| activeLegacy | ใช้ render อยู่: Legacy | Rendering: Legacy |
| activeEnhanced | ใช้ render อยู่: Enhanced | Rendering: Enhanced |
| previewOnly | กำลังดูตัวอย่าง ยังไม่เปลี่ยน prompt ที่ใช้ render | Preview only; render prompt unchanged |
| runtimeBlocked | Enhanced ยังไม่พร้อม: ตรวจสอบรายละเอียด | Enhanced unavailable; view details |
| partialGroup | ยังใช้ไม่ได้: sub-shot บางรายการยังไม่พร้อม | Unavailable: some sub-shots are not ready |
| promptMismatch | วิดีโอเดิมสร้างจาก prompt คนละชุด ต้องสร้างใหม่เมื่อพร้อม | Existing video uses different prompt provenance; render again |
| renderUsesActive | ปุ่มสร้างวิดีโอจะใช้ prompt ที่เลือกใช้ render อยู่ | Video render uses the active applied prompt |
| enhancedEmpty | ยังไม่มี Enhanced prompt สำหรับช็อตนี้ | No Enhanced prompt for this shot yet |
| enhancedLoading | กำลังสร้าง Enhanced prompt… | Generating Enhanced prompt… |
| enhancedReady | Enhanced prompt พร้อมตรวจสอบและเลือกใช้ | Enhanced prompt ready for review and Apply |
| enhancedStale | ข้อมูลอ้างอิงหรือโมเดลเปลี่ยน ต้องสร้างใหม่ | References or model changed; regenerate |
| enhancedFailed | สร้างไม่สำเร็จ ลองใหม่ได้โดยไม่ลบ Legacy | Generation failed; retry without removing Legacy |
| applyBlockedJob | อีก variant กำลังทำงาน รอให้เสร็จก่อน | Another variant is running; wait before Apply |

Loading, empty, success, stale, error, disabled, and partial-group messages
must be actionable and must not claim an Enhanced result when Legacy was used.

## Browser proof required

At the canonical viewports, capture evidence for:

1. feature flag off: existing Legacy action/editor/render state unchanged;
2. UI on/jobs off: Enhanced is visible but clearly disabled with diagnostics;
3. Enhanced ready preview: same editor, model roles, independent status, and
   active badge;
4. explicit Apply and Restore, including split-shot group atomicity;
5. stale/model mismatch, failed/retryable, and partial-group states;
6. existing media preserved with `prompt_mismatch` after a variant switch;
7. keyboard focus/selection and responsive layouts at mobile, tablet, and
   desktop sizes.

## Required tests

- existing Legacy button regression and unchanged callback/payload;
- Enhanced CTA gate and confirmation;
- one editor with two variants and variant-scoped edit persistence;
- explicit post-edit re-finalization/estimate and discard-to-restore behavior;
- preview does not change active projection or render task;
- paid render remains bound to active projection while an unapplied preview is
  visible;
- Apply/restore, stale block, split-shot atomic block/success;
- independent status/error keys and refresh/recovery states;
- render provenance mismatch preservation;
- keyboard, accessible names, focus, reduced motion, and responsive rendering;
- browser proof for flag-off Legacy and flag-on Enhanced paths.

## Implementation Record

- Added the adjacent Enhanced action to
  `VerticalDramaStoryboardPanel.tsx`; the existing Legacy action and callback
  payload remain separate.
- Added variant selection, active/preview/stale diagnostics, variant-scoped
  editing, finalize, Apply/restore, split-shot group controls, independent
  loading/error state, and explicit confirmation before Enhanced operations.
- The confirmation preflights readiness and displays the server estimate before
  the paid job is admitted; admission recomputes all gates.
- Wired the page/workspace polling and readiness preflight without changing the
  Legacy path. UI callbacks are additive and remain absent when the UI flag is
  off.
- Automated contract tests cover feature-flag defaults and core variant state.
- Browser screenshots/E2E across required viewports are still unverified in
  this environment and must be completed before enabling the UI in production.
