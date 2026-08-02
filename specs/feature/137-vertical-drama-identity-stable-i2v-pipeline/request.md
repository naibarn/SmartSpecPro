# Feature 137 — Source request (2026-07-23)

User-provided brief (Thai, condensed; original delivered in chat with 4 sample
café-drama frames + 2 solo character portraits). Captured verbatim in intent,
lightly reformatted.

## Problem statement (user's words)

> drama series กับปัญหาที่พบตอนนี้ มันขาดจุด balance ระหว่างอารมณ์ภาพ กับ
> ความถูกต้องของภาพเวลาเอาไปทำวีดีโอ … ปัญหานี้แก้ด้วยการเขียน Video Prompt
> อย่างเดียวไม่พอ เพราะระบบ Image-to-Video ได้ข้อมูลตัวละครจากภาพเริ่มต้น
> เพียงมุมเดียว เมื่อใบหน้าถูกบัง เป็นมุมข้าง ก้มหน้า หรือมีขนาดเล็ก
> แล้ววิดีโอสั่งให้ตัวละครหันมา โมเดลต้อง "สร้างส่วนของใบหน้าที่ไม่เคยเห็นขึ้นใหม่"
> จึงเกิดหน้าเปลี่ยนได้ง่าย

Requested direction: split **Emotional Storyboard Frame** (อารมณ์/ตรวจบท) from
**Video-Safe Start Frame** (ใช้สร้างวิดีโอ — ต้องเห็นข้อมูลใบหน้ามากพอ); do not
force one image to serve both roles.

## The 9 proposal components (user's numbering)

1. Character Identity Reference Pack — canonical multi-angle images per main
   character (front / left ¾ / right ¾ / expression / current costume), locking
   face geometry, eye spacing, nose/lips, jawline, hair, age, skin tone,
   wardrobe of the current scene.
2. Video-Safe Start Frame generated from multiple reference images (xAI
   multi-image editing, ≤3 refs: male identity + female identity + emotional
   storyboard frame as scene/blocking reference), with a worked example prompt.
3. Face Observability QC before accepting a start frame — proposed starting
   thresholds: visible face area ≥75%, both eyes visible, nose/mouth visible,
   jawline partially visible, no face overlap, no heavy hair occlusion, yaw
   ≤30° preferred / 30–40° conditional, face height ≥160px preferred /
   ≥120px minimum at 720p, faces separated, face not touching frame edge.
4. Motion analysis per shot BEFORE choosing the image — structured
   `shot_motion` (head start/end pose, yaw change in degrees, camera motion,
   occlusion expectation, identity risk) + routing rule: ≤15° → I2V; 15–30° →
   I2V only with full ¾ start frame; >30° → new start frame or split shot;
   profile/back → frontal turn forbidden in a single I2V shot; new character
   entering → reference-to-video or split.
5. Motion Contract video prompts for imperfect faces — keep the same facial
   angle throughout, no orbit / profile-to-frontal reveal / face occlusion /
   face overlap / new facial interpretation; worked example provided.
6. Split high-turn scenes into multiple shots (intimate action → reaction cut
   → male reaction), matching vertical-series cutting rhythm.
7. Reference-to-Video when large angle changes are required — xAI
   `grok-imagine-video` supports up to 7 reference images / ≤10 s; does NOT
   lock the exact first frame; cannot combine with image-to-video in one
   request; `grok-imagine-video-1.5` does not support this mode; if the Hermes
   worker drives grok.com (web login) instead of the API, the web surface's
   modes/limits must be verified separately.
8. Post-generation identity QC — sample frames at 0/20/40/60/80/100%, detect
   faces, compare embeddings vs canonical references (ArcFace suggested;
   thresholds must be calibrated per project), reject on progressive drift.
9. Immediate skill outputs per shot: `emotional_storyboard_frame`,
   `video_safe_start_frame`, `identity_reference_selection`,
   `motion_contract` (max head turn, permitted camera motion, prohibited
   motion list).

Core principle stated by the user: romance/emotion must NOT come from hiding
faces — express it via distance, eyelines, hesitation, working hands, shoulder
direction, foreground/background, rim light, depth of field, restrained smiles.

Constraints set by the user for this planning round:

- Deep analysis FIRST (impact + cost-effectiveness of each component) before
  planning.
- If adopted, a NEW spec file must be created under `specs/feature/` (not an
  edit of an existing spec), and the impact on existing behavior must be
  analyzed.

## Follow-up (same day, mid-analysis)

> ปัจจุบันแก้ไขปัญหาชั่วคราวโดยสร้างวีดีโอผ่าน Super Grok โดยตรงที่รองรับ
> grok-imagine-video แล้วค่อยลากเอาวีดีโอไฟล์ที่เสร็จแล้วกลับมายัง Storyboard
> อีกที ฉะนั้นสามารถกำหนด spec ใช้เป็น grok-imagine-video ได้เลย …
> แต่ Grok ปัจจุบันจะเน้นหนักที่ภาพ start frame การนำภาพ ref ไปใช้ประมวลผล
> ยังไม่ถึงเกณฑ์ดี อนาคตอาจดีขึ้น แค่ระบบรองรับเผื่อไว้

Operational facts locked in from this follow-up:

1. Current interim workflow: generate clips manually on Super Grok
   (grok-imagine-video available there), then import the finished video file
   back into the Storyboard. The spec may target `grok-imagine-video`.
2. **Field-verified model behavior: Grok weighs the START FRAME heavily;
   its use of additional reference images is currently below the quality
   bar.** Reference conditioning may improve later — the system should
   PROVISION multi-reference support but must not depend on it for identity.
   Identity quality must therefore be carried by the start frame itself.
