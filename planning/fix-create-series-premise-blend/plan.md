# Fix: Create-Series premise + preset blend fails, and the UI misdirects where to type

Date: 2026-07-31
Status: approved for implementation

## Problem statement

User typed a full story idea into the Create-Series wizard and selected 2 presets,
then pressed the "ให้ AI ผสม…" CTA. The request failed with
`ผสมแนวเรื่องไม่สำเร็จ — กดลองใหม่ได้โดยไม่ต้องรีเฟรชหน้า`.

### Root cause (log-verified, not inferred)

`journalctl -u smartspec-web.service`, 2026-07-31 09:14:56:

```
[tRPC] ERROR: verticalDramaSeries.synthesizeGenrePreset: [
  { "code": "too_big", "maximum": 100, "type": "string",
    "message": "String must contain at most 100 character(s)",
    "path": [ "genreHint" ] } ]
... code: 'BAD_REQUEST'
    at inputValidatorMiddleware
```

The request is rejected by the Zod input validator **before any LLM/skill call**.

Chain:
1. `CreateSeriesWizard.tsx:936` sends `genreHint: form.genre.trim() || undefined` — unclamped.
2. `synthesizeGenrePresetInput.genreHint` (verticalDramaSeries.ts:4054) is
   `.max(CREATE_SERIES_FIELD_LIMITS.genre)` = **100**.
3. The "แนวเรื่อง" `<Input>` (CreateSeriesWizard.tsx:2093) has **no `maxLength`**, so any
   longer text is accepted by the UI and then guaranteed to fail server validation.

### Contributing cause (the reason the field was long at all)

The user's whole story premise was typed into the box labelled **"แนวเรื่อง"** (Genre) —
a 100-char field that is an **AI OUTPUT** (`applyPresetDraft` writes it), not an input.
The real premise field ("โจทย์เรื่องที่อยากได้", 2000 chars, correctly clamped at
lines 1803-1831) sits above and was scrolled out of view in the user's viewport.
In Thai, "แนวเรื่อง" reads naturally as "story direction", so this misdirection is
predictable, not user error.

### What is NOT broken

- Premise-primary blending is fully implemented and **skill-first**:
  `skills/vertical-drama-preset-synthesizer/skill.md:172-200` ("User Premise —
  Premise-Primary Blending"), loaded verbatim as the system prompt via
  `loadSkillSystemPrompt()`, guarded by `assertPresetSynthesizerSkillSupportsV2`.
- Auto title / mainPlot / seasonArc / characters generation already works —
  `applyPresetDraft` (CreateSeriesWizard.tsx:810-840) writes all of them.
- `userPremise` IS wired server-side (contrary to the stale client TODO at line 949);
  covered by `verticalDramaSeries.userPremise.test.ts`.

Therefore **no creative logic changes** are needed. No hardcoded story rules in TS.

## Affected files

- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx` (only prod file)
- `apps/web/client/src/components/verticalDramaSeries/__tests__/` (new/updated tests)

## Proposed changes

### 1. Stop the crash — clamp every bounded hint before sending (REQUIRED)

In `handleSynthesizePreset` use the existing shared helper (already imported, line 52)
instead of raw `form.*`:

- `genreHint: clampToCreateSeriesLimit(form.genre, "genre")`
- `seriesTitleHint: clampToCreateSeriesLimit(form.title, "title")`
- `toneHint: clampToCreateSeriesLimit(form.tone, "tone")`

Helper already trims, cuts on a word boundary, and returns `undefined` for empty —
matching the `|| undefined` semantics currently in place.

### 2. Rescue the misplaced premise instead of silently truncating (REQUIRED)

Clamping alone would silently throw away the user's story. When `form.genre` exceeds
the genre limit, it is not a genre — it is a premise in the wrong box. Render an inline
notice under the genre field with a one-click action that moves the text into
`userPremise` and clears `genre`. Only offer the move when it cannot destroy data
(premise empty, or append). This preserves intent and teaches the correct field.

### 3. Make the CTA state its outcome (UX ask)

The CTA must say what the system will produce, not just "ผสม": the blend consumes the
premise + selected presets and returns title, logline, main plot, season arc, and cast.
Copy lives in `resolveCreateSeriesPresetAction` (lines 284-380).

### 4. Remove the stale TODO (lines 949-950)

Server already accepts `userPremise`; the comment claims otherwise and is misleading.

## Risk assessment

- Low. Single component, no schema/DB/server change, no migration.
- Clamping only ever shortens an already-invalid request that is currently a hard 400 —
  it cannot regress a request that succeeds today.
- Genre remains fully editable; no field is hidden or removed.
- `toneHint` clamp key "tone" (100) is stricter than the server's 180 — safe.

## Verification steps

1. New unit test: a >100-char genre produces a payload whose `genreHint` is <= 100
   (regression test for the exact 09:14:56 failure).
2. New unit test: the misplaced-premise rescue moves text to `userPremise` and clears genre.
3. Existing suites stay green: `CreateSeriesWizard.test.tsx`, preset-action tests.
4. `tsc` shows no NEW errors versus the pre-change baseline.
