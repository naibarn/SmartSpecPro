# Implementation Plan: Character Narrative Role and Skill-First Visual Bible V2

## Outcome

Deliver a production-safe, backward-compatible character pipeline in which a character's
canonical narrative role is assigned at series creation, visible and editable in the UI,
persisted through every character path, and passed as authoritative structured data to the
Vertical Drama Character Visual Bible skill. The skill owns the complete image prompt; the
server only normalizes facts and validates behavior.

## Constraints and invariants

- Preserve legacy `role` text and all unrelated dirty-worktree changes.
- Do not use `git reset`, broad staging, or destructive data operations.
- Add database fields/migrations; never reinterpret the legacy role column in place.
- Use existing Drizzle, Zod, tRPC, React, Vitest, and localization conventions.
- Treat story text, custom instructions, URLs, and attachment metadata as untrusted data.
- Safety, explicit identity facts, reference locks, and approved immutable DNA outrank
  generation preferences.
- No provider prompt may contain a server-authored creative suffix or the old
  `VD_CHARACTER_CUSTOM_REQUIREMENTS` marker.
- A malformed/semantically invalid skill response must fail or retry through the same skill
  only; never silently patch creative text outside it.

## Planned delivery waves

### Wave 0 — Baseline and ownership guard

Record the dirty-tree baseline and inspect targeted diffs for all planned files. Confirm the
current migration command, test commands, generated-client policy, and skill verification
entry points. Create a scoped file manifest so unrelated changes cannot be staged. Run the
existing focused character/skill tests before edits where possible and record failures that
predate this work.

### Wave 1 — Shared canonical role contract (sequential schema writer)

Create one shared role taxonomy module used by server and client. It owns:

- canonical `narrativeRole` and detailed `roleTier` enums;
- Thai/English labels and grouping metadata;
- age and safety constraints;
- legacy aliases used only for conservative normalization;
- helpers for display labels, role grouping, lead detection, and role-tier validation.

Extend the shared character DTO/profile contracts with nullable/additive canonical fields,
occupation, visual intent, review state, and provenance (`ai_assigned` or
`user_confirmed`). Keep the legacy role field for compatibility.

