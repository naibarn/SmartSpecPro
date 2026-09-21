# Vertical Drama Warning-Only Generation Design

## Goal

ให้การสร้างตอนของ Vertical Drama เดินหน้าต่อได้เมื่อ story safety detector พบความเสี่ยง โดยลดความเสี่ยงก่อนส่ง LLM, เก็บคำเตือนที่ตรวจสอบได้ และไม่ทำให้การเขียน debug ล้มงาน

## Root Cause

`generateEpisodeScript()` เรียก LLM สำเร็จก่อน แล้วตรวจ story-bearing fields ด้วย `analyzeVerticalDramaStorySafety()`. เมื่อผลเป็น `high` โค้ดสร้าง `VdStorySafetyError` และโยน exception เอง ทำให้ `plan_episode_script` ถูกบันทึกเป็น failed. Error mapping ของ pipeline ส่งต่อเพียงข้อความทั่วไป จึงไม่แสดง rule, field path หรือ evidence ที่ทำให้ตัดสินใจได้ว่าความเสี่ยงมาจาก source หรือ LLM output.

## Design

### 1. Pre-LLM risk reduction

สร้าง deterministic provider-facing rewrite instruction จาก story source ที่ตรวจพบความเสี่ยง โดยเน้นภาษาการเล่าเรื่องแบบ non-graphic, ผู้ใหญ่โดยนัย, ไม่บรรยายการบังคับ/ความรุนแรงแบบละเอียด และคงโครงเรื่อง ตัวละคร และ cliffhanger. Instruction จะถูกเติมใน prompt เฉพาะเมื่อมี finding ระดับ `medium` หรือ `high`.

### 2. Warning-only admission for script generation

ใน `generateEpisodeScript()` จะไม่โยน `VdStorySafetyError` สำหรับผล detector อีก. จะคืน script ที่ผ่าน schema พร้อม metadata คำเตือนสำหรับ pipeline และบันทึก diagnostic. Error ประเภท schema validation, insufficient credits, provider/network failure และผลลัพธ์ว่างยังคงเป็น failure จริง เพราะไม่ใช่ policy warning และไม่มี artifact ที่ใช้งานได้.

### 3. Downstream media continuity

ก่อนส่ง story-bearing text ต่อไปยัง media prompt flow ให้ใช้ safe rewrite helper กับ fields ที่ detector ระบุว่าเสี่ยง เพื่อไม่ให้ warning เดิมถูกแปลงกลับเป็น hard failure ใน media stage. การ rewrite ต้องเป็น field-local และไม่แก้ metadata หรือคำสั่งป้องกันความปลอดภัย.

### 4. File-based diagnostics

เพิ่ม JSONL logger แบบ best-effort สำหรับ source safety, LLM output safety และ rewrite decision. Default path คือ `logs/vertical-drama-safety-debug.jsonl` และรองรับ `VERTICAL_DRAMA_SAFETY_DEBUG_LOG_PATH`. บันทึกเฉพาะ identifiers, detector codes, field paths, text hashes/lengths และ excerpt ที่ตัดความยาวแล้ว; ไม่บันทึก prompt เต็ม, token หรือ secret. การสร้าง directory/append ที่ล้มเหลวต้องถูกลดเป็น internal warning และห้ามเปลี่ยนผล generation.

## Error Handling

- Policy finding: `warnings` + debug record + safe rewrite; generation continues.
- Debug file failure: internal log only; generation continues.
- LLM refusal after safe rewrite: use bounded retry/fallback already supported by planning call; if no usable schema result remains, report the real provider/schema failure.
- Credits, authentication, transport outage, and malformed schema: retain existing failure semantics.

## Testing

- Detector helper produces a rewrite instruction only for non-low findings.
- High-risk source changes the pre-LLM prompt and does not leak safety metadata into story text.
- High-risk LLM output returns a successful script with warning metadata instead of `VdStorySafetyError`.
- Debug JSONL contains diagnostic fields and redacts/truncates content.
- Debug write rejection never rejects generation.
- Existing generic safety detector tests remain unchanged; the warning-only behavior is scoped to the episode generation path.

## Operational Boundary

Application code cannot guarantee success when the external provider is unavailable, credits are exhausted, authentication is invalid, or the provider refuses every rewritten request. The implementation guarantees that the application will not self-block solely because its own story policy detector found a warning, and that the next run will leave actionable diagnostics when the provider boundary is reached.
