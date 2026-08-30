# Scene Visual State Inspector — Design Specification

## Goal

Expose the persisted Scene Visual State inside the Vertical Drama Location
panel so a user can inspect and correct the shared visual facts that feed every
continuous shot in that location. The editor is collapsed by default to
preserve storyboard space, but its purpose and impact must be immediately
visible.

## Problem

Scene Visual State is currently generated and injected behind the scenes. The
existing Location UI has a small scene-lock row and a dialog, but only a subset
of state fields is editable. In particular, fixed furniture, active props, and
wardrobe are read-only. This makes it difficult to correct semantic conflicts
such as a scripted long bed being rendered as a baby bassinet.

The state is shared by all shots grouped under the same `locationKey`. A manual
edit must therefore be explicit about its blast radius and must update the
shared source of truth without silently replacing existing images.

## Approved product decisions

- The editor belongs in the existing Location panel.
- The Inspector is collapsed by default.
- The heading must clearly communicate purpose, for example:
  `Scene Visual State — ข้อมูลกลางของฉากนี้`.
- The heading includes the number of affected shots and the current status.
- Saving edits updates the shared Location-level state for all member shots.
- Existing images and media are retained.
- Affected prompts/render outputs are marked as needing regeneration using the
  existing per-frame stale metadata; no new ambiguous status string is added.
- Regeneration is an explicit later user action and does not happen
  automatically after save.
- Manual edits are zero-cost and protected from an ordinary AI re-plan.
- Revision checks remain mandatory; stale editors must not overwrite newer
  state.

## Proposed UI

### Collapsed Location row

The Location panel contains a compact, always-visible Inspector trigger:

- Title: `Scene Visual State — ข้อมูลกลางของฉากนี้`
- Purpose text: `กำหนดสิ่งที่ควรคงเดิมในทุกช็อตที่เกิดขึ้นในสถานที่นี้`
- Location name/key
- Badge: `ใช้กับ N ช็อต`
- Status badge: `AI`, `แก้ด้วยมือ`, `ต้องตรวจสอบ`, or `ยังไม่มีข้อมูล`
- Expand/collapse control with a visible text label and accessible name
- Existing `วางแผนล็อกฉาก` action remains available but visually secondary

The collapsed row must be distinguishable from the location reference-image
controls and must not rely on the sparkle icon alone. It also includes a
visible helper sentence such as: `แก้ไขที่นี่ครั้งเดียว จะมีผลกับทุกช็อตในฉากนี้
เมื่อสร้างพรอมต์หรือภาพครั้งถัดไป`.

### Expanded Inspector

Use the existing source-owned shadcn primitives and the project's semantic
tokens. Keep the expanded content dense enough for a Location panel, with
sections or accordions for long lists:

The expanded header begins with a plain-language explanation:

> ข้อมูลชุดนี้เป็นข้อกำหนดกลางของฉาก ใช้ร่วมกันกับ N ช็อตด้านล่าง คุณแก้ไข
> รายละเอียดที่ภาพสร้างผิดหรือไม่ตรงกับเรื่องย่อได้ที่นี่ การบันทึกจะไม่ลบภาพเดิม
> แต่ช็อตที่เกี่ยวข้องจะถูกทำเครื่องหมายว่าควรสร้างใหม่

1. **เวลาและแสง** — `กำหนดว่าเป็นกลางวัน กลางคืน หรือแสงแบบใด
   เพื่อไม่ให้แต่ละช็อตมีเวลาไม่ตรงกัน`.
2. **เฟอร์นิเจอร์และที่นอนหลัก** — `ระบุของชิ้นใหญ่ที่ต้องอยู่ในฉาก เช่น
   เตียงนอนทรงยาว เปล หรือโซฟา พร้อมตำแหน่งในห้อง`.
   Editable rows contain object name/type and placement. Include a structured
   sleep-surface value where applicable: long bed, single bed, crib/bassinet,
   sofa, floor mattress, or other. Show an example beside the field:
   `เช่น เตียงนอนทรงยาวของภูมิ ไม่ใช่เปลเด็ก`.
3. **ผังและตำแหน่ง** — `บอกว่าตัวละคร เฟอร์นิเจอร์ และหน้าต่างอยู่ตรงไหน
   เพื่อให้มุมกล้องต่อเนื่องกัน`.
4. **Props ที่ต้องคงอยู่** — `ของประกอบฉากที่ควรเห็นหรืออยู่ตำแหน่งเดิม
   เช่น สมุด โทรศัพท์ หรือโคมไฟ`.
5. **เสื้อผ้าในฉาก** — `เสื้อผ้าที่ตัวละครควรใส่ต่อเนื่องกันในฉากนี้`.
6. **โทนภาพและอารมณ์** — `กำหนดบรรยากาศโดยรวม เช่น อบอุ่น เงียบสงบ
   หรือกดดัน`.
7. **จุดที่ต้องตรวจสอบ** — `ข้อมูลที่ระบบยังไม่แน่ใจหรือมุมที่ยังขาด
   ผู้ใช้กดตรวจสอบหรือแก้ไขได้`.

Each repeatable list supports add, edit, remove, and reorder where ordering
affects prompt interpretation. Empty lists have a clear empty state and an add
action. Long text fields have labels, helper text, and validation feedback.
Every editable field must have a visible Thai label, one-sentence explanation,
and an example or placeholder that describes the expected kind of information.
Technical field names may appear only as secondary text for advanced users.

