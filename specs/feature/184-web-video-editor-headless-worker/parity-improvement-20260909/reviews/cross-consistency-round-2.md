# Section cross-consistency review — round 2

ตรวจความสอดคล้องหลัง self-review รอบล่าสุด โดยเทียบเอกสารทั้งชุดกับ source
evidence ที่ใช้เขียนแผน

## Contract ownership

**PASS.** Section 01 เป็นเจ้าของ internal envelope, old wire adapter, operation
mapping, role registry, status/event fencing และ API snapshot; sections 02, 04,
05, 06 และ 07 เป็นผู้ใช้ contract เดียวกัน ส่วน Section 10 เป็นเจ้าของผลลัพธ์
และไม่สร้าง queue หรือ artifact registry ใหม่

## Operation and output alignment

**PASS.** `extract_audio`, `ai_music`, `ai_media_studio`, `subtitle_export`,
`privacy_track`, `render_still` และ `export_mp3` มี user-facing ID, adapter หรือ
server/browser ownership และ output role ที่สอดคล้องกัน การใช้ `media.*` ใหม่
ต้องผ่าน capability negotiation และ old-worker rejection

Preset silence actions, EBU R128/loudness metadata, recorder monitor/discard
take, AI Media Studio reference-count limits, subtitle SRT/VTT export and
portable project JSON are represented in their owning sections and in the TDD
plan, so they cannot be accepted as visual-only controls.

## Current Web route regression

**PASS.** Section 02 ระบุจุดแก้จริงใน `VideoEditorPhase3.tsx` จาก initial
`mediaHistory` เป็น `bin` และระบุ exception ของ `?libraryItemId`; TDD มี route
test สำหรับทั้ง no-query และ deep-link จึงไม่ขัดกับ Library import behavior

## Worker App parity inventory

**PASS.** Section 10 inventory ครอบคลุม Bin/Library, playback/edit tools,
compound/decompose, Ken Burns, AI panels, track controls, pin marker visibility,
voiceover monitor/discard-take, project settings, Save/Open project file,
portable JSON, CapCut, Render/Export และบอกชัดว่าการ browse folder/Explorer/
local path ถูกแทนด้วย managed upload/download ไม่ใช่ฟังก์ชันที่หายไปเงียบ ๆ

## Subtitle, preview and export

**PASS.** Subtitle section รองรับ create/import/export และ SRT/VTT managed role;
preview section ระบุ guide exclusion และ custom dimension validation; render
section ระบุ Auto tie-break, Manual engines, GPU no-fallback, MP3 และ still
fallback โดยไม่มีข้อกำหนดขัดกัน

## Migration and tenancy

**PASS.** Main plan และ Section 10 ระบุ migration ถัดจากเลขล่าสุดใน Drizzle
journal (0289 มีอยู่ใน worktree ปัจจุบัน จึงเลือกเลขถัดไปที่ว่าง), ใช้ตาราง
field เดียวกัน, reuse `worker_artifacts`, unique session/part และ tenant checks
ที่สอดคล้องกับ schema ปัจจุบันซึ่ง project table ยังไม่มี tenant column

## Test and dependency order

**PASS.** TDD plan mirrors sections/index; dependency graph puts contracts first,
Bin before media analysis, transform before privacy/preview, all feature work
before render and rollout. Cross-section fixture updates and no-typecheck rule
are explicit

## Result

ไม่มี interface conflict หรือ ownership overlap ที่ต้องแก้เพิ่มเติมหลังรอบนี้
