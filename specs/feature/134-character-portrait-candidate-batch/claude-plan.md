# Feature 134 Implementation Plan

## Objective and architecture

Add a first-portrait casting stage without replacing the existing post-selection identity
flow. The architecture has four ordered layers:

1. Visual Bible candidate contract and runtime validation.
2. Durable candidate lifecycle, paid submission, settlement, and atomic selection.
3. Browser projection and responsive creator workflow.
4. Cross-layer compatibility, skill-bundle, type, and browser verification.

Candidate mode is additive. Normal `generateCharacterVisualPrompts`,
`previewCharacterPrompt`, and `generateCharacterImage` contracts remain valid for callers
that do not request candidates.

## 1. Skill and prompt-runtime candidate contract

### Files

- `apps/web/skills/vertical-drama-character-visual-bible/SKILL.md`
- `apps/web/skills/vertical-drama-character-visual-bible/skill.md`
- `apps/web/skills/vertical-drama-character-visual-bible/schemas/input.schema.json`
- `apps/web/skills/vertical-drama-character-visual-bible/schemas/output.schema.json`
- related contract references/fixtures only when the bundle verifier requires them
- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
- corresponding service and skill-content tests

### Contract

Add optional `portrait_candidate_count` (integer 1-5) to the Skill input. Candidate mode
returns a dedicated `portrait_candidate_batch` containing `character_id`,
`shared_visual_language`, and exactly N candidate records. Each record contains:

- unique bounded `candidate_id`;
- `visual_identity_summary`;
- complete `character_design_dna`;
- `primary_portrait_prompt`;
- optional/bounded `negative_prompt`.

Normal mode continues to return the existing complete character output and all five prompt
fields. The JSON schema must express mutually exclusive normal/candidate shapes instead of
accepting an ambiguous hybrid.

### Runtime API

Add a candidate-specific result type and generation function beside the normal generator.
Reuse model resolution, Skill loading, design-context facts, region/preset facts, retry,
actual-usage credit calculation, and snapshot construction. Candidate mode supplies one
additional raw fact and a mode-specific user-prompt instruction; code does not author visual
prose.

The candidate schema validates:

- exact requested count and unique candidate IDs;
- every candidate character ID matches the target;
- authoritative role-tier compatibility;
- server-derived comparison evidence for every candidate;
- pairwise differences across the five canonical face fields, requiring at least three,
  plus different hair and signature/silhouette evidence;
- existing lead-star, emotional-access, role-drift, and negative-prompt QC for every lead.

Use a bounded candidate max-token budget that scales by count and does not alter the normal
path. Build one strict approved design snapshot per candidate from validated output. Deduct
prompt credits once from actual candidate-call usage.

## 2. Candidate asset lifecycle and API

### Files

- `apps/web/shared/verticalDramaSeries/characterAssets.ts`
- `apps/web/server/services/verticalDramaCharacterStock.ts`
- `apps/web/server/routers/verticalDramaCharacters.ts`
- stock/router tests
- `apps/web/server/services/mediaGenerationService.ts` only for bounded persisted internal
  provenance keys

### Browser projection

Extend the asset contract with optional fields:

- `portraitCandidateBatchId`
- `portraitCandidateId`
- `portraitCandidateIndex`
- `portraitCandidateCount`
- `portraitCandidateTaskId`
- `portraitCandidateTaskStatus` when a durable terminal status exists
- `portraitCandidateSelectedAt`

Map only validated scalar metadata. Do not expose the approved design snapshot.

### Stock service operations

Add owner-scoped operations with narrow inputs:

- create candidate placeholders in one transaction with role `portrait_candidate`, state
  `draft`, `approved: false`, and server-authored metadata;
- mark a placeholder submitted with expected task ID/model and state `generated`;
- settle completion by attaching an owned canonical media asset, or settle failure with a
  bounded reason/status;
- atomically select one completed candidate: validate stored strict snapshot, protect a
  manual imported current primary, demote a previous batch primary, promote the chosen row,
  and JSONB-set `character.data.visualBible` without losing sibling data;
