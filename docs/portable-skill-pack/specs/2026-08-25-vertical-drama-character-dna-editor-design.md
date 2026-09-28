# Vertical Drama Character DNA Editor in the Character Tab

## Status

Design approved by the user for spec review. Implementation has not started.

## Problem

Character visual DNA is already persisted and used by the image-generation
pipeline, but the Character tab does not expose the authoritative values. A
user can enter casting notes such as `อายุ 20 ปี`, while the actual persisted
Character DNA still contains `visualBible.ageRange = "early 30s"`. The user
cannot discover which value is authoritative or correct it in place.

## Goals

1. Show the exact canonical DNA used by character image generation inside the
   existing Character tab, per character.
2. Let the user edit identity-critical DNA in structured fields.
3. Keep story/design analysis visible for inspection, but read-only.
4. Save DNA without automatically generating a prompt, image, or charging
   credits.
5. Make the next generation use the edited age and identity fields with an
   unambiguous precedence contract.
6. Preserve unrelated character data and protect the update by tenant, user,
   series, and character ownership.

## Non-goals

- No new standalone DNA page.
- No raw JSON editor in the first version.
- No automatic prompt or image generation after saving DNA.
- No deletion of existing portraits or reference assets.
- No user editing of AI comparison scores, story rationale, public mask,
  hidden truth, or other story/design metadata in the first version.

## Authoritative data map

The editor must read from the same persisted object used by the generation
pipeline:

| UI concept | Persisted location | Edit policy |
| --- | --- | --- |
| Canonical age band | `character.data.visualBible.ageRange` | editable |
| Canonical facial identity | `character.data.visualBible.designDna.faceIdentity` | editable |
| DNA hair/skin/face anchors | `character.data.visualBible.designDna.faceIdentity` | editable |
| Full approved Character DNA | `character.data.visualBible.designDna` | partially editable |
| Visual identity summary | `character.data.visualBible.visualIdentitySummary` | read-only/derived |
| Identity anchors | `character.data.visualBible.identityAnchors` | read-only/derived |
| Hair and makeup notes | `character.data.visualBible.hairMakeupNotes` | read-only/derived |
| Wardrobe, performance, story intent, anti-clone checks | `visualBible` and `designDna` fields | read-only |
| Free-form casting notes | `character.data.castingPreferences.additionalDetails` | editable, non-canonical note |

`visualBible.ageRange` and `designDna.ageRange` must be kept synchronized on
every DNA update. The age resolver must treat this edited value as a canonical
story fact before approved-DNA and role inference.

## UI design: Character tab

Inside the selected character detail card, add a collapsible section named
`Character DNA — ข้อมูลหลักที่ใช้สร้างภาพ`.

When DNA exists, the section is visible by default and contains:

### Canonical identity section (editable)

- Age / age range
- Face geometry
- Eyes and gaze
- Brows
- Nose
- Lips and smile
- Skin and texture
- Hair
- Distinctive asymmetry

Each field uses a labelled textarea/input with the current persisted value,
not a regenerated paraphrase. The age field must show the source label
`Canonical age used by generation` so the user can distinguish it from
additional casting notes.

The section includes `บันทึก Character DNA` and `ยกเลิก` actions. Save is
disabled until a value has changed and is blocked while the mutation is
pending.

### Inspection-only story/design section

Show the remaining DNA in a readable, grouped layout:

- design intent and series alignment
- role tier and beauty archetype
- body language and recall stack
- costume grammar
- public mask, hidden truth, narrative promise
- attractive contradiction
- forbidden drift and anti-clone checks
- scores, threshold status, rationale, and comparison evidence

These fields are explicitly marked `AI/story design metadata — read-only`.

### Status and source disclosure

At the top of the section show:

- DNA status: `Canonical`, `User edited`, or `No DNA yet`
- source model and creation timestamp when present
- identity DNA revision
- whether the last prompt/portrait was generated from the current DNA revision

After a successful edit, show a persistent warning in the same Character tab:
`DNA ถูกแก้ไขแล้ว Prompt/ภาพเดิมอาจยังไม่ตรง — สร้าง Prompt ใหม่`.

The existing casting-details field remains below the DNA section, renamed or
labelled as `Additional casting notes (ไม่ใช่ Canonical DNA)` and with helper
text explaining that age and identity must be edited in Character DNA.

