# Implementation Plan

## Objective

ทำ hardening และ v1.1 enhancement ให้ media motion ของ Presentation Editor โดยเก็บทุกจุดแนะนำจาก review:

- ลด preview/export drift ให้ motion semantics มี source of truth ที่คุมง่ายขึ้น
- ล็อก pause/resume behavior ด้วย regression coverage ที่ชัดเจน
- ขยาย pan ให้รองรับหลายทิศทางมากขึ้นพร้อมลด edge exposure
- แสดง static-export motion omission ให้ผู้ใช้เห็นใน export UX จริง
- ยืนยันว่า effect แสดงครบในทุก playback surface ที่ผู้ใช้เห็นจริง:
  - `Play Slideshow` ใน editor
  - `PlayMode`
  - `export mp4`

## Current-Codebase Fit

- โค้ด v1 แยก shared helper กับ server inline runtime อยู่แล้ว จึงสามารถ harden โดยย้ายไปสู่ parity layer เดียวได้โดยไม่ต้องรื้อ architecture
- Export warning contract มีอยู่แล้ว จึงต่อยอดสู่ human-readable UX ได้แบบ incremental
- Presentation Editor มี slideshow overlay test harness และ fake-timer pattern อยู่แล้ว เหมาะกับ pause/resume regression tests

## Affected Areas

- Shared motion contract + helper
- Presentation Editor slideshow runtime
- Presentation PlayMode runtime
- Shared canvas playback renderer if PlayMode continues to rely on `CanvasStage` / `CanvasObjects`
- Slide-render HTML record runtime
- Property panel preset catalog
- Export degradation warning surfacing
- Client/server regression suite

## Proposed Approach

### 1. Unify motion semantics

เป้าหมายไม่ใช่แค่ “ค่าตรงกันวันนี้” แต่ต้องลดความเสี่ยง drift ในอนาคต

แนวทางแนะนำ:

- ทำ shared motion metadata/helper ให้เป็น source of truth สำหรับ:
  - preset list
  - default intensity/easing
  - max pan/zoom tuning
  - overscan rule
- ฝั่ง server route ไม่ควร hardcode ค่าซ้ำแบบ freehand
- ถ้ายัง import shared TS helper เข้า browser-inline script ตรง ๆ ไม่สะดวก ให้สร้าง thin adapter ที่ serialize constant/preset map จาก shared module ไปใช้ใน route template
- เสริม parity test หรือ fixture test ที่เปรียบเทียบ frame output ของ shared helper กับ server runtime contract สำหรับ preset representative cases

surface parity ที่ต้องครอบ explicitly:

- `Play Slideshow` ใน `PresentationEditor.tsx`
- `PlayMode` ใน `PresentationPlayMode.tsx`
- `mp4` record/export path ใน `slideRender.ts`

### 2. Expand pan presets and add safe overscan

เพิ่ม diagonal presets:

- `pan-up-left`
- `pan-up-right`
- `pan-down-left`
- `pan-down-right`

เพิ่ม deterministic overscan policy สำหรับ pan:

- pan presets ต้อง scale เผื่อขอบโดยอัตโนมัติ
- สูตรต้อง predictable และใช้ร่วมกันทั้ง preview/export
- overscan ต้อง additive ต่อ `imageZoom`/`videoZoom` เดิม ไม่ overwrite ค่าเดิม

ข้อกำหนด behavior:

- motion ยังคง span เต็ม slide duration
- video ยัง play ต่อเนื่องระหว่าง pan/zoom
- overscan ต้องไม่ทำให้ zoom jump ระหว่าง pause/resume

### 3. Harden slideshow pause/resume guarantees

เพิ่ม explicit acceptance:

- เมื่อกด pause, media transform ต้อง freeze ค่าปัจจุบันทันที
- เมื่อ timer/time advances ระหว่าง paused state, transform ต้องไม่เปลี่ยน
- เมื่อ resume, transform ต้องขยับต่อจาก progress เดิม ไม่ reset เป็น 0 และไม่ remount live video

หากจำเป็นให้แยก helper test utility สำหรับ mocking `requestAnimationFrame` ใน fake timer environment เพื่อให้ regression tests stable

หมายเหตุ:

- acceptance ชุดนี้ต้องใช้กับ `Play Slideshow`
- ถ้า `PlayMode` รองรับ pause/play บน route นี้ด้วย ต้องมี regression ชุดเทียบเคียงหรือ shared playback assertion สำหรับ path นี้ด้วย

### 4. Surface motion omission warnings in export UX

จาก warning code ที่ backend ส่งกลับ:

- map warning code/category เป็นข้อความ human-readable
- แสดงใน `ExportDialog` หรือ export result summary ว่า:
  - static formats จะ flatten media motion เป็นภาพนิ่ง
  - MP4 เท่านั้นที่รักษา motion ได้
- ถ้ามี warning หลาย slide ให้ render แบบ deduplicated summary พร้อมจำนวน slide ที่ได้รับผล

หลักการ UX:

- อย่าปล่อยเป็น raw code only ถ้าผู้ใช้กำลัง export
- copy ต้อง actionable และบอกทางเลือกชัดว่าให้ใช้ MP4 ถ้าต้องการ motion

## Risks And Mitigations

### Risk: shared/runtime parity ยัง drift แม้ลด duplication แล้ว

Mitigation:

- เพิ่ม fixture-based parity tests
- ห้ามเพิ่ม preset ใหม่โดยไม่อัปเดต parity matrix

### Risk: overscan ทำให้ visual framing เปลี่ยนมากเกินคาด

Mitigation:

- เริ่มด้วยสูตร conservative
- test ทั้ง `contain` และ `cover`
- บันทึก behavior ว่า pan มี auto-overscan โดย design

### Risk: warning UX กลายเป็น noisy

Mitigation:

- dedupe warning messages ตาม code
- แสดงเฉพาะ format ที่ได้รับผล
- ใช้ concise explanatory copy

## Acceptance Criteria

- Shared motion semantics มี source-of-truth ชัดขึ้น และ parity path ระหว่าง preview/export ถูกล็อกด้วย tests
- `Play Slideshow` แสดง media motion ครบตาม preset ใหม่
- `PlayMode` แสดง media motion ครบตาม preset ใหม่
- `export mp4` เก็บ media motion path เดียวกันกับ playback surfaces
- Preset catalog รองรับ diagonal pan เพิ่มเติม
- Pan presets ใช้ safe overscan เพื่อลดการเห็นขอบว่างระหว่าง motion
- Slideshow preview มี regression tests ว่า pause/resume freeze/resume motion ได้จริง
- Video motion ยังคงไม่ pause/restart/remount ระหว่าง pause/resume และระหว่าง motion progress
- Static export warnings ถูกแสดงเป็น human-readable message ใน export UX จริง
- Existing slides/presets เดิมยัง parse/render ได้เหมือนเดิม

## Rollout / Verification Notes

- ไม่มี DB migration
- ต้อง verify ทั้ง image และ video
- ต้อง verify ทั้ง 3 surfaces: `Play Slideshow`, `PlayMode`, `mp4 export`
- ต้องรัน route tests ใน environment ที่ `supertest` bind port ได้
- ควรตรวจ visual smoke สำหรับ:
  - cover + pan diagonal
  - contain + pan diagonal
  - pause midway then resume
  - enter `PlayMode` and confirm motion renders there too
  - mp4 export path preserves the same motion semantics
  - png/pdf export warning summary