- make same-candidate selection idempotent.

Keep `getPrimaryPortraitUrl` and the reference picker role filter unchanged so candidates
cannot leak into identity locking.

### Router procedures

Extend `previewCharacterPrompt` with optional `candidateCount`. Candidate eligibility means:
no own primary and no parent/twin face source. Legacy approved DNA without a primary is an
explicit recast: strip the old face lock from candidate planning and replace it only on
selection. Eligible requests invoke the
candidate generator, create server-side draft candidate rows containing the strict snapshots,
and return only ordered candidate link IDs, prompts, summaries, batch ID, and display metadata.
The browser never round-trips candidate DNA. Ineligible candidate requests return a bounded
`BAD_REQUEST`; normal preview is unchanged and keeps its existing snapshot roundtrip.

Draft preview rows carry a bounded expiry/supersession marker and remain excluded from the
visible image grid until submitted. A new preview supersedes older unsubmitted drafts for the
same character. Cancelled/expired previews are harmless audit records and cannot be submitted.

Add a dedicated batch submission mutation that accepts the server-issued batch ID rather
than client-supplied snapshots. It:

1. rechecks ownership and eligibility;
2. atomically claims one non-expired draft batch and loads its server-stored snapshots;
3. resolves one selected image model and transport configuration;
4. calculates exact per-image and aggregate render cost;
5. uses the already-created preview placeholders before external side effects;
6. reserves aggregate non-zero credits;
7. submits independent `numImages: 1` tasks with candidate provenance;
8. records successful task IDs and marks failed placeholders;
9. refunds only immediate unsubmitted units;
10. returns submitted candidate link/task pairs and bounded failure information.

Add settle and select mutations that delegate owner-scoped checks to the stock service.
Terminal task credit reconciliation remains with `media.getTask`; selection never performs a
new media charge.

Concurrency rules: a draft batch can be claimed once, duplicate submission is rejected
before a second external task is created, duplicate selection is idempotent, and switching
candidates serializes through the DB transaction. A partial batch remains selectable.

## 3. Creator UI workflow

### File and pattern

