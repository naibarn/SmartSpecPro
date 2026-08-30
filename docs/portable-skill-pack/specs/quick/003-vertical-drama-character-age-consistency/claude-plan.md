# Implementation Plan: Dynamic Casting Age Consistency

## 1. Objective and boundaries

Fix age drift in the existing Vertical Drama character-casting candidate flow. The
system will resolve one character-specific apparent-age profile from authoritative
story/DNA facts and apply it consistently to every candidate in a 1–5 image batch.

This plan covers normal candidate casting and reference-guided casting through
`character-candidate-prompt`. It does not change the downstream character reference,
storyboard, shot, variant, twin, or production-generation flows. It requires no new
database table, migration, dependency, image model, or pixel-age classifier.

## 2. Chosen solution

Use a shared server-side `CharacterCastingAgeProfile` contract and resolve it before
either candidate prompt path. The resolver is pure and receives already-authorized
character facts; it does not query the database or let the image model invent the
contract independently for each image.

The profile contains:

- `min` and `max`: bounded apparent ages;
- `label`: localized/display-safe range text;
- `source`: `story_fact`, `approved_dna`, `age_stage_variant`, or `role_inference`;
- `confidence`: `explicit`, `structured`, or `inferred`;
- `rationale`: short bounded explanation without private model reasoning.

Precedence is explicit story age/range, approved Visual Bible/DNA age, age-stage
variant facts, then role/occupation/relationship/story inference. If no safe range can
be derived from either facts or meaningful role/story context, the server fails closed
with a clear setup error rather than falling back to 24–25 for every character. Existing
characters with a usable role/description should normally reach role inference. Examples
such as 17–19 for a student, 22–25 for a young
working adult, and 30–35 for an intentionally older lead are contextual outcomes of
the resolver/skill, not universal age constants.

The profile is resolved once per character and reused across all candidates. The normal
Visual Bible candidate contract receives a server-authoritative shared age directive and
must return compatible `age_range` values for every DNA. The reference-guided adapter
receives the same numeric range as `age_min`/`age_max` and the skill's single plain-text
prompt is reused for each independent image task.

## 3. Data and contract changes

### 3.1 Shared age profile module

Create a focused shared/server module near the existing character profile/context
contracts, preferably `apps/web/shared/verticalDramaSeries/characterCastingAge.ts`
for the type and pure validation, with a server resolver in
`apps/web/server/services/verticalDramaCharacterCastingAge.ts` if extraction requires
server-only normalization.

The input facts should include only bounded, authorized values already available in the
character row/design context: explicit age text/range, `visualBible.ageRange`,
`designDna.ageRange`, role/narrative role, occupation, relationship facts, age-stage
variant metadata, description, and compact story context. Do not pass tenant IDs,
provider URLs, full prompts, or untrusted instruction text into the resolver.

Define deterministic normalization for numeric ranges and common decade/range text.
Keep the inference policy isolated and table-driven so role examples can evolve without
changing router logic. Explicit facts win over inferred role signals. Preserve a
separate range for each character; never derive the female lead's range from the male
lead or vice versa.

Under-18 profiles must be valid for casting but carry an age-appropriate,
non-sexualized safety directive. The resolver and imported skill schema must share the
existing validated age-stage lower bound rather than retaining the current adult-only
minimum of 18; 17–19 must be covered by contract tests. The resolver must reject
malformed or unsafe bounds, not silently clamp a story fact into an adult range.

### 3.2 Normal candidate-generation path

Modify `apps/web/server/services/verticalDramaCharacterImageGeneration.ts` to:

1. accept an optional resolved age profile in the candidate-generation input;
2. include a server-authoritative `casting_age_profile`/age directive in the input
   payload and candidate user prompt;
3. explicitly require every candidate to stay in that same apparent-age range and never
   age up/down as candidate index increases;
4. validate each returned `character_design_dna.age_range` against the shared profile;
5. use existing bounded schema retry/fail-closed behavior when the model omits or
   materially changes the range; and
6. retain the profile in the approved candidate snapshot/metadata used by selection.

Do not ask the model to choose a new range independently per candidate. If the source is
role inference, the model may author age-appropriate prose within the already-resolved
range, but the server owns the numeric contract.

When a legacy approved DNA is removed for a no-primary recast, preserve its age evidence
for resolution even if face-lock fields are stripped. The recast should unlock the face,
not erase the character's story age.

### 3.3 Reference-guided path

Modify `apps/web/server/routers/verticalDramaCharacters.ts` and
`apps/web/server/services/verticalDramaCharacterReferenceCasting.ts` to consume the
same profile. Remove the adult-only `Math.max(18, ...)` behavior and the universal
24–25 fallback. Resolve the age profile from character/DNA/role facts before building
the adapter input.

Update `apps/web/skills/character-candidate-prompt/schemas/input.schema.json` and the
skill instructions so age-appropriate teen ranges such as 17–19 are valid. Keep the
existing limit of 1–5 images in the product route even if the imported skill schema
allows a wider generic range. Add explicit wording that all outputs use the same
apparent-age band, are age-appropriate, and are new fictional people guided by—not
copied from—the references.

