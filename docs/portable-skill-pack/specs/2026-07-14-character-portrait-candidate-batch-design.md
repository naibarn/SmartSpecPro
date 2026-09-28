# Character Portrait Candidate Batch

Date: 2026-07-14  
Status: proposed for written-spec approval  
Surface: Vertical Drama > Characters

## Objective

When a character does not yet have a primary portrait, let the creator choose to
generate 1, 2, 3, 4, or 5 portrait candidates in one paid action. Every candidate
must preserve the same story role, casting quality, and cinematic visual language,
while depicting a materially different person. The creator chooses one candidate as
the canonical primary portrait; the selected candidate's Character DNA becomes the
identity lock for later portrait, sheet, storyboard, and start-frame generation.

The remaining images stay available as durable face candidates so the creator can
change the primary selection later. They must never become identity references merely
because they were generated or because they are newer than the selected portrait.

## User intent represented by the supplied example

The supplied three-image example establishes the intended comparison model:

- all candidates belong to the same premium vertical-drama casting tier;
- all use an emotionally readable, cinematic character-portrait language rather than
  fashion-catalog, influencer, corporate-headshot, or advertisement styling;
- lighting, realism level, framing discipline, and story-world fit feel related;
- the candidates are recognizably different people, not the same face with another
  hairstyle, pose, crop, expression, outfit color, or camera angle;
- leads remain equally striking across the set; diversity must not be achieved by
  making some candidates visibly weaker or more ordinary.

## Options considered

### A. One prompt with `numImages: N`

This is the smallest code change, but it does not reliably produce distinct identities.
Providers can return the same person with small staging changes, and the current task
contract exposes one result URL. This approach does not satisfy the user's main goal.

### B. N independent prompt-generation and image-generation calls

This can create different faces, but it spends prompt credits N times, increases latency,
and cannot compare the candidates as one coordinated casting set. It is also more likely
to drift in role quality and visual language between calls.

### C. One skill-authored candidate set, rendered as N independent image tasks

This is the selected approach. The Visual Bible Skill designs and compares all N Character
DNAs in one call, enforcing shared casting/visual-language rules and pairwise identity
difference. The backend then submits one image task per candidate prompt. Each image keeps
its own status and durable candidate record, while render credits remain transparent and
proportional to N.

## Product rules

1. Show the 1-5 quantity selector when the standalone character has no primary portrait
   and no parent/twin face source. A saved Visual Bible from a legacy story does not count
   as a portrait and must not hide candidate casting.
2. Default the first-time selector to 3, matching the supplied comparison pattern while
   still allowing the creator to choose any value from 1 to 5.
3. A first-time generation always enters candidate selection, including a one-image batch.
   The system does not silently lock Character DNA before the creator chooses.
4. After a primary portrait exists, keep the existing single-image regeneration flow and
   attach the selected primary portrait as the identity reference. If a legacy character
   has saved DNA but no primary portrait, candidate mode explicitly ignores that old face
   lock and replaces it only after the creator selects a candidate.
5. Keep all unselected batch images under the character as `portrait_candidate` assets.
   They are visible and selectable later but excluded from every automatic reference picker.
6. Selecting another saved candidate demotes the previous batch-selected primary portrait
   back to `portrait_candidate`, promotes the new selection to `primary_portrait`, and
   replaces canonical Character DNA in the same transaction.
7. Changing the primary portrait affects future generations only. Existing rendered media
   is not regenerated automatically; the UI must explain this when replacing a primary.
8. Imported/manual primary portraits keep the existing workflow. This feature does not try
   to infer or manufacture Character DNA for an arbitrary imported face.

## Visual Bible Skill contract

### Input

Add an optional `portrait_candidate_count` integer constrained to 1-5. It is supplied only
when no primary portrait or parent/twin own-face reference exists. Legacy saved DNA is
removed from the candidate-planning context by an explicit server-side recast opt-in.

### Output

Candidate mode uses a dedicated, lean `portrait_candidate_batch` output rather than
duplicating all five sheet prompts N times. It returns the requested `character_id`, one
Skill-authored `shared_visual_language` summary, and exactly N candidates. Each candidate
carries a unique `candidate_id`, a visual identity summary, complete validated
`character_design_dna`, `primary_portrait_prompt`, and `negative_prompt`.

The normal output contract and its five required prompt fields remain backward compatible.
After selection, later portrait/sheet calls use the chosen approved DNA through the normal
contract. The bundled JSON schema explicitly distinguishes normal and candidate-batch modes
so neither mode can satisfy validation with a partial hybrid response.

### Shared-quality requirements

Every candidate in one batch must hold constant:

