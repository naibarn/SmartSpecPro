# Gap review loop — Feature 168

ตรวจหลัง implementation 5 รอบ โดยแก้ทันทีทุก gap ที่พบ

## รอบ 1 — contract และ schema drift

พบว่า prepare payload ยังไม่รับ silence ranges จาก guide และสถานะ partial guide อาจไม่มี warning ที่บอกสาเหตุ จึงเพิ่ม `silenceRanges`, strict nested validation และบังคับ warning/unknowns สำหรับสถานะที่ไม่ ready ใน shared contract

ผล: ผ่าน targeted contract tests; unknown field และ invalid status ถูก reject

## รอบ 2 — ตัวละคร, story และ Skill

พบความเสี่ยงที่ LLM จะหยิบตัวละครนอก selection และ story อาจกลายเป็นข้อความรีวิวตรง ๆ จึงเพิ่ม selected-character allowlist, excluded-name rejection, minimum connected prose, dialogue-mode rules และติดตั้ง Skill bundle จริงใน `apps/web/skills`

ผล: Skill output ต้องเป็นเรื่องละครต่อเนื่องและ no-dialogue ใช้ action แทนคำพูด

## รอบ 3 — refresh, polling และ user intent

พบว่า polling อาจยิงต่อหลัง terminal status และ idea ล่าสุดอาจทำให้ refresh แล้วสับสน จึงหยุด polling เมื่อ terminal และ hydrate เฉพาะ collapsed history หลัง refresh

ผล: current ideas เกิดจาก explicit generation เท่านั้น

## รอบ 4 — auth, binding และ billing

พบ race ตอน insert idempotency ที่อาจค้างเครดิต และ artifact ของ prepared footage อาจถูกอ้างข้าม Series binding จึงคืน reservation เมื่อ insert race/error และผูก artifact resolution กับ tenant/user/job/Series binding

ผล: duplicate submit ไม่คิดเครดิตซ้ำ และ cross-Series artifact ไม่ผ่าน

## รอบ 5 — B-roll executor และการโหลด server

พบว่าเดิม B-roll route มีแต่ identity manifest และ Worker จะต้อง fail closed เสมอ จึงเพิ่ม server-side Remotion compiler: resolve authorized signed/proxy URL, สร้าง base/B-roll layers, enforce placement/source bounds และส่ง `remotionInput` ไปใช้ existing Remotion sidecar; Worker delegate โดยไม่ render Chromium บน web server

ผล: เมื่อ Remotion capability และ asset URLs พร้อมจะ render ได้จริงผ่าน Worker; เมื่อไม่พร้อมจะ reject ก่อนทำ artifact/ไม่ fallback ไป render บน server

## ข้อสรุปหลังรอบ 5

ไม่พบ gap ใหม่ในขอบเขต local code ที่ตรวจได้เพิ่มจากรายการข้างต้น ผล production migration, authenticated browser flow, real Worker claim และ protected playback ยังต้องทำใน environment deployment จริง และถูกทำเครื่องหมายเป็น verification gate ไม่ใช่สิ่งที่ local test อ้างแทนได้

## Continuation rounds 6–10

ตรวจซ้ำหลังเพิ่ม B-roll persistence และแก้สถานะ Worker:

1. UI state — พบ gate/polling รอ `published` ทั้งที่ enum จริงของ `worker_jobs` ใช้ `completed`; แก้ให้รองรับ `completed` และ terminal `expired` แล้ว
2. Save/reopen — พบ `renderJobId` และ placement ยังไม่ถูกคืนเมื่อเปิด input เดิม; เพิ่ม field ใน contract และ hydrate กลับใน dialog แล้ว
3. Story consistency — พบ render อาจผูกกับเรื่องก่อน user แก้บท; เพิ่ม deterministic story revision และ server reject งาน render เก่า
4. Server trust boundary — เพิ่มการตรวจ source fingerprint, guide revision, analysis/prepare ownership/status, Series binding และ B-roll job ownership ก่อน create/update
5. Regression — targeted web 17 tests, Worker 34 tests, Vite build และ diff check ผ่าน

ผลรอบต่อเนื่อง: ไม่พบ high-confidence gap ใน local implementation เพิ่มเติม จุดที่ยังเป็น release evidence เท่านั้นคือ authenticated browser click-through, Worker runtime doctor/claim จริง, provider/LLM run จริง และ production deployment
