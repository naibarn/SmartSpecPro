# Create Series Wizard: Skill-First Draft Gate, Partial Input, and Title Selection

**Status:** Approved and implemented; partial-input UX refinement added 2026-08-11
**Date:** 2026-08-11
**Scope:** New Vertical Drama series creation wizard only

## 1. Problem and goals

The create-series wizard currently has two inconsistent creation paths:

- A single selected preset can be applied verbatim through `apply_preset_verbatim`.
- A premise or multiple presets can be sent through the skill-backed synthesis flow.

The first path can bypass AI synthesis, draft review, title selection, and the
user's explicit confirmation. The wizard's `Next` action and stepper navigation
also rely primarily on field completeness, so a user can continue with an
unreviewed or stale draft.

This design makes the user journey uniform and preserves the following product
rules:

1. Every new series, whether sourced from one preset, multiple presets, or a
   user-written premise, must receive a skill-generated draft.
2. A single preset is an inspiration source, not a template to copy. The
   generated result must be a new randomized/derived story draft.
3. The wizard must show 4–5 generated series-title choices unless the user
   explicitly supplies a title manually.
4. The user must explicitly apply the draft before forward navigation or final
   creation becomes available.
5. Changing generation inputs or requesting a new draft invalidates the prior
   confirmation.
6. Existing series, existing episode content, current episode/shot duration
   behavior, and persisted database records remain unchanged.
7. The creator may provide only the details they know; every omitted creative
   field is completed by the skill without asking the creator to fill the form.

Non-goals:

- Rewriting existing series or retroactively generating titles for old records.
- Adding a second AI endpoint or replacing the existing skill-backed synthesis
  service.
- Changing the 9-shot episode model or shot-duration choices.
- Automatically generating a full episode/season story during this wizard gate.

## 2. User-visible behavior

### 2.1 One consistent source-to-draft flow

The source can be any of the following:

- one selected preset;
- two to five selected presets;
- a user-written premise with zero or more presets;
- existing supported lineage/basic seed inputs.

All source combinations invoke the same skill-first synthesis mutation. The
single-preset path must not expose a primary "ใช้ Preset นี้" action and must
not copy the preset fields directly into the wizard.

The panel uses the same lifecycle for every source:

`ยังไม่สร้าง` → `กำลังสร้าง` → `รอยืนยัน` → `ยืนยันแล้ว`

The UI may display a failed state, but failure never counts as a usable draft.
The user can request a new draft from the same source. A regenerate request is
always a new synthesis attempt and produces a new variation.

### 2.2 Titles

For an automatically generated title, the result must contain 4–5 distinct
`titleOptions` values. The UI displays them as selectable title cards/buttons.
The user must select one option before applying the draft; showing a recommended
`draft.title` alone is not an implicit selection.

If the user enters a non-empty title manually, that title is authoritative and
the user does not need to select a generated candidate. Applying the draft must
not overwrite the manual title. If the user clears the manual title before
creation, the normal title gate returns and a generated candidate must be
selected.

If the skill response has no valid 4–5 title candidates and the title is not
manual, the draft remains unappliable. The client must not invent titles from
the logline, preset, or `draft.title`; it must tell the user to retry.

### 2.3 Navigation and confirmation

Back navigation remains available. Forward navigation is gated:

- `ถัดไป` is disabled until the current AI draft has been explicitly applied
  and the title requirement is satisfied.
- Forward stepper clicks are disabled while the gate is unmet. Clicking a
  previous step remains allowed for editing.
- The final create action performs the same gate check again, so a disabled UI
  cannot be bypassed by stale state, keyboard activation, or a future caller.
- Existing field validation continues to run after the draft gate. Applying a
  draft does not remove the user's ability to edit any field.

The panel shows a short reason beside the disabled action, for example:

- `กด “ใช้ draft นี้” ก่อนจึงไปต่อได้`
- `เลือกชื่อเรื่อง 1 รายการ หรือกรอกชื่อเรื่องเองก่อน`
- `draft นี้เก่าแล้ว เพราะข้อมูลต้นทางเปลี่ยน — กรุณาสร้างใหม่`

### 2.4 Partial-input guidance

The premise input is the primary free-form story field. It is shown as a larger
textarea with always-visible guidance, a concrete example outside the input,
and a character counter. The guidance explains that the creator may provide
only genres, characters, setting, conflict, relationships, selling points, or
desired scenes; anything omitted is completed by AI.