- canonical narrative role and role tier;
- story-world and series-DNA relationship;
- age and ethnicity/nationality facts supplied by the story;
- lead/villain/support casting floor appropriate to the role;
- cinematic realism family, emotional readability, and premium vertical-drama screen
  presence;
- one coherent framing, lens, lighting, and color-grade family, with only story-appropriate
  variation that does not turn the batch into unrelated advertisements;
- the instruction to avoid catalog, advertisement, corporate-headshot, influencer, or
  generic-model imagery.

For adult leads, every candidate must independently pass the existing star-grade lead QC.
The Skill cannot create variety by lowering attractiveness, emotional magnetism, or casting
importance on any candidate.

### Pairwise identity requirements

Every pair of candidates must differ in at least 3 of these 5 face dimensions:

1. facial geometry / face shape;
2. eye shape and gaze system;
3. brows;
4. nose;
5. lips and smile architecture.

They must also differ in hair construction and at least one silhouette, behavior, or
signature-marker dimension. Hairstyle, wardrobe, pose, expression, camera, or background
changes alone do not count as a different person.

The runtime validates candidate count, unique candidate IDs, compatible role tiers,
pairwise face-field differences, and the existing lead-quality checks on every candidate.
Server-derived comparison evidence is normalized and verified for every candidate, not only
the first array entry. Validation rejects the entire prompt set and uses the bounded Skill
retry path; application code never authors replacement visual prose. Candidate-mode token
limits scale within a bounded 1-5 range so five complete DNAs can return without weakening
the normal single-character limit.

## Backend and data design

### Preview

Extend `previewCharacterPrompt` with `candidateCount?: 1..5`. For candidate mode it invokes
the Visual Bible Skill once and returns an ordered candidate array:

- `candidateId` and index;
- portrait and negative prompts;
- visual identity summary;
- strict approved design snapshot;
- prompt model and prompt-credit usage.

The server rejects candidate generation when a current own primary portrait exists.
Parent/twin face-lock flows remain on the existing single-identity path because their
identity is not open for casting selection. The lower-level generator still rejects
approved DNA by default unless the router explicitly authorizes the no-primary legacy
recast path.

### Submission and credits

Add a dedicated candidate-batch submission procedure. It accepts only the strict snapshots
returned by preview, verifies count and character ownership, resolves the selected image
model once, and calculates the exact render reservation as:

`single-image model cost x number of approved candidates`

Reserve the full render cost before submission, then submit N independent tasks with
`numImages: 1`. Independent tasks provide one task ID, result URL, and failure state per
candidate. If submission partially fails, refund the reservation for each unsubmitted
candidate and return the successfully submitted candidates plus a bounded failure count.
Models whose configured render credit cost is zero keep the existing MCP/subscription
behavior and skip reserve/refund operations.

Prompt generation remains one Skill call and is charged from actual LLM usage through the
existing prompt-credit path.

### Durable candidates

Before any external task submission, create one owner-scoped placeholder
`vertical_drama_character_assets` row per approved candidate using role
`portrait_candidate`, lifecycle state `draft`, and `approved: false`. If reservation or
submission fails, the row is marked rejected with a bounded reason. A successful submission
stores the task ID and advances the row to `generated`. This ordering prevents a paid task
from being created without a durable character-side identity record.

No migration is required: role is already string-based and metadata is JSONB. Candidate
metadata contains only server-authored fields:

- batch ID, candidate ID, index, and count;
- media task ID;
- strict approved design snapshot;
- submission model and timestamps.

The candidate link ID and batch/candidate IDs are also sent in the media task's persisted
internal provenance fields. They provide a bounded recovery key if the external task was
accepted but the immediate task-ID update fails.

Candidate rows are not approved primary references and are never returned by
`getPrimaryPortraitUrl` or the reference picker.

A dedicated settle procedure verifies the candidate's stored task ID. On completion it
attaches the resolved, owner-scoped canonical `media_assets` row to the existing candidate
link; on terminal failure it records the failure without removing usable siblings. The
client supplies only candidate-link, task, outcome, and owned media-asset IDs; it cannot
replace candidate metadata or Character DNA. Runtime task failures use the existing Media
task credit reconciliation and are not refunded a second time by the character router.

### Primary selection

Add an owner-scoped selection procedure. Inside one database transaction it:

1. verifies the candidate belongs to the requested character and has a completed media
   asset plus a valid server-stored design snapshot;
2. demotes any prior batch-selected `primary_portrait` for the character to
   `portrait_candidate`;
3. promotes the chosen link to `primary_portrait`;
4. writes the chosen visual-bible snapshot to `character.data.visualBible` without changing
   sibling JSON fields;
5. records selection provenance and timestamp.