Persist the resolved profile with the reference-guided candidate batch metadata. The
plain-text skill output remains plain text; the profile is not inferred by parsing free
form output after the fact.

### 3.4 Candidate validation and persistence

Extend the existing candidate batch validator/metadata projection so the batch carries
one profile fingerprint or normalized range. At submission time, verify the stored
profile and candidate count before creating provider tasks. Do not submit a batch with
missing or inconsistent age metadata.

When the user selects a candidate as the primary portrait, preserve the existing atomic
selection behavior and ensure the selected Visual Bible/DNA retains the approved age
range. Sibling candidates remain casting alternatives and must not become automatic
identity references.

No migration is expected because character Visual Bible and candidate metadata already
use JSON/JSONB-compatible structures. Keep new fields optional for legacy rows.

## 4. UI/UX contract

### Target User / JTBD

- Role: Vertical Drama creator casting a character.
- Goal: compare 1–5 attractive, role-appropriate faces that remain in the same age
  band, then select one primary portrait.
- Entry point: Drama Series → Characters → first portrait/candidate generation.
- Success: user understands the age was derived from the story/DNA and can choose a
  consistent candidate without manually entering an age.

### Existing Pattern Reference

- Searched with targeted `rg` in `apps/web/client/src/components/verticalDramaSeries`.
- Reuse `VerticalDramaCharacterStockPanel.tsx` candidate count controls, prompt/credit
  preview, candidate cards, and existing status/selection patterns.
- Reuse existing age-stage labels and character DNA display conventions in the same
  panel. Do not create a new modal or a second age editor.
- Decision: reuse. The age explanation is additive and read-only because canonical age
  belongs to story/DNA, not an ad-hoc image-generation setting.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Character casting controls | `VerticalDramaCharacterStockPanel.tsx` | Show derived age range/source read-only above generation controls |
| Candidate preview/batch | same panel | Show shared age directive in the summary and candidate result state |
| Candidate generation router | `verticalDramaCharacters.previewCharacterPrompt` | Return bounded age profile projection and reject unresolved age |
| Reference-guided casting | same route/adapter | Use the same profile for `character-candidate-prompt` |

### Component Map

| Component/module | Owns | Consumes |
|---|---|---|
| `VerticalDramaCharacterStockPanel` | Read-only explanation, loading/error copy, no age input | Router preview age projection |
| Age profile resolver | Source precedence and bounds | Authorized character/DNA/story facts |
| Normal candidate generator | Shared prompt directive and candidate age validation | Resolved profile |
| Reference casting adapter | `age_min`/`age_max` skill input and safety wording | Resolved profile |
| Candidate persistence/selection | Batch profile metadata and canonical snapshot retention | Server-validated profile |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| resolved | Show range, e.g. “ช่วงอายุจากบทบาท: 17–19 ปี” and source badge | Component test |
| inferred | Show “ระบบประเมินจากบทบาทและบริบทเรื่อง” without exposing reasoning | Component test |
| loading | Disable duplicate generation and show existing progress state | Existing UI flow test |
| unresolved/error | Explain that age context is insufficient; keep generation disabled | Router/UI test |
| candidate success | Show one shared age range for the batch, not five different ages | UI test/browser evidence |
| partial provider success | Preserve existing per-card recovery; do not alter age profile | Existing candidate recovery tests |
| selected | Keep primary selection behavior; show the selected portrait as canonical | Existing selection test |
| disabled/read-only | No manual age field; controls remain keyboard-accessible | Accessibility check |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Age explanation wraps above controls without horizontal overflow | Browser/manual screenshot |
| tablet 768x1024 | Badge and count controls remain readable in one or two rows | Browser/manual screenshot |
| desktop 1440x900 | Explanation aligns with existing casting control panel | Browser/manual screenshot |
| small-mobile 360x800 | Long Thai/English copy wraps and does not push generate button off-screen | Responsive check |
| laptop 1024x768 | Candidate summary remains visible above cards | Responsive check |
| wide-desktop 1280x800 | No change to candidate card grid density | Visual regression check |

### Accessibility Acceptance

- Use a semantic description/alert region for derived age and errors, not color alone.
- Provide an accessible label for the age source and range; no unlabeled badge.
- Preserve keyboard order: age explanation → reference/options → count → generate.
- Preserve visible focus, contrast, and existing button semantics.
- Do not introduce motion; existing loading animation must respect reduced-motion
  conventions.

### Visual Direction

Reuse the existing casting panel hierarchy and semantic tokens. The age explanation is a
low-emphasis informational block near the existing character facts, with a stronger
warning treatment only when unresolved. Do not use raw colors, new decorative cards, or
large typography that competes with candidate images.

### Copy Contract

- Tone: clear, reassuring, production-oriented; explain that age comes from the story.
- Thai primary: `ช่วงอายุสำหรับการแคสติ้ง: 17–19 ปี` and
  `อ้างอิงจากบทบาทและ DNA ของตัวละคร`.