The title, genre, and logline fields are explicitly described as optional or
AI-fillable. Their examples and rules are helper text outside the input rather
than placeholder-only instructions, so the guidance remains visible after the
creator starts typing. The existing output fields stay editable after applying
the draft.

## 3. Architecture and component boundaries

### 3.1 Client action resolution

Update `resolveCreateSeriesPresetAction` so a single preset returns a new
`synthesize_single_preset` action. Remove `apply_preset_verbatim` from the
wizard's active primary path. Other source combinations retain their existing
action labels and explanatory outcome text, but all point to the same draft
gate semantics.

`applyPreset` may remain only if another explicitly supported legacy caller
needs it, but it must not be reachable as the create wizard's primary action for
the selected-preset flow. The new wizard path must not set `appliedPresetId` from
an AI-derived draft; only a real stored preset identity may use that field, and
this feature does not use that legacy shortcut.

### 3.2 Draft gate state

Keep the gate transient in wizard state; no database migration is required.
Track at least:

- the source signature used for the latest synthesis;
- a unique generation/request key;
- the returned transient draft, if any;
- the applied draft key, if any;
- whether a title was explicitly selected or manually entered;
- pending/error state from the existing mutation.

The source signature includes only inputs that affect synthesis, such as:

- wizard mode and lineage source;
- normalized `userPremise`;
- selected preset IDs and categories;
- mix weights/primary selection;
- business/product context used by synthesis;
- locale and audience rating;
- any supported source brief that is sent to synthesis.

Generated output fields such as logline, characters, and visual bible are not
part of the source signature. Editing those fields after applying a draft must
not unexpectedly make the draft stale. A manually entered title is also a
separate user decision, not a synthesis source: entering or editing it must not
invalidate the generated draft. Editing a source field, changing the selected
presets, switching source mode, or starting regeneration must clear the applied
key and return the gate to a non-confirmed state.

The async success handler accepts a response only when its request key is still
the current request. A late response from an older request must not overwrite a
newer draft or restore an old applied state.

### 3.3 Existing synthesis service and skill

Reuse `verticalDramaSeries.synthesizeGenrePreset` and
`verticalDramaPresetSynthesis.ts`. No parallel endpoint is introduced.

For a single selected preset, add an explicit single-source variation contract
to the skill prompt and service prompt context:

- treat the preset as flavor/inspiration only;
- create a distinct premise, conflict, setting, cast, and title set;
- do not copy the preset title, logline, plot, season arc, characters, or
  visual-bible prose verbatim;
- preserve only the useful genre flavor and user constraints;
- return the same complete draft shape as multi-source synthesis.

Each synthesis attempt receives a server-generated variation seed/nonce that is
included in the internal prompt context. The seed is not user-controlled and
does not become persistent story metadata. A retry creates a new seed. This
keeps the existing skill-first architecture while making the intended
variation explicit and testable.

For every source mode, add a shared partial-input completion contract to the
skill prompt. Non-empty creator values are meaningful constraints; blank,
omitted, or default-only values are permission for the skill to decide. The
skill must return a complete, coherent creator-readable draft and must not ask
the creator to complete optional fields or copy UI examples into the story.

The skill output contract for this wizard requires `titleOptions` to contain
4–5 usable, non-empty, distinct strings for automatic-title mode. The existing
broader service contract may remain backward-compatible for other callers; the
wizard gate must validate the stricter requirement at its boundary by trimming,
deduplicating for validation, and rejecting a response unless the original
usable set still has 4 or 5 choices. A missing/invalid set is a retryable draft
error, not a client-side title-generation fallback.

## 4. Data flow

```text
User chooses premise/preset source
        |
        v
Normalize source + create request key + variation seed
        |
        v
Existing tRPC synthesis mutation
        |
        v
Server validates source, loads skill, asks for a new coherent draft
        |
        v
Schema/normalization + titleOptions validation
        |
        +--> invalid/failed: show retryable error, no navigation
        |
        v
Show transient draft + 4-5 title choices
        |
        +--> user edits source: mark stale, clear applied state
        +--> user requests new draft: new request key/seed
        |
        v
User selects generated title OR enters own title
        |
        v
User presses "ใช้ draft นี้"
        |
        v
Apply all supported draft fields without clobbering manual title
        |
        v
Enable forward navigation and final create validation
```