This makes the chosen image and chosen DNA change atomically. Repeating the same selection
is idempotent. If the current primary came from a manual import rather than a candidate
batch, candidate re-selection is blocked instead of silently reclassifying that imported
asset; the existing manual-primary workflow remains authoritative.

### Browser projection

Expose bounded candidate projection fields on the character-asset manifest:
`portraitCandidateBatchId`, `portraitCandidateId`, `portraitCandidateIndex`,
`portraitCandidateCount`, and `portraitCandidateTaskId`. Do not expose the stored design
snapshot or arbitrary JSON metadata to the browser.

## UI/UX contract

### Target user / job to be done

- Role: vertical-drama creator choosing cast identity.
- Entry point: Characters tab, selected character with no primary portrait.
- Goal: compare several equally strong but genuinely different faces in one run.
- Success: choose one image as the canonical face without repeated generate attempts.

### Existing pattern reference

- Search: candidate selection, selected image card, generation count, archived candidates.
- Reuse: `VerticalDramaContactSheetPicker.tsx` for responsive candidate grids, selected ring,
  `aria-pressed`, per-candidate status, and retained candidates.
- Reuse: existing radio-button/button-group conventions for discrete quantity choices.
- Divergence: portrait candidates use individual image tasks and one canonical identity,
  rather than 3x3 sheet cells selected per shot.

### Surface and component map

| Surface | Responsibility |
|---|---|
| First-portrait controls | Quantity buttons 1-5, default 3, model and custom instruction reuse |
| Candidate prompt approval | Show count, model, credit basis, and read-only collapsible prompt summaries before render |
| Candidate grid | Show image/status/index, selected state, preview, and `Use as primary` action |
| Existing primary area | Show current primary plus saved alternatives and replacement warning |

### State matrix

| State | Required behavior |
|---|---|
| Identity open / no candidates | Quantity selector and clear generate action |
| Approved DNA but no portrait | Single DNA-recovery action; no unrelated-face selector |
| Prompt loading | Disable duplicate submission; announce loading status |
| Prompt approval | Show N candidate summaries and render-count/credit disclosure |
| Submitting | Disable count/model changes and show batch progress |
| Rendering | Each card has independent queued/running state |
| Partial success | Completed candidates remain usable; failed count is explicit and refunded |
| Ready | Every completed image has a visible `Use as primary` action |
| Selected | Strong selected ring/badge; current primary is unambiguous |
| Replacing primary | Explain that future work uses the new face; require explicit action |
| Failed candidate | Preserve other candidates; show bounded failure and allow a new batch |
| Read-only | Images remain viewable; paid and selection actions are disabled |

Candidate-batch prompts are read-only because an edited prompt would no longer match the
server-stored DNA that selection makes canonical. The creator changes `รายละเอียดเพิ่มเติม`
and requests a fresh preview instead. The existing editable prompt behavior remains on later
single-image regenerations, including its current rule that edited prompts do not overwrite
canonical DNA.

When more than one unselected batch exists, the newest batch is shown first and older batches
remain under saved alternatives, grouped by batch and creation time. A failed or abandoned
batch never hides usable candidates from an earlier batch.

### Responsive matrix

| Viewport | Candidate layout |
|---|---|
| Mobile 390x844 | Two-column grid; quantity choices wrap; primary action stays reachable |
| Tablet 768x1024 | Three-column grid, matching the supplied comparison pattern |
| Desktop 1440x900 | Up to five columns when space permits; no horizontal scroll |

Portrait cards keep a 9:16 media aspect ratio even when the surrounding comparison layout
resembles the compact rounded thumbnails in the supplied example.

### Accessibility

- Quantity choices use a real radiogroup with labelled radio controls.
- Candidate image selection uses buttons with `aria-pressed` and candidate-specific labels.
- Selected, loading, failed, and partial-success states are communicated in text, not color
  alone.
- Focus remains visible on quantity, preview, select, cancel, and replacement actions.
- Status changes use polite live regions; errors use an alert region.
- No new essential animation; existing reduced-motion behavior remains intact.

### Copy

Primary Thai labels:

- `จำนวนใบหน้าให้เลือก`
- `สร้าง 1-5 ใบหน้าแตกต่างกัน แต่คุณภาพบทบาทเท่ากัน`
- `ใช้ภาพนี้เป็นภาพหลัก`
- `ภาพหลักปัจจุบัน`
- `ตัวเลือกใบหน้าที่ยังไม่ได้ใช้`
- `การเปลี่ยนภาพหลักจะมีผลกับภาพที่สร้างหลังจากนี้`

English equivalents remain available through the component's existing bilingual helper.

## Security and integrity

- Every new mutation uses the existing authenticated vertical-drama procedure and repeats
  tenant, user, series, and character ownership checks.