### Impact and save confirmation

Before save, show:

- The changed fields.
- The affected shot numbers.
- A plain-language warning: `การแก้ไขนี้มีผลกับ N ช็อต ภาพเดิมจะยังอยู่
  แต่ต้องสร้างภาพใหม่จึงจะเห็นการเปลี่ยนแปลง`.

After save, show a success state with the new revision and a direct action to
view affected shots. Do not navigate away from the Location panel.

## Data and behavior

### Shared state contract

Retain `locationKey`, `membershipHash`, `revision`, `manualEdit`, `stale`, and
the existing Scene Visual State fields. Extend the contract with a structured
representation for major furniture/sleep surfaces rather than relying only on
free-form prose. The field must be optional for backward compatibility with
existing plans.

The UI should distinguish authoritative/user-edited/AI-derived/review-needed
state using the existing `manualEdit` and `stale` markers first. Do not add a
second provenance taxonomy unless implementation evidence shows that the
existing markers cannot represent the required status.

The prompt renderer must serialize the structured furniture/sleep-surface fact
as a high-priority continuity constraint and must preserve explicit script facts
when they conflict with a location reference image.

### Update flow

1. Load the Location state and member shot numbers from the episode plan.
2. Open the Inspector using the current revision.
3. Edit a local draft; do not mutate the episode on every keystroke.
4. Validate fields and calculate a minimal patch.
5. Submit through the existing `updateSceneVisualState` mutation with
   `expectedRevision`.
6. In one transaction, persist the new shared state and, for every member
   `startFramePlan.frames[]` entry, preserve any image anchors and set the
   existing `imageStaleReason: "prompt_changed"` and `imageStaleAt` fields.
   For frames without an image, the same marker means the stored prompt is
   stale and must be regenerated before image creation; update its type/UI
   documentation accordingly rather than introducing a second ambiguous flag.
   Clear any continuity QC result that no longer describes the retained
   image/state.
7. Keep all existing media assets and their provenance.
8. On revision conflict, close or refresh the draft and show the newer state;
   never silently merge over another user's edit.

### Regeneration behavior

Saving a state correction must not spend credits or call an image provider.
Affected shots show a visible `ต้องสร้างใหม่` status. Existing generated images
remain previewable until replaced by a later, explicit regeneration action.

## Scope boundaries

In scope:

- Location-level, shared Scene Visual State Inspector.
- Collapsed-by-default responsive UI.
- Editing all currently read-only state groups.
- Structured major-furniture/sleep-surface facts.
- Affected-shot visibility and stale/needs-regeneration status.
- Revision conflict and error states.
- Focused unit, router, contract, and prompt-renderer tests.

Out of scope for this increment:

- A separate full-screen Scene State workspace.
- Automatic image regeneration.
- Deleting or replacing existing media during save.
- Per-shot Scene Visual State overrides. Shot-specific exceptions continue to be
  represented by the existing shot composition/location controls until a
  separate override design is approved.

## Error, accessibility, and responsive requirements

- Feature-flag behavior remains unchanged; when Scene Continuity is disabled,
  the Inspector is absent.
- Loading, empty, save-success, validation-error, provider/planning-error, and
  revision-conflict states are visible and actionable.
- Every control has a visible label or an accessible name; keyboard focus and
  Escape-to-close behavior are preserved.
- Use a responsive stacked layout on narrow screens; do not introduce
  horizontal overflow in the storyboard.
- Destructive-looking actions such as clearing a furniture row require an
  explicit confirmation or undo path.
- User-entered text is validated at the API boundary and is not written to
  audit logs as raw prompt content.

## Acceptance criteria

1. A user can find `Scene Visual State` in every eligible Location panel without
   opening a hidden settings page.
2. The Inspector is collapsed on initial render and expands without losing the
   surrounding storyboard context.
3. The header clearly states that the state controls all shots in the scene and
   displays the affected-shot count.
4. Every editable section has a plain-language explanation and an example or
   placeholder that tells the user what kind of correction belongs there.
5. A user can change the scene's sleep surface from a crib/bassinet to a long
   bed, save it, and see the new value in the shared state.
6. Every member shot receives the updated state on the next prompt/render
   preparation.
7. Existing images remain available and affected shots are visibly marked for
   regeneration.
8. A stale revision is rejected with a visible refresh/retry path.
9. An AI re-plan does not overwrite a manually edited state unless the existing
   explicit force/overwrite action is used.
10. Focused tests cover UI expansion/edit/save, mutation persistence and
   revision conflicts, structured furniture serialization, and prompt output.

## Verification and rollout

Run the focused Vertical Drama UI, router, scene-state, and prompt tests from
the repository root. Perform an authenticated browser smoke test with the
Scene Continuity flag enabled: expand a Location Inspector, edit the sleep
surface, save, refresh, inspect two member shots, and verify their prompts are
marked for regeneration while the old images remain intact.

No deployment, migration execution, provider generation, or production data
backfill is part of this design approval. If the optional structured field is
stored inside the existing JSON episode plan, verify backward-compatible parsing
and do not introduce a database migration unless the implementation discovers
that the current contract requires one.