Add additive nullable columns to `vertical_drama_characters` for
`narrativeRole`, `roleTier`, `occupation`, `roleVisualIntent`, `roleProvenance`, and
`roleReviewStatus` (using the repository's existing camelCase-to-column naming style).
This table lineage documents a pre-existing drizzle journal collision and uses hand-authored
idempotent SQL for sibling columns; follow that convention instead of forcing a new
drizzle-kit journal entry. The migration must be tenant-safe and indexed for series/role-tier
queries if the existing index strategy supports it. Update row-to-DTO mapping and input
schemas only after the database shape exists.

**Files to inspect/change:**

- `apps/web/drizzle/schema.ts`
- the repository's vertical-drama manual migration directory and migration runner
- `apps/web/shared/verticalDramaSeries/characterProfile.ts`
- `apps/web/shared/verticalDramaSeries/contracts.ts`
- new shared role taxonomy module beside these contracts
- schema/profile tests

**Acceptance:** a character can round-trip canonical role/tier, occupation, provenance,
and review state without changing legacy role text; an old row remains readable.

### Wave 2 — Creation, synthesis, and reconciliation

Upgrade the Preset Synthesizer output contract and examples to emit structured cast data.
Change the Create Series Wizard to retain structured objects as the primary transport while
keeping its text draft parser for legacy imports. Show the canonical label before submit.

Update series creation and seeding so each character is persisted with canonical role,
role tier, occupation, age facts, and AI/user provenance in one validated path. Manual
creation, update, variant, twin, and AI variant-planner routes must use the shared schema.

Update Story Bible character refinement to include a stable character ID, canonical role
fields, confidence/evidence, and explicit reconciliation. Reconciliation must preserve a
user-confirmed value, accept a valid unconfirmed structured value, and mark ambiguous data
for review. It must never infer a lead from occupation alone.

Replace keyword-only `isLeadRole` and `resolveCharacterRoleTier` behavior with canonical
role-first helpers. Keep a conservative legacy fallback for rows not yet backfilled; the
fallback must return review-required metadata instead of silently asserting a lead.

**Files to inspect/change:**

- `apps/web/server/services/verticalDramaPresetSynthesis.ts`
- `apps/web/skills/vertical-drama-preset-synthesizer/skill.md` and its schemas/examples
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/server/routers/verticalDramaCharacters.ts`
- `apps/web/server/services/verticalDramaCharacterDesignContext.ts`
- variant/twin routes and their tests

**Acceptance:** a heroine described as a CEO reaches persistence and Visual Bible as
`lead_female` while the occupation remains `CEO`; a confirmed role survives later Story
Bible generation.

### Wave 3 — Backfill and legacy normalization

Implement an idempotent, tenant-scoped backfill service/script. It derives canonical fields
from existing structured Bible/DNA first, then bounded description/premise evidence, and
finally conservative legacy aliases. Preserve the original role string. Ambiguous records
receive `needs_role_review` and are surfaced in the UI; no paid image call is allowed while
the target role is unresolved in production mode.

Add a runtime V1-to-V2 input normalizer for existing skill callers. Normalize
`has_own_reference_image`, `face_source_reference`, old root custom fields, and legacy role
text without mutating caller objects. Include migration counters, audit-safe field names,
and rerun protection.

**Files to inspect/change:**

- new backfill module/script under existing server/scripts conventions
- migration tests and tenant fixtures
- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts` normalizer boundary
- legacy skill fixtures and normalized fixtures

**Acceptance:** two consecutive backfill runs produce the same rows; ambiguous roles are
reviewable; V1 requests produce deterministic V2 inputs; original role text is intact.

### Wave 4 — Visual Bible Skill bundle V2

Refactor the active lowercase `skill.md` into a concise core workflow under the skill
context budget. Move detailed role matrices, reference-lock rules, anti-clone guidance,
and examples into directly referenced files. Keep all existing useful DNA, recall,
approved-DNA, safety, archive, and attachment behavior.

Upgrade `skill.json` to contract version 2 and update:

- `schemas/input.schema.json`: strict root and nested objects, required target character,
  generation request, reference assets/lock, continuity, and output options;
- `schemas/output.schema.json`: mandatory DNA, three-direction evidence, scores, prompt
  objects, instruction resolution, lock report, role readability, similarity risk, QA
  checklist, and non-null fields;
- `schemas/ui.schema.json`: role identity, generation request, references, and continuity
  controls;
- `references/input_contract.md`, `output_contract.md`, help files, fixtures, examples,
  and `tests/tests.json`;
- `scripts/verify.sh`: real JSON Schema validation plus semantic assertions;
- `prompts/system.prompt.md`: short mandatory system layer.

Use `skill.md` as the executable SmartSpec source. Generate uppercase `SKILL.md` as a
normalized mirror and add a parity test so the two cannot drift. The skill assembler loads
system prompt, core skill, and only required role/reference resources in a deterministic
order. The core must explicitly state target-character authority, precedence, no
stereotype default, no unsupported identity invention, output JSON-only, child safety, and
no paid provider call.

Add at least the supplied role/reference fixtures: intelligent heroine, warm hero, hidden
villain, rival, second lead, child/teen/student/intern, parents, elder, memorable support,
twin, age-stage, face-only new look, full-appearance continuity, approved DNA, and archive
unavailable provisional design.

### Wave 5 — Skill runtime and prompt ownership

Change `verticalDramaCharacterImageGeneration.ts` so the runtime input contains the
authoritative target character and V2 structured request. Load system prompt and active
skill in the documented order. Add server-owned normalization before creative validation,
preserving the existing comparison-evidence safety behavior.

Replace keyword inference with canonical role/tier first. Keep legacy fallback only for
unmigrated rows and expose its provisional status. Validate role match, age safety,
reference lock, immutable DNA, required prompt semantics, score thresholds, candidate count,
and instruction resolution.

Implement bounded same-skill redesign retries using machine-readable violation codes. The
retry receives the original structured input plus violations and asks for a complete
replacement output. It must not receive a server-composed creative paragraph.

Route Visual Bible requests to a model family that can handle the structured contract. If a
fallback family is used, enforce the same semantic gates and fail before image generation
when the family cannot satisfy the contract.

Remove `buildCharacterRenderPrompt`, marker constants, and every preview/direct/approved
branch that appends custom instruction text. Preview and provider calls must use the same
skill-authored prompt value. Record prompt provenance and bundle version without logging
full prompt or private story content.

**Files to inspect/change:**

- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
- `apps/web/server/routers/verticalDramaCharacters.ts`
- existing prompt/QC and model registry helpers
- focused service/router tests, especially custom-instruction tests

### Wave 6 — Character UI and warnings

Update `VerticalDramaCharacterStockPanel` and related editor/card components to show a
primary Thai narrative-role chip and a separate occupation/status chip. Add a grouped
role-tier selector with clear labels, AI-assigned/user-confirmed state, review-required
state, and save/error feedback. Keep the current card layout and primitives; add only the
controls needed for this contract.

Add structured generation request and reference-lock controls where the Visual Bible
action is edited. Show warnings before generation for lock conflicts, unsafe child styling,
hidden-villain overt cues, and missing target role. The warning copy must explain which
constraint wins and how the user can resolve it.

#### UI/UX Contract

**Target user / JTBD**

- Role: vertical-drama creator/editor.
- Goal: identify each character's story role and generate a consistent visual identity.
- Entry point: drama series character panel and character image-generation controls.
- Success: the role label is unambiguous, editable, preserved, and reflected in the
  generated prompt/image.

**Existing pattern reference**

- Search: targeted `rg` across `apps/web/client/src/components/verticalDramaSeries` for
  character cards, badges, select controls, prompt preview, and warning states.
- Found: `VerticalDramaCharacterStockPanel.tsx`, existing character chips/editor controls,
  and the current prompt-preview card.
- Decision: reuse existing card, chip, select, toast, and prompt-preview patterns; diverge
  only to add the canonical-role/occupation separation and structured warning state.

**Surface inventory**

| Surface | File/route | Change |
|---|---|---|
| Character cards | `VerticalDramaCharacterStockPanel.tsx` | role and occupation chips |
| Character editor | same panel and related dialog | canonical role selector and provenance |
| Create wizard | `CreateSeriesWizard.tsx` | structured cast role display/transport |
| Prompt preview | character route | skill-authored prompt and validation state |
| Reference controls | character generation section | lock mode/preserve/allow-change |

**Component map**

| Component | Owns | Consumes |
|---|---|---|
| RoleLabel/RoleTierChip | localized canonical display | shared role taxonomy |
| CharacterRoleEditor | edit/confirm state | tRPC input/output |
| RoleConflictNotice | warning copy and severity | validator warnings |
| PromptPreviewPanel | skill output/provenance | V2 output DTO |

**State matrix**

| State | Expected UI | Verification |
|---|---|---|
| loading | skeleton/disabled save | component test |
| empty | review-needed label and role selector | component test |
| error | inline error with retry/no data loss | router/component test |
| success | Thai role chip + occupation chip | component/browser test |
| partial | AI-assigned/review-required indicator | component test |
| disabled | selector disabled during mutation | component test |
| selected/focus/hover | visible selected role and focus ring | a11y/browser evidence |

**Responsive matrix**

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | chips wrap; role selector full-width; primary action reachable | screenshot/E2E |
| tablet 768x1024 | card controls remain visible without horizontal scroll | screenshot/E2E |
| desktop 1440x900 | two-chip hierarchy and prompt preview readable | screenshot/E2E |
| small-mobile 360x800 | extended dense-card overflow check | screenshot/manual |
| laptop 1024x768 | extended breakpoint check for panel/editor | screenshot/manual |
| wide-desktop 1280x800 | extended prompt-preview width check | screenshot/manual |

**Accessibility acceptance**

- Keyboard can reach role selector, warning details, save, cancel, and prompt actions in
  logical order.
- Every chip/selector/icon-only action has an accessible name and visible focus state.
- Role labels use semantic text, not color alone; warning severity has text and icon.
- Contrast remains readable in existing light/dark surfaces; no new raw color tokens.
- Reduced-motion preference disables nonessential role/status transitions.

**Visual direction and tokens**

- Reuse existing vertical-drama card density, semantic status colors, border/radius,
  typography, and spacing tokens found in the panel and theme files.
- Keep the narrative-role chip visually primary and occupation chip visually secondary.
- Avoid new gradients, raw hex values, or layout primitives that diverge from current UI.

**Copy contract**

- Primary language: Thai; preserve English model/provider metadata where already shown.
- Labels: `นางเอก`, `พระเอก`, `ตัวเอก`, `พระรอง`, `นางร้าย`, `ตัวร้าย`, `ตัวร้ายแฝงตัว`,
  `ตัวประกอบเด่น`, `ตัวประกอบ`, `เด็ก`, `ต้องตรวจสอบบทบาท`.
- Occupation label is separate, e.g. `ซีอีโอหญิง`.
- Conflict: `คำขอนี้ขัดกับการล็อกอ้างอิง ระบบจะคงรายละเอียดตัวตนที่ล็อกไว้`.
- Review: `ยังระบุบทบาทการเล่าเรื่องไม่ชัดเจน กรุณาตรวจสอบก่อนสร้างภาพ`.
- Success: `บันทึกบทบาทตัวละครแล้ว`.
- Localization fallback uses existing vertical-drama copy helpers.

**Browser evidence required**

Capture the character route and wizard at mobile, tablet, desktop, and extended dense
viewports using the standard UI browser evidence format. Verify no console errors,
horizontal overflow, inaccessible primary action, or missing loading/error state.

### Wave 7 — Visual QA and observability

Add a post-generation QA boundary that reports identity, role, age, framing, people count,
wardrobe, hair, continuity, and production readiness. The QA revision request returns to
the Visual Bible skill. Persist only approved DNA and safe provenance; do not mutate identity
on a failed image.

Add audit-safe events for role source, contract version, skill bundle hash/version, model
family, retry count, validation codes, and outcome. Do not log full prompts, private story
text, or signed asset URLs.

### Wave 8 — Integration, gates, and cleanup

Run focused tests after each wave, then typecheck and route-level/browser checks. Re-run
skill verification and schema tests after every skill-file change. Review all changes for
unplanned references to the marker block, role keyword inference, or prompt suffixes.

Use the final scoped diff to ensure only intended files are staged. Leave unrelated dirty
worktree work untouched. No commit or push is part of this request.

## Test-first plan

Write tests before each implementation wave. Detailed stubs are in
`claude-plan-tdd.md`; the critical cases are summarized here:

- shared role enum/label/age constraints and legacy alias normalization;
- Drizzle row/DTO round-trip and idempotent backfill;
- preset → wizard → seed → Story Bible → roster role preservation;
- user-confirmed role precedence over AI refinement;
- manual/variant/twin/age-stage contract round-trip;
- V2 input strictness, V1 normalization, reference-lock requirements;
- mandatory DNA/reports, role match, instruction semantics, child safety, and anti-clone;
- runtime loads system prompt + canonical skill and rejects drifted mirror;
- semantic retry uses violation codes and never appends creative text;
- preview/provider prompt equality and absence of marker constants;
- UI role/occupation chips, selector, warnings, loading/error/focus states;
- visual QA pass/revise/reject and safe provenance.

## Failure and rollback plan

- If a migration fails, stop before backfill; preserve the DB and inspect the generated
  migration rather than editing live data destructively.
- If role backfill confidence is low, mark review-required and keep the old role text.
- If the V2 skill fails, disable V2 routing behind the reversible feature flag while keeping
  additive fields and normalized data readable.
- If model-family fallback cannot satisfy semantic gates, fail before provider charge.
- If UI mutation fails, retain the previous role and show an actionable error.
- If visual QA rejects an image, retain approved DNA and allow a same-skill revision.

## Verification commands

Use repository-defined commands discovered during implementation, with at minimum:

- focused shared-role, router, service, and UI Vitest suites;
- skill `verify.sh` plus JSON Schema/semantic fixtures;
- web TypeScript check;
- migration status/check;
- route-level Playwright or manual browser evidence where tooling is available;
- `git diff --check` and scoped `git diff --stat`.

Record skipped browser or environment checks explicitly; never report skipped as passed.
