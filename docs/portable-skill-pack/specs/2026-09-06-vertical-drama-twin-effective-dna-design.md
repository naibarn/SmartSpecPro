# Vertical Drama Twin Effective DNA

## Goal

Make twin characters explicit, easy to understand, and stable across all generated
shots without changing the existing episode-shot workflow. Twins remain two
independent character entries in episode UI, but their face identity and apparent
age are shared. Hair, wardrobe, personality, body language, color accents, and
silhouette may differ.

## Non-goals

- Do not merge twin rows into one character.
- Do not change `characterKey` values or the per-shot character picker contract.
- Do not auto-spend credits or silently regenerate existing media.
- Do not treat age-stage variants (for example an infant look) as a twin identity.

## Current evidence and root cause

- `vertical_drama_characters.sharesFaceWithCharacterId` is the durable twin link,
  but it is nullable and directional.
- The Characters tab only renders a twin badge when that field resolves to another
  row; the DNA editor has no twin relationship field.
- The canonical design-DNA schema has age and facial fields but no twin relation.
- Series 53 has twin wording in `role` for ภูมิ/ภาคิน, but both rows have a null
  `sharesFaceWithCharacterId`. ภูมิ has a 9-year DNA; ภาคิน has no base DNA, and
  an infant variant was selected in episode 258.
- Existing storyboard JSON is a snapshot and can remain stale after character
  data changes.

## Recommended architecture

### 1. Durable relationship

Keep `sharesFaceWithCharacterId` as the compatibility source of truth. Add a
server-side relationship resolver that treats the pointer as an undirected pair
for display and validation, while preserving the existing one-way storage format.
This avoids a disruptive schema migration and remains compatible with existing
variant/twin rows.

For the affected legacy pair, a scoped repair/backfill links ภาคิน to ภูมิ. The
operation is idempotent and records no paid action. It must not overwrite either
character's independent name, role, or wardrobe data.

### 2. Effective Twin DNA

Build a pure, shared resolver that returns:

**Shared/canonical fields**

- apparent age range
- facial geometry
- eyes and gaze
- brows
- nose
- lips and smile
- skin tone and texture
- distinctive facial asymmetry/marks

**Per-character fields**

- hair and makeup
- costume grammar and wardrobe
- silhouette/color accents
- body language and personality
- public mask, hidden truth, narrative promise, emotional hook

The canonical shared fields come from the most authoritative approved DNA in the
twin pair. When one twin has no base DNA, relationship repair materializes the
shared fields from the authoritative sibling into that twin's `visualBible` while
preserving its local hair/wardrobe/personality fields. Both rows carry a small
provenance marker (source character id and source DNA revision) so the UI can show
that these values are inherited rather than independently designed. Generation is
blocked only when the pair has no authoritative shared identity at all; it must
never invent a second face silently.

The resolver exposes provenance/revision information so prompt generation can
record which character DNA revision supplied the shared identity.

### 3. Episode generation boundary

Before generating a prompt or image for a shot, the backend reloads the latest
character rows and approved reference assets. It does not trust an old storyboard
snapshot for identity facts.

The episode flow remains unchanged:

- each twin keeps its own character chip and `characterKey`;
- shot selection, dialogue, blocking, and reference-picker interactions remain
  independent;
- only the identity payload sent to prompt/image generation is enriched with the
  effective twin DNA and a hard face lock.

The prompt contract must state that both twins share the same face and apparent
age/maturity range, while explicitly preserving the selected twin's own hair,
clothing, and personality. A shot cannot pair incompatible age-stage variants;
the user receives a non-paid validation error with the compatible alternative.

### 4. Characters tab UX

Reuse the existing roster-card and selected-character header patterns in
`VerticalDramaCharacterStockPanel.tsx`.

Add:

- a visible `ฝาแฝดกับ <name>` badge on both members of a linked pair;
- a compact Twin Relationship section showing the linked character, shared age,
  shared face fields, and per-character differences;
