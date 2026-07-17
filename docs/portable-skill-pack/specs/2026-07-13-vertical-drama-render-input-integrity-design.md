# Vertical Drama Render Input Integrity Design

Date: 2026-07-13  
Status: Direct review approved, pending user written-spec approval  
Scope: Vertical Drama shot start-frame image generation and shot video-prompt generation

## 1. Problem statement

Two paid generation paths currently rely too heavily on probabilistic skill output and tolerant reference resolution:

1. A shot may require multiple characters, but start-frame generation silently omits a character whose approved portrait cannot be resolved. The request can still be submitted and charged. The prompt's `Image N` labels may also disagree with the actual attachment order because character rows are not deterministically reordered to match `requiredCharacterRefs`.
2. A native-audio video prompt may omit one or more source dialogue lines. The old compliance check can validate the dialogue array echoed by the LLM instead of the complete canonical dialogue list supplied to it, and later prompt transforms or length reduction can remove lines.

The system must treat character attachments and native dialogue as mandatory render inputs, not best-effort prompt suggestions.

## 2. Goals

- Attach exactly one approved primary portrait for every distinct character required by a shot, whether the shot has one, two, three, or more characters within the selected model's capacity.
- Keep character-to-image numbering stable and identical across the skill input, visible stored prompt, and provider payload.
- Block before credit reservation and provider submission when any required portrait is missing or the selected model cannot accept all mandatory portraits.
- Ensure every generated image prompt explicitly prohibits changes to each referenced character's face, facial structure, skin tone, hairstyle, clothing/outfit, accessories, and distinguishing features.
- Preserve every canonical dialogue line verbatim and in source order in prompts for models whose family capability is `nativeAudioDialogue=true`.
- Enforce these guarantees after all skill, sanitization, style, and prompt-length transformations.
- Apply Grok native-audio capability at model-family level across Higgsfield, Kie, Magnific, and future providers.

## 3. Non-goals

- This change does not modify the separate character-generation workflow.
- It does not redesign the character tab, character DNA generation, dialogue authoring UI, or provider billing.
- It does not invent a fallback portrait or silently substitute another character when an approved portrait is absent.
- It does not bypass a provider's documented maximum reference-image capacity.

## 4. Root causes

### 4.1 Character-reference path

`generateStartFrameImage` derives references from `startFramePlan.frames[].requiredCharacterRefs`, but the resolver currently:

- returns database rows without a guaranteed order matching `requiredCharacterRefs`;
- silently filters characters whose approved primary portrait URL is absent;
- merges character, location, and product references under a model limit without first asserting that every character portrait survived;
- trusts the skill to author correct identity-lock text, with no deterministic postcondition immediately before the provider call.

Consequently the provider can receive an incomplete or misnumbered attachment set while the stored prompt still claims different `Image N` identities.

### 4.2 Dialogue path

The video-prompt generator previously allowed the LLM-returned `dialogue[]` echo to determine compliance. If that echo omitted the third source line, checking only the echo could pass. Prompt refinement, brand sanitization, or style appends could subsequently remove dialogue because no final protected-fragment postcondition existed at every persistence/provider boundary.

## 5. Design

### 5.1 Canonical character attachment manifest

Introduce one shared resolver for paid start-frame image generation. Its input is the shot's `requiredCharacterRefs`; its output is an ordered manifest:

```ts
type RequiredCharacterAttachment = {
  characterKey: string;
  characterName: string;
  imageIndex: number;
  primaryPortraitUrl: string;
};
```

Resolution rules:

1. Trim and de-duplicate keys while preserving the first occurrence order.
2. Fetch roster rows tenant/series scoped.
3. Re-index fetched rows by `characterKey`; never use database return order as attachment order.
4. Resolve exactly one approved `primary_portrait` per required key.
5. Return manifest entries in canonical key order with consecutive one-based `imageIndex` values.
6. Collect explicit failure details for unknown keys and missing/unready portraits.

Supplementary character sheets may remain supported when the feature flag is enabled, but they are appended only after every mandatory primary portrait. They never alter primary portrait numbering.

### 5.2 Fail-closed preflight

Before checking/reserving credits and before provider transport resolution:

- Reject if any required character key has no roster row.
- Reject if any required character lacks an approved primary portrait.
- Reject if `maxReferenceImages` is smaller than the number of mandatory character portraits.
- Reject if reference merging or de-duplication would remove a mandatory portrait.

The user-facing error must identify the shot and actionable cause, for example:

- `ยังสร้างภาพช็อต 6 ไม่ได้: ไม่พบภาพตัวละครที่อนุมัติแล้วสำหรับ ฝ้าย, ใบข้าว`
- `โมเดลนี้รองรับภาพอ้างอิงสูงสุด 2 ภาพ แต่ช็อตนี้ต้องใช้ตัวละคร 3 คน กรุณาเลือกโมเดลที่รองรับอย่างน้อย 3 ภาพ`

No credit may be reserved and no provider task may be created after a failed preflight.

This preflight is shared by single-image and multi-angle start-frame mutations so neither path can regress independently.

### 5.3 Deterministic identity-lock contract

The skill remains responsible for cinematic composition, acting, emotion, lighting, and natural integration of character references. Code owns the mandatory render contract.

Immediately before prompt-length QC, build a deterministic identity-lock block from the canonical manifest. For every entry it must bind the exact name and index and state that the provider must preserve:

