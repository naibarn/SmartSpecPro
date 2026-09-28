# Vertical Drama Episode Cover Layout Design

## Goal

แก้การแสดงหน้าปกตอนย่อย 4 แบบใน `VerticalDramaEpisodePreviewPanel` ไม่ให้ภาพหรือปุ่มล้นกรอบและซ้อนทับกัน โดยต้องใช้งานได้ตั้งแต่หน้าจอขนาดเล็กจนถึง desktop และไม่เปลี่ยนข้อมูลหรือ flow การสร้างหน้าปก

## Evidence and root cause

- Surface หลักอยู่ใน grid 2 คอลัมน์ที่ `VerticalDramaEpisodePreviewPanel.tsx`.
- `VerticalDramaEpisodeCoverSurface.tsx` กำหนดความกว้างคงที่ `w-36 shrink-0`.
- เมื่อช่อง grid แคบกว่าความกว้างคงที่ ภาพจึงล้นออกนอก slot และทับ slot ข้างเคียงตามภาพที่ผู้ใช้รายงาน.

## Design

1. เปลี่ยน wrapper ของ `VerticalDramaEpisodeCoverSurface` เป็น `w-full min-w-0` เพื่อให้ parent เป็นผู้กำหนดความกว้าง.
2. คงอัตราส่วนภาพ `aspect-[9/16]` และ `object-cover` เพื่อรักษาหน้าปกแนวตั้ง.
3. เพิ่ม `min-w-0` ให้ grid และ slot card ที่ครอบภาพ เพื่อให้ flex/grid สามารถหดได้จริง.
4. คง action buttons เป็น `flex-wrap` และจัดให้อยู่ภายในความกว้างของ slot.
5. ไม่เปลี่ยน tRPC, state, credit confirmation, upload, retry, download หรือ lightbox behavior.

## Existing pattern and visual tokens

- Reuse existing shadcn `Card`, `Button`, semantic Tailwind tokens, border/radius/shadow และ pattern `w-full` ที่ใช้กับ media surface อื่นใน Vertical Drama.
- ไม่เพิ่มสี, dependency, breakpoint เฉพาะกิจ หรือ fixed pixel width ใหม่.
- ความหนาแน่นของ layout ยังเป็น 2×2 ตามหน้าจอปัจจุบัน; บนหน้าจอแคบ slot จะหดตามพื้นที่แทนการล้น.

## Responsive contract

| Viewport | Expected behavior |
|---|---|
| mobile 390×844 | หน้าปก 2×2 อยู่ใน card เดียวกัน ไม่มี horizontal overflow หรือ overlap |
| tablet 768×1024 | หน้าปก 2×2 ใช้ความกว้าง slot อย่างสมดุล |
| desktop 1440×900 | หน้าปก 2×2 ไม่ล้นคอลัมน์ settings และปุ่มอยู่ใต้ภาพของ slot เดียวกัน |

## Verification

- เพิ่ม/ปรับ focused UI assertion ให้ตรวจว่า cover surface ใช้ `w-full min-w-0` และ slot/grid มี `min-w-0`.
- รัน Vitest ของ surface/page ที่เกี่ยวข้อง และ `git diff --check`.
- ทำ browser/screenshot verification ที่ mobile, tablet และ desktop หาก dev server/browser tooling พร้อม; หากรันไม่ได้ให้บันทึกเป็น skipped พร้อมเหตุผล.
- ไม่รัน provider generation, authenticated production browser flow, migration หรือ deployment เพราะ patch นี้เป็น presentational-only.

## Risk and rollback

ความเสี่ยงต่ำ: เปลี่ยนเฉพาะ sizing/layout class ของ component ที่มีอยู่แล้ว ไม่แตะ data contract หรือ action handler. หากมีปัญหาภาพเล็กเกินไป สามารถย้อนกลับเฉพาะ class ที่เปลี่ยนได้โดยไม่กระทบข้อมูลหน้าปก.