- English fallback: `Casting age range: 17–19` and
  `Derived from the character role and DNA`.
- Error: `ยังระบุช่วงอายุจากบทบาทตัวละครไม่ได้ กรุณาเพิ่มอายุหรือรายละเอียดบทบาทในข้อมูลตัวละคร`.
- Candidate warning: `ผู้สมัครทั้งหมดจะอยู่ในช่วงอายุเดียวกัน และจะไม่ถูกปรับให้แก่หรือเด็กลงตามลำดับภาพ`.
- Under-18 note: `การแสดงผลจะคงความเหมาะสมตามวัยและไม่ทำให้เป็นภาพเชิงยั่วยุ`.
- Keep translations beside existing character-stock copy conventions; fall back to
  current locale behavior.

### Browser Evidence Required

Follow the existing browser-verification policy. Capture/manual-check the Characters
surface at 390x844, 768x1024, and 1440x900 for resolved age, unresolved error, and a
five-candidate batch. Provider-backed generation is not required for unit proof; if no
authenticated browser/provider run is available, report that limitation separately.

## 5. Failure modes and operational behavior

- Missing age context: fail before credit reservation or image task submission; preserve
  existing retry guidance.
- Malformed explicit range: reject and surface a data-quality error; never silently
  widen it to adult defaults.
- LLM returns per-candidate drift: bounded retry once through the existing contract; if
  still inconsistent, return no candidate batch and do not spend render credits.
- Reference skill rejects a teen range: update local skill schema/content together and
  cover it with contract tests.
- Legacy DNA has age but no face lock: use its age for the new batch while allowing new
  faces.
- Candidate selection: preserve current transactional promotion and no downstream
  regeneration.

## 6. Work sequence and dependencies

1. Add the shared profile type, normalization, precedence rules, and pure tests.
2. Thread the profile through authorized character/context loading and normal candidate
   prompt input; add shared directive and cross-candidate validation.
3. Update reference adapter/router and imported skill schema/instructions for 17–19 and
   shared dynamic ages; persist profile metadata.
4. Add/adjust candidate projection and selection preservation checks.
5. Add the read-only UI explanation and localized copy.
6. Run focused tests, `git diff --check`, and the existing web typecheck targets; keep
   unrelated baseline failures separate.
7. Perform browser evidence if authenticated browser tooling is available; otherwise
   record it as unperformed.

Dependencies are intentionally ordered so both generation paths consume one contract
before UI wiring. No migration or deployment step is part of this plan.

## 7. Focused file ownership

- New: `apps/web/shared/verticalDramaSeries/characterCastingAge.ts` and/or focused
  server resolver module.
- Modify: `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`.
- Modify: `apps/web/server/services/verticalDramaCharacterReferenceCasting.ts`.
- Modify: `apps/web/server/routers/verticalDramaCharacters.ts`.
- Modify: `apps/web/shared/verticalDramaSeries/characterProfile.ts` only if the profile
  needs typed persistence.
- Modify: `apps/web/skills/character-candidate-prompt/SKILL.md` and its input schema.
- Modify: `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
  and existing locale/copy module if needed.
- Add focused tests beside resolver, image generation, reference casting, router, and
  character stock UI. Do not touch unrelated dirty files.

## 8. Verification and definition of done

Definition of done requires:

- all source-precedence and example-range tests pass;
- normal five-candidate prompt tests prove one shared age directive and reject drift;
- reference tests prove 17–19 is accepted and age safety/reference disclosure remains;
- router tests prove no universal 24–25 fallback and no loss of legacy DNA age;
- UI tests prove the range is read-only, localized, responsive-safe, and visible in the
  candidate preview state;
- focused Vitest commands pass and `git diff --check` passes;
- typecheck results distinguish touched-code failures from the known unrelated baseline;
- browser/provider/deployment proof is reported only if actually performed.

## 9. Rollback

The change is additive and can be disabled by routing candidate generation through the
existing prompt path while retaining optional metadata. No destructive data operation or
schema migration is required. Existing candidate rows without an age profile remain
readable through optional-field compatibility.

## 10. Compatibility update for inline reference picker commit

The implementation must account for commit `ff64f446d`, which moved the reference-guided
casting entry point into the inline `VerticalDramaCharacterStockPanel` picker.

- Add a single bounded-reference projection helper used by initial preview, candidate
  retry, and UI picker state. It must cap at six and use deterministic ordering.
- Do not let retry forward an unbounded list of `primary_portrait` asset links into the
  router's six-reference input contract.
- Protect the canonical primary portrait from deletion through the optional reference
  picker, or introduce a distinct casting-reference role with an explicit compatibility
  mapping. The user must not lose the main identity image merely by editing optional
  references.
- Extend the preview result/batch state with a read-only age-profile projection so the
  new inline reference surface shows the same dynamic age contract as the normal flow.
- Add focused tests for more-than-six assets, retry reference capping, main-portrait
  deletion protection, and age-profile projection.