- shared face/age fields are synchronized into both characters' DNA snapshots,
  while local fields remain independently editable;
- an explicit read-only/effective-DNA explanation so users know which fields are
  inherited and which are local;
- a safe repair state for legacy text-only twins (detected from role/description),
  with one idempotent “บันทึกความสัมพันธ์แฝด” action that performs no generation.

Do not add a new twin concept to the episode page. The episode page only receives
the enriched generation payload.

## UI/UX Contract

### Target User / JTBD

- Role: Vertical Drama creator/editor.
- Goal: Confirm which characters are twins and trust that generated shots preserve
  the same face and age.
- Entry point: Characters tab, then normal prompt/image generation in an episode.
- Success outcome: Twin relationship is obvious in the roster; generated twins are
  visually identical in face/age while retaining deliberate styling differences.

### Existing Pattern Reference

- Roster grouping/badges: `VerticalDramaCharacterStockPanel.tsx`.
- Per-shot character reference selection: `VerticalDramaStoryboardPanel.tsx`.
- Decision: reuse existing cards, badges, details, and picker patterns; diverge only
  by adding the shared-vs-local DNA explanation and relationship action.

### Surface Inventory

| Surface | Change |
|---|---|
| Characters tab roster | symmetric twin badge and legacy-repair state |
| Character detail header | twin relationship summary |
| Character DNA panel | effective shared DNA + local override explanation |
| Episode prompt/image action | fresh character reload and effective twin DNA; no layout/flow change |

### State Matrix

| State | Expected behavior |
|---|---|
| linked and complete | show shared DNA and normal generation |
| text-only legacy twin | show detected relationship and repair action |
| missing shared DNA | block generation with actionable error |
| incompatible selected variant | block before paid action and suggest matching age look |
| loading | preserve existing skeleton/spinner patterns |
| mutation error | retain draft UI and show retryable error; no duplicate write |

### Responsive Matrix

Use existing roster/detail responsive behavior at mobile 390x844, tablet 768x1024,
desktop 1440x900, and dense-layout checks at 1024x768. The Twin Relationship section
must wrap without horizontal overflow.

### Accessibility Acceptance

- Relationship badge has readable text, not color-only meaning.
- Repair action has an explicit label and keyboard focus state.
- Shared/local DNA sections use semantic headings and readable labels.
- No new motion requirement; respect existing reduced-motion behavior.

### Copy Contract

- `ฝาแฝดกับ {name}`
- `DNA ร่วมของฝาแฝด`
- `ส่วนที่แตกต่างได้: เสื้อผ้า ทรงผม บุคลิก และท่าทาง`
- `บันทึกความสัมพันธ์แฝด`
- `ไม่สามารถสร้างภาพได้ เพราะ DNA กลางของแฝดยังไม่ครบ`
- English equivalents remain available through the existing localization helper.

### Browser Evidence Required

Verify the Characters tab at the required mobile/tablet/desktop viewports and run
the existing episode prompt/image flow without changing its controls. No paid media
generation is required for the code gate; use no-credit admission/contract checks.

## Failure handling and safety

- Never silently fall back to independently invented twin faces.
- Never charge credits for relationship repair, DNA reconciliation, or validation.
- Existing prompts/images are marked stale when the effective twin DNA revision
  changes; regeneration remains an explicit user action.
- All relationship reads/writes remain tenant, user, and series scoped.
- Relationship repair is idempotent and refuses ambiguous multi-match inference.

## Verification plan

- Unit tests for symmetric relationship resolution and effective-DNA merge rules.
- API/router tests for relationship projection, repair idempotency, and tenant scope.
- Pipeline tests proving fresh-row reload, same age/face lock, and incompatible
  variant rejection.
- Component tests proving both roster members show the relationship and the episode
  UI contract remains unchanged.
- `git diff --check` plus focused TypeScript/Vitest tests; avoid heavyweight full
  checks when RAM constraints make them unsafe.