- exact same person and facial identity;
- face shape and facial proportions;
- skin tone;
- hairline, hairstyle, and hair color;
- clothing/outfit, colors, accessories, and shoes when visible;
- distinguishing physical features.

It must explicitly prohibit face replacement, beautified/new identity, hairstyle changes, wardrobe changes, and cross-character identity swaps. The block is idempotent: an existing system-authored block is replaced, not duplicated.

The block is supplied to prompt QC as protected content. After QC, the system validates that every manifest entry and every required identity attribute remains present. The exact final prompt is both persisted and sent to the provider.

### 5.4 Attachment ordering and capacity

Provider `referenceImageUrls` ordering is:

1. mandatory primary portraits in canonical manifest order;
2. optional supplementary character sheets;
3. optional location reference;
4. optional product reference.

Capacity trimming may remove optional references from the end but must never remove mandatory portraits. If mandatory portraits alone exceed capacity, generation is blocked rather than degraded.

The provider payload and prompt use the same manifest instance. No later code may re-sort or reconstruct numbering independently.

### 5.5 Canonical native-dialogue contract

The complete output of `resolveShotDialogueLines` after any authorized dialogue refresh is the source of truth. LLM-returned `dialogue[]` remains descriptive output only and cannot reduce or replace the canonical list.

For a model family with `nativeAudioDialogue=true`:

1. Normalize only surrounding whitespace; do not paraphrase, merge, or remove dialogue.
2. Preserve source order and repeated lines. De-duplication must not remove intentional repeated dialogue.
3. Build one deterministic `Native dialogue (verbatim)` block containing every line and its speaker when available.
4. Replace any previously system-authored native-dialogue block to prevent duplicates.
5. Run prompt-length QC with every full dialogue entry protected.
6. Revalidate after brand sanitization, preset/style appends, persistence formatting, and immediately before provider submission.
7. If protected dialogue alone cannot fit the model's hard prompt limit, fail explicitly before a paid provider call instead of dropping a line.

The stored visible prompt and provider prompt must contain the same complete dialogue block.

### 5.6 Model-family capability invariant

Native-audio behavior is resolved from canonical model family, not provider-specific catalog spelling. Every Grok model supplied through Higgsfield, Kie, Magnific, or another provider resolves to `nativeAudioDialogue=true`. Provider metadata may add transport details but cannot downgrade the family capability.

Tests must cover provider aliases and model-id variants to prevent future seed/catalog changes from reintroducing the bug.

## 6. Error handling and user experience

- Missing character references produce a blocking toast/message listing all affected character names in one response.
- Model-capacity failure states both the supported and required counts.
- Unknown stale character keys are reported separately from missing portraits so data repair is clear.
- Prompt-contract failures are logged with series, episode, shot, model family, required keys, and missing contract elements, excluding secrets and signed URL query parameters.
- Existing generated assets are not deleted or modified when a new generation attempt is blocked.

## 7. Testing strategy

### Unit tests

- Resolver preserves `requiredCharacterRefs` order despite shuffled database rows.
- One, two, and three-character manifests receive consecutive indices and all primary portraits.
- Duplicate character keys do not duplicate attachments.
- Missing one of three portraits returns all missing character names and performs no credit/provider calls.
- A two-reference model rejects a three-character shot.
- Optional sheet/location/product references are trimmed before any primary portrait.
- Identity-lock block contains each character/index and every locked attribute; repeated execution is idempotent.
- Prompt QC cannot remove identity-lock protected content.
- Three canonical dialogue lines survive an LLM response containing only two.
- Three lines survive over-limit refinement, sanitization, and style append.
- Intentional repeated dialogue remains repeated and ordered.
- Protected dialogue overflow fails explicitly.
- All Grok provider aliases resolve native audio from the family invariant.

### Router/service integration tests

- `generateStartFrameImage` sends the exact ordered URLs and final visible prompt.
- `generateStartFrameAngleVariations` uses the same preflight and manifest.
- Failed image preflight does not call credit deduction or `generateImageAsync`.
- `generateShotVideoPrompt` persists all dialogue lines.
- `generateVideoClip` revalidates the same lines immediately before provider submission.
- Single-shot and speaker-switch video-prompt paths enforce identical dialogue guarantees.

## 8. Rollout and compatibility

- No schema migration is required.
- Existing stored prompts are repaired on the next prompt/image generation; existing assets remain untouched.
- The fail-closed behavior is intentionally stricter than the prior tolerant behavior because silently generating the wrong person wastes credits and violates the requested identity guarantee.
- Instrument blocked attempts and provider submissions with required/resolved character counts to verify rollout behavior.

## 9. Acceptance criteria

1. A shot requiring ฝ้าย, ใบข้าว, and a third character cannot start paid generation unless all three approved primary portraits are attached in that exact order.
2. The prompt binds each character to the matching `Image N` and explicitly forbids changing face, hairstyle, or clothing.
3. If any portrait is absent, the UI lists every missing character and no credits/provider task are created.
4. If the model supports fewer mandatory references than required, the UI explains the exact capacity mismatch and generation does not start.
5. A native-audio shot with three dialogue cards persists and submits all three lines verbatim and in order.
6. Grok has native audio across Higgsfield, Kie, Magnific, and future provider mappings through a single model-family invariant.
7. Regression tests cover both persisted prompts and final provider payloads.