For a legacy character without `visualBible.designDna`, show an empty state:
`ยังไม่มี Character DNA` with the existing preview/generate action. Do not
invent placeholder DNA in the editor.

## Data contract and persistence

Add a dedicated tenant-scoped tRPC mutation, for example
`updateCharacterIdentityDna`, rather than sending a generic replacement of the
entire `data` JSON object from the browser.

Input contract:

- `seriesId`
- `characterId`
- `ageRange`
- the eight editable `faceIdentity` fields
- an optimistic/current DNA revision

The server must:

1. Load the owned character using tenant, user, series, and character IDs.
2. Validate all edited text using the same bounded DNA constraints as the
   existing Character DNA schema.
3. Require an existing valid `visualBible.designDna`; return a clear
   precondition error when no DNA exists.
4. Merge only the approved editable fields.
5. Write both `visualBible.ageRange` and `designDna.ageRange` from the same
   normalized value.
6. Preserve model, creation time, story/design metadata, references,
   descriptions, casting preferences, and unrelated `data` keys.
7. Increment `identityDnaRevision` and set a user-edit timestamp/source marker
   in the JSONB visual-bible metadata. No SQL migration is required for these
   additive JSONB metadata fields.
8. Return the refreshed character DTO.

The mutation must reject a stale revision rather than silently overwriting a
newer DNA edit. The UI should refetch and show the current values when this
happens.

## Generation precedence and stale detection

The next character prompt/candidate generation must use this precedence:

1. Explicit canonical age/identity fields from the edited Character DNA.
2. Existing approved Character DNA fields not edited by the user.
3. Role, occupation, and description inference.
4. Free-form casting notes only as secondary casting guidance.

When a prompt/visual bible is generated, persist the identity DNA revision it
used as `promptDnaRevision`. The Character tab compares it with the current
`identityDnaRevision` to show whether the prompt/portrait is stale. Saving DNA
does not regenerate anything and does not charge credits.

Existing portraits remain available. They are not silently deleted or replaced;
the stale indicator tells the user when regeneration is appropriate.

## Failure handling and security

- Tenant/user/series/character ownership is checked server-side for every DNA
  read and write.
- Malformed or overlong fields are rejected with field-level validation errors.
- Missing/invalid legacy DNA produces an actionable empty state rather than a
  partial destructive save.
- Concurrent edits use the revision check and never overwrite newer DNA.
- A failed save leaves the persisted DNA and existing portrait unchanged.
- No private IDs or raw unbounded character data are added to browser payloads
  beyond the already authorized character DTO.

## Verification plan

### Shared/server tests

- DNA patch validation accepts valid identity fields and rejects bounds errors.
- Age is synchronized into both visual-bible age locations.
- Identity-only updates preserve story/design fields and unrelated character
  data.
- Tenant/user/series scoping rejects cross-owner updates.
- Stale revision updates fail safely.
- Edited age has priority over approved DNA and role inference.
- Prompt generation records and compares the DNA revision.

### UI tests

- Character tab displays persisted `designDna` values and `ageRange`.
- Edit/save works without triggering image or prompt generation mutations.
- Read-only story/design metadata cannot be edited.
- Save success shows stale-prompt status and refreshes the values.
- Legacy no-DNA and mutation-error states are actionable.

### Browser verification

Verify in the Character tab that:

1. A character with `early 30s` visibly shows that value under Canonical DNA.
2. Changing it to `20` and saving updates the displayed DNA.
3. No generation request or credit transaction occurs on save.
4. Clicking the explicit Prompt generation action uses the edited age.
5. The old portrait remains visible but is marked as potentially stale.

## Rollout and migration

The first version uses the existing character JSONB storage and adds no SQL
migration. Existing rows remain valid. The UI must support rows with no DNA,
legacy DNA without new revision metadata, and DNA generated before the editor
was introduced. Revision metadata is initialized lazily when a user edits or a
new prompt is generated.

## Acceptance criteria

- A user can find and edit Character DNA entirely within the Character tab.
- The exact persisted age used by generation is visible beside the editable
  identity fields.
- Editing `ageRange` to `20` prevents the next generation from falling back to
  `early 30s` or role-inferred `30–35`.
- Story/design DNA remains inspectable and protected from accidental edits.
- Save never automatically generates an image or consumes credits.
- Existing character data and images remain intact after an edit.