Modify
`apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
with focused helpers/subcomponents only when that keeps the existing large component
readable. Follow `VerticalDramaContactSheetPicker` for candidate card semantics and existing
component primitives/tokens. Preserve the role-tier changes already present in the dirty file.

### Data and state

Derive first-casting eligibility from the character and manifest. Add per-character quantity
state defaulting to 3, candidate preview state, batch submission state, and per-candidate
polling/terminal state keyed by asset-link ID rather than the existing role-only polling key.

After submission, poll every returned task independently. On completion reuse the existing
URL-to-owned-media resolution, then call candidate settle rather than generic `linkAsset`.
On failure call failed settlement. Resume unfinished candidate polling after reload from
projected task IDs while avoiding duplicate poll loops.

### Interaction

- Show a labelled 1-5 radiogroup only for open casting.
- Reuse model and custom instruction inputs.
- Preview N read-only prompt summaries and disclose render count/cost basis before confirm.
- Confirm submits all candidates once; cancel spends no render credit.
- Render newest batch first and older batches as saved alternatives.
- Candidate cards show queued/running/completed/failed status, 9:16 preview, full-size view,
  and `Use as primary`.
- Selection updates manifest/data and marks one card as current primary. A later candidate
  switch shows the future-generation warning.
- After a primary exists, hide quantity/batch actions and preserve normal editable one-image
  generation.

## UI/UX Contract

### Target User / JTBD

- Role: vertical-drama creator.
- Goal: cast a canonical face from 1-5 equally strong choices in one paid flow.
- Entry point: Characters tab, selected standalone character with identity open.
- Success outcome: one selected primary/DNA and retained non-reference alternatives.

### Existing Pattern Reference

- Searched: SocratiCode candidate-gallery query and targeted component search.
- Found: `VerticalDramaContactSheetPicker.tsx` candidate grid and selected-card pattern;
  existing role/option button groups and `MediaPromptPreview` approval semantics.
- Decision: reuse candidate-card status/selection/accessibility grammar and semantic tokens;
  diverge to individual 9:16 tasks and one character-level canonical selection.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Character detail | `VerticalDramaCharacterStockPanel.tsx` | Count, preview, batch status, candidate grid |
| Character router | `verticalDramaCharacters` tRPC | Preview, submit, settle, select |
| Asset manifest | shared/service contract | Bounded candidate grouping/status projection |

### Component Map

| Component | Owns | Consumes |
|---|---|---|
| Quantity radiogroup | 1-5 choice | eligibility, per-character state |
| Candidate preview | read-only prompt review and paid confirmation | Skill preview candidates/model |
| Candidate grid/card | task state, image preview, selection | manifest projection, polling state |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| open/empty | quantity default 3 and generate action | component test |
| prompt loading | duplicate actions disabled, status announced | component test |
| prompt ready | N summaries, model/count/cost disclosure, confirm/cancel | component test |
| submitting/rendering | independent cards and progress | component test |
| partial success | completed siblings selectable, failures/refund noted | router + component test |
| selected | visible primary badge/ring and alternatives remain | component test |
| switching | future-generation warning and explicit action | component test |
| error/read-only | alert/status text; paid/select actions disabled | component test |
| focus/hover | existing semantic focus rings and button states | browser/manual evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | two columns, wrapped quantity controls, no horizontal overflow | screenshot/manual |
| tablet 768x1024 | three columns | screenshot/manual |
| desktop 1440x900 | up to five columns | screenshot/manual |
| laptop 1024x768 | grid wraps without hiding selection | manual if available |

### Accessibility Acceptance

- Real labelled radiogroup/radio controls for count.
- Candidate buttons use `aria-pressed` and unique accessible names.
- Status/error/selected meaning is textual, not color-only.
- Logical keyboard order, visible focus, polite live status, alert errors.
- No new essential motion; respect existing reduced-motion styles.

### Visual Direction and Tokens

Use existing `Card`, `Button`, `Badge`, `Skeleton`, border, muted surface, primary ring,
semantic destructive/warning, radius, and spacing vocabulary from the character and
contact-sheet panels. Do not add raw hex colors or global tokens. Density is balanced and
comparison-oriented; image content remains dominant.

### Copy Contract

Thai primary, English fallback through existing `t(lang, th, en)`. Required concepts:
quantity of faces, different faces/equal role quality, use as primary, current primary,
saved alternatives, rendering/failed/partial success, and future-generation-only warning.
Do not expose JSON, DNA field names, task internals, or provider jargon.

### Browser Evidence Required

Follow `ui-browser-verification.md` for mobile/tablet/desktop, console, keyboard, overflow,
async states, focus, accessible labels, and light/dark readability. Record authentication or
dev-server blockers as skipped, never as pass.

## 4. Verification and compatibility

Write failing tests first per `claude-plan-tdd.md`, then implement in dependency order.
Run focused Vitest files after each layer, the Skill bundle verifier after Skill changes,
`git diff --check` on scoped files, and the web workspace typecheck after integration.

Review file-scoped diffs because all main target files already include unrelated uncommitted
changes. Do not stage or commit. After the last fix, rerun every stale focused gate and perform
one clean targeted standard-light convergence review plus impact closure.

## Risks and mitigations

- LLM token expansion: lean candidate output and bounded count-scaled token limit.
- Similar provider faces: pairwise DNA checks and explicit Skill diversity contract; human
  selection remains final pixel-level judgment.
- Orphan paid task: placeholder-first persistence and task provenance.
- Double refund: immediate failures in character router, terminal usage in Media only.
- Client DNA tampering: snapshots are stored during preview and submission accepts only a
  server-issued batch ID.
- Wrong DNA/image pairing: server-stored snapshot, task ID, and candidate-link settlement.
- Identity leakage: only `primary_portrait` participates in references.
- Dirty-tree overwrite: focused patches and scoped diffs/tests.
- Manual primary surprise: block silent demotion of non-batch imported primary.
