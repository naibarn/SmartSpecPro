# Request

## Original User Request

วางแผน implement เพิ่มเติมสำหรับหน้า Presentation Edit
1.หน้า Presentation Edit ต้องการเพิ่ม Slide Note ทั้งแบบเฉพาะ slide และแบบทั้ง Presentation โดย user สามารถกดเปิดดูได้ และ edit ได้บันทึกได้ แต่ Note ทั้งหมดจะไม่ถูกแสดงผลเวลา play หรือ export
2. เวลาสร้าง slide ด้วย Draft with AI ตอนได้บทความเต็ม ๆ มาแล้ว ให้บันทึกไว้ใน Presentation Note เวลา split บทความแยกเป็นแต่ละหน้า slide ให้บันทึกข้อความที่แยกแล้วไว้ใน Slide Note แต่ละหน้า
3. Note ทั้งสองแบบคือของ slide แต่ละหน้า และ ของ presentation note มีปุ่มให้ copy ข้อความใน note ออกมาได้ ตัว note ไม่แสดงอยู่ตลอดเวลาให้แสดงเฉพาะตอนที่ user ต้องการกดเปิดดูเท่านั้น
4. หลังจาก user แก้ Slide Note แล้ว ต้องสามารถเลือกเสียงและกด generate/regenerate audio ใหม่สำหรับ slide นั้น โดยใช้ข้อความจาก note แทนอันเดิม

## Normalized Brief

Plan an incremental Presentation Editor enhancement that adds two hidden note surfaces:

- deck-level `Presentation Note`
- per-slide `Slide Note`

Both note types must:

- stay hidden until the user explicitly opens them
- support edit, save, and copy-to-clipboard
- never appear in play mode, slideshow payloads, or export output

AI Draft must also persist authoring context:

- the full generated article becomes the deck-level `Presentation Note`
- the per-slide text produced during article splitting becomes each slide's `Slide Note`

Per-slide note authoring must also support downstream narration refresh:

- after editing a slide note, the user can generate or regenerate slide audio from that note
- the user must be able to choose the audio model / voice before generation
- the regenerate action should only appear when the current slide note has already been saved
- successful regeneration replaces the slide's current audio attachment without exposing note text in playback/export payloads

## Required Surfaces

- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/components/presentation/AIDraftModal.tsx`
- `apps/web/client/src/components/presentation/SlideAudioPanel.tsx`
- `apps/web/server/routers/presentation.ts`
- `apps/web/server/services/presentationService.ts`
- `apps/web/server/services/aiPresentationService.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/shared/presentation/*`
- DB schema / migration layer for deck-level note persistence

## Assumptions

- `slide.notes` is the canonical persistence field for per-slide note text; no new slide-note column is needed
- deck-level notes should live on `presentation_decks` rather than inside `slideContent` or library item metadata
- slide notes can participate in the existing slide save/conflict flow, while deck notes should follow the existing deck metadata mutation path
- hidden-note UX should reuse existing dialog/drawer/collapsible patterns instead of introducing always-visible sidebars
- note-driven audio generation should reuse the existing slide-audio surface where possible instead of adding a disconnected narration page

## Non-Goals

- No note rendering in play mode, slideshow preview, export render spec, or exported files
- No rich text formatting, markdown rendering, or multi-user collaborative note editing
- No import/export format changes for PPTX/Google Slides in this round
- No automatic deletion of old audio assets when a slide audio track is regenerated
