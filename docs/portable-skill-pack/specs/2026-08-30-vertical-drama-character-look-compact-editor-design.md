# Vertical Drama Compact Character Look Cards and Prompt Editor

## Goal

Make the Characters page production-friendly when a character has long,
LLM-generated look data. Each nested look must be scannable without exposing
the full prompt in the roster. The full visual prompt remains editable in a
real, owner-scoped editor and remains compatible with the existing
LLM-only character-look designer and identity-lock pipeline.

## Approved approach

Use a compact nested look card with:

- look name as the primary label;
- a bounded one-line visual summary;
- small status/context badges when available (look type, age stage, readiness);
- a separate action row for `แก้ไข prompt`, `ซ่อมด้วย AI`, image generation,
  and delete;
- a Dialog for editing the full prompt in one textarea, with save/cancel.

The editor is intentionally a single full-prompt field for compatibility with
legacy rows. It does not expose or mutate canonical face/body identity DNA.
Saving updates the look row's derived visual prompt fields through the existing
owner-scoped `updateCharacter` mutation and preserves all unrelated `data`
fields. It marks the derived look as manually edited so future automatic repair
does not silently overwrite the user's edit; explicit `ซ่อมด้วย AI` remains
available.

## Non-goals

- no mock data or hardcoded prompt content;
- no new external dependency;
- no new AI skill (the existing discoverable
  `vertical-drama-character-look-designer` skill remains the repair path);
- no change to the canonical face, body proportions, identity DNA, or age
  contract;
- no automatic rewrite of story evidence from the UI;
- no migration unless exact runtime evidence proves it is required.

## Data contract

For a nested look row, the editor loads the prompt in this order:

1. `data.lookImageBrief` when present;
2. `data.description` as a legacy fallback;
3. a blank value with an explicit empty state.

On save, trim and require non-empty text, then preserve the existing JSON data
and write:

- `description`: the edited visual prompt for the human-facing legacy field;
- `lookImageBrief`: the edited prompt for image generation;
- `lookPromptEdited: true`: tells the card summary to prefer the edited prompt
  over a now-stale structured design summary;
- generic server-stamped manual-edit provenance (`userEditedAt`,
  `userEditedBy`, and incremented `editVersion`);
- `lookDesignStatus: "review"` when an existing structured design may now be
  stale, without deleting `lookDesign` or evidence provenance.

The prompt remains bounded by the server's existing JSON field limits and must
not be sent as an unvalidated client-only patch.

The per-look Generate dialog does not copy the persisted prompt into its
500-character `customInstruction` field. The saved look prompt remains the
single server-side source used by the visual look pipeline; Generate exposes
only an optional, one-render supplemental instruction. This prevents a
truncated Generate value from diverging from the full value shown by Edit.

## UI/UX contract

### Compact card

- Never render an unbounded `data.description` or `lookImageBrief` in the card.
- Name and summary stay on one line with truncation/ellipsis; the full prompt
  is never exposed by the compact card or a tooltip.
- A compact metadata row may show `outfit`/`age_stage`, canonical age stage,
  and `ready`/`review` without using color alone.
- Actions are visibly labeled where space permits; icon-only controls retain
  accessible labels and tooltips.
- The selected look keeps the current selected border/background behavior.
- Image preview, selection, drag/drop, generate, repair, and delete semantics
  remain unchanged.

### Prompt editor Dialog

- title identifies the character and look;
- helper text explains that only visual look prompt fields are edited and the
  same face/body/identity/age are preserved;
- full prompt is editable in a scrollable textarea;
- character/look identity context is read-only and visible;
- save is disabled for blank/unchanged input or while mutation is pending;
- cancel and Escape close without persistence;
- success invalidates the roster query and closes the dialog;
- mutation errors keep the Dialog open and show the existing error handling.

## API boundary

Prefer the existing `verticalDramaCharacters.updateCharacter` mutation. Add a
narrow client-side payload builder/helper and use a read-modify-write patch
that preserves all existing look data. If the existing mutation cannot safely
express this without wiping fields, add a dedicated owner-scoped server
mutation instead of weakening generic update semantics.

## Verification and acceptance

- focused pure-helper tests cover prompt precedence, summary bounding, trim,
  unchanged/blank save decisions, and legacy malformed data;
- focused component/interaction tests cover opening the editor, saving,
  canceling, pending/error states, and all-look availability;
- server contract tests prove unrelated `data` keys and identity fields are
  preserved;
- run `git diff --check`, affected Vitest files, and the relevant build/type
  check;
- browser verification is reported separately and is not claimed without an
  authenticated Debian run.

## Five-round design completeness review

### Round 1 — information architecture

Gap found: the previous layout mixed long prompt text and actions in one row.
Closure: bounded summary plus a dedicated editor Dialog and separated action
row.

### Round 2 — legacy data compatibility

Gap found: old rows may have only `description`, only `lookImageBrief`, null
data, or story prose. Closure: deterministic precedence/fallback, bounded
rendering, no throw, and explicit AI repair remains available.

### Round 3 — identity and age safety

Gap found: prompt editing could accidentally appear to edit identity. Closure:
editor copy and server patch preserve identity DNA, face/body facts, age fields,
variant type, and provenance; structured design becomes `review` when edited.

### Round 4 — interaction and accessibility

Gap found: nested cards already contain multiple interactive controls and can
accidentally select the parent. Closure: stop propagation for editor actions,
real buttons, accessible names, keyboard-close Dialog, visible focus, and no
color-only status.

### Round 5 — runtime and failure boundaries

Gap found: local build/restart does not prove authenticated production UI, and
generic update could overwrite JSON. Closure: preserve unrelated keys with a
server-owned patch boundary, focused tests, Debian build/service proof, and
explicitly separate browser/deployment proof from local proof.

### Follow-up contract check — Generate/Edit source parity

Gap found: Generate prefilled a separate 500-character supplemental field from
the full persisted prompt, while Edit showed the complete prompt. Closure:
Generate now starts with an empty optional supplement and explicitly indicates
that the saved Edit prompt is the canonical source used for rendering.

## Review status

All five review rounds are closed for the approved scope. Implementation may
start with the existing React/shadcn primitives and the existing mutation
unless exact source inspection proves the dedicated mutation boundary is safer.