- Candidate metadata and approved DNA are authored and stored server-side before rendering;
  the finalization client cannot inject them.
- Selection accepts only a candidate link owned by the same character.
- Candidate roles are excluded from every automatic identity-reference query.
- Full render credit availability is checked before task submission; partial failures refund
  only work that was not submitted.
- No provider URLs or arbitrary metadata are added to the browser contract.

## Tests and verification

### Skill/runtime tests

- input and output schemas accept candidate counts 1-5 and reject 0/6;
- candidate mode returns exactly N unique candidate IDs;
- candidate mode uses the lean batch contract and normal mode still requires all five prompt
  fields;
- every pair differs in at least 3/5 face fields plus hair/signature dimensions;
- every adult lead candidate independently passes lead beauty and anti-villain QC;
- candidate prompts retain cinematic character language and reject catalog/model/headshot
  drift;
- normal approved-DNA and reference-image calls remain one identity.

### Backend tests

- exact N render cost reservation and per-failure refunds;
- placeholder-first persistence and recovery provenance for accepted external tasks;
- N independent task submissions and durable candidate rows;
- ownership enforcement for finalize and select;
- candidates never resolve as primary references;
- atomic promotion/demotion plus DNA persistence;
- idempotent re-selection and safe switching between saved candidates;
- sibling character JSON data remains unchanged.

### Frontend tests

- selector appears only without a primary and defaults to 3;
- choices 1-5 reach preview/submission payloads;
- candidate prompt approval shows count and paid-render disclosure;
- independent loading/failure/completion states render correctly;
- selection uses accessible pressed state and updates the primary;
- unselected candidates remain visible after selection and reload;
- newest and older batches are grouped without making an older candidate a reference;
- subsequent normal generation hides the quantity selector and uses the primary reference.

### Browser evidence

Capture or explicitly mark skipped evidence at 390x844, 768x1024, and 1440x900. Verify no
horizontal overflow, quantity controls remain reachable, five candidates wrap correctly,
keyboard selection works, status text is announced, and light/dark surfaces remain readable.

## Acceptance criteria

1. A character with no primary portrait can request any count from 1 through 5 in one flow.
2. The resulting images are visibly different people while maintaining equal role-specific
   attractiveness, screen presence, story fit, and cinematic character-portrait language.
3. The system does not accept a batch whose textual DNAs fail pairwise face-diversity rules.
4. No candidate is used as a face reference before explicit selection.
5. Selecting an image atomically makes both its media asset and its DNA canonical.
6. Unselected images remain available and can replace the primary later.
7. Render credits and refunds match the number of successfully submitted image tasks.
8. Existing characters with a primary portrait retain the current reference-locked
   single-image workflow.
9. Focused Skill, backend, frontend, type, and browser-state checks pass or are explicitly
   recorded as skipped with a concrete blocker.

## Non-goals

- automatic face-similarity scoring from pixels or biometric recognition;
- combining candidates into a contact-sheet image;
- regenerating already-created storyboards, frames, or videos after a primary switch;
- generating variants/twins as unrelated identities;
- changing the general Media History result contract for multi-image tasks;
- adding a database migration solely for candidate batches.

The Skill and deterministic DNA checks reduce provider identity collapse, but the final
pixel-level judgment remains the creator's explicit selection step. The product does not
claim biometric proof that two generated faces belong to different real people.

## Spec review log

### Round 1

Issues found and corrected:

- Replaced N copies of the five-prompt normal contract with a lean candidate-batch contract
  to avoid excessive token cost and truncation at count 5.
- Required authoritative comparison evidence normalization across every candidate.
- Defined candidate lifecycle state and approval flag before media completion.
- Protected manually imported primary portraits from silent demotion.
- Made batch prompts read-only to preserve prompt-to-DNA integrity while retaining editable
  prompts for later reference-locked regeneration.
- Defined ordering and retention when multiple candidate batches exist.

### Round 2

Issues found and corrected:

- Tightened the quantity-selector condition to exclude approved-DNA recovery and parent/twin
  face-lock cases.
- Added an explicit one-image recovery path for legacy DNA-without-portrait state.
- Moved durable candidate creation before external task submission to avoid orphan paid
  renders and added media-task recovery provenance.
- Separated immediate submission refunds from existing terminal-task credit reconciliation
  to prevent double refunds.
- Defined durable completion/failure settlement for independently polled candidate tasks.

### Round 3

No unresolved material issues remain. Final clarifications added:

- Required one shared framing/lens/lighting/color-grade family across the batch.
- Preserved zero-credit MCP/subscription behavior without invalid reserve/refund calls.
- Distinguished deterministic prompt/DNA diversity enforcement from out-of-scope biometric
  image comparison, keeping final pixel-level judgment with the creator.