The create mutation continues to receive the existing durable wizard payload.
The draft gate is a client workflow invariant backed by final client-side
validation; it does not persist a transient draft or add a new required column
to existing series tables.

## 5. Failure handling and safety

- Skill/provider/network failure: preserve the user's source input, show the
  existing formatted synthesis error, keep navigation disabled, and allow
  retry.
- Insufficient credits or authorization failure: do not apply partial fields;
  keep the draft gate unmet and use the existing error/credit behavior.
- Invalid titleOptions: show a clear retry message and do not fabricate or
  silently accept a recommended title.
- Double-click/regenerate race: disable the generation CTA while pending and
  ignore stale responses by request key.
- Source edits after generation: mark the draft stale and require a new draft;
  edits to already-applied output fields remain ordinary user edits.
- Browser refresh/close: transient draft state may be lost; no incomplete
  transient draft is persisted as a series. Existing autosave or draft behavior,
  if any, remains outside this change.
- Old series and old preset records: no reads are rewritten and no migration or
  backfill is run.

The implementation must preserve the server's existing authorization,
visibility checks, credit accounting, and skill provenance (`sourceType:
"skill"`). No new secret, provider, or environment variable is needed.

## 6. Test strategy and acceptance criteria

### Client unit/component tests

Add or update focused tests to prove:

1. A single preset resolves to `synthesize_single_preset`, not
   `apply_preset_verbatim`.
2. The single-preset UI shows the skill-generation CTA and never offers direct
   preset application.
3. A returned draft cannot enable `ถัดไป` or forward stepper navigation until
   `ใช้ draft นี้` is pressed.
4. The same gate applies to premise-only and premise-plus-preset modes.
5. Four/five title options render and an explicit candidate selection satisfies
   the automatic-title requirement.
6. A manually entered title bypasses candidate selection but still requires
   explicit draft application.
7. Clearing a manual title restores the title gate.
8. Regeneration and source changes invalidate the prior applied state.
9. A draft without valid titleOptions cannot be applied when the title is not
   manual.
10. Applying a draft preserves a user-entered title and populates the existing
    supported tabs without setting a stored preset identity.

### Server/service and skill tests

Add focused tests to prove:

1. A single-preset synthesis reaches the skill-backed service.
2. The single-preset prompt contains the reinterpretation/distinctness rules
   and a variation seed.
3. Two retry calls receive different variation seeds/request contexts.
4. A valid draft accepts exactly 4 or 5 title options for the wizard boundary.
5. The service's existing authorization, credit, preset visibility, and schema
   validation paths remain intact.

### Verification commands

Run the focused Create Series Wizard and preset synthesis tests, plus:

- `git diff --check`;
- the repository's existing targeted TypeScript/test command for the changed
  client/server packages;
- the skill's `scripts/verify.sh` or equivalent fixture verifier when the skill
  contract is changed.

Repository-wide typecheck failures that predate these files must be reported
  separately from focused pass/fail results; they are not silently treated as
  evidence that this feature is complete.

## 7. Compatibility, rollout, and operational considerations

This is a workflow and prompt-contract change, not a persistence migration.
Existing series creation payloads remain structurally compatible, and existing
series pages/episodes are unaffected. The additional skill call for the one-
preset case changes credit/time behavior for that path because it is now a real
AI draft; the UI must make that cost visible using the existing synthesis/credit
copy before the user starts generation.

The change can be rolled out as one client/server/skill contract update. If a
rollback is needed, old persisted data remains readable because no schema or
record transformation is involved. The risk of a future caller bypassing the
gate is reduced by keeping the final create validation explicit and by testing
the action resolver rather than relying only on button visibility.

## 8. Implementation boundaries

Expected implementation files are limited to:

- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`;
- its focused wizard tests;
- `apps/web/server/services/verticalDramaPresetSynthesis.ts`;
- focused server/service tests if present;
- `apps/web/skills/vertical-drama-preset-synthesizer/skill.md` and only the
  directly related contract/fixture files required by verification.

Do not modify unrelated Vertical Drama episode/story-control code, existing
series records, shot-duration logic, or broad UI components unless a focused
test proves the change is required for this gate.
