# Gap review round 10 — image gate, count confirmation, and story grounding

ตรวจซ้ำหลัง implement รอบนี้ โดยแบ่งตรวจ 5 รอบตาม contract → UI → LLM → persistence → verification

## รอบที่ 1: profile/readiness contract

- Profile ที่ `sourceGatePolicy=required` และมี required slot ที่รับ `image` ต้องมี asset ที่มี `mediaAssetId` จริงอย่างน้อย 1 รายการ
- `upload_video` ไม่ถูกนับเป็น image
- fiction profile ที่ gate เป็น optional ยังผ่าน readiness ตามเดิม
- readiness ของ server ส่ง `sourceKind` และ `mediaAssetId` เข้า evaluator แล้ว

ผล: ปิด gap การสร้าง Draft จาก text/metadata ล้วน และยังไม่เปลี่ยนกติกา fiction

## รอบที่ 2: source UI และการตรวจโจทย์

- ภาพแนบใช้ managed storage preview URL เดิมของระบบ ไม่สร้าง URL ภายนอกใหม่
- แสดง gallery ใต้ส่วนสถานะ source pack พร้อมจำนวนภาพและคำแนะนำให้คลิกเพื่อตรวจร่วมกับโจทย์
- thumbnail เป็นปุ่มที่มี accessible label และเปิดภาพขนาดใหญ่ใน Dialog ได้
- วิดีโอไม่ถูกนำมาแสดงเป็น image preview

ผล: ปิด gap ที่ผู้ใช้แนบภาพแล้วแต่ตรวจภาพคู่กับโจทย์ไม่ได้จากหน้าเดียวกัน

## รอบที่ 3: LLM/story/B-roll grounding

- `sourcePackDigest` ถูกอ่านจาก bible อย่าง defensive และถูก thread เข้า standard deep draft
- premium fan-out, premium revise และ missing-episode retry ได้ digest เดียวกัน
- full-story architect ใช้ renderer ที่ส่งเฉพาะ slot title, narrative description, source title/description, source kind และ usage policy แบบ bounded
- prompt ระบุให้ shot/B-roll ที่ใช้ `broll`, `insert`, `overlay` สัมพันธ์กับ source description และห้ามสร้าง factual claim นอกหลักฐาน

ผล: ปิด gap ที่ digest ถูกเก็บแต่ไม่ถูกส่งเข้า prompt; ไม่มี fallback/mock LLM เพิ่ม

## รอบที่ 4: จำนวนตอนและ runtime

- ก่อน create/full-story มี Dialog ยืนยันจำนวนตอนย่อยครั้งสุดท้าย
- จำกัดตาม contract เดิม: 1–1000 ตอน หรือ 1–2 ตอนสำหรับ special edition
- แก้จำนวนแล้ว runtime ประมาณการคำนวณทันทีจาก 9 shots × shot duration ที่เลือก
- ค่า count ที่ยืนยันถูกส่งเข้า `create` โดยตรง จึงไม่เกิด mismatch ระหว่างค่าที่เห็นกับค่าที่สร้าง

ผล: ปิด gap ที่ Draft ระบุจำนวนหนึ่ง แต่ขั้นสร้างเรื่องเต็มใช้ค่า default/ค่าเก่าโดยไม่มีจุดตรวจ

## รอบที่ 5: verification และขอบเขตที่ยังต้องพิสูจน์ภายนอก

- shared source/duration tests ผ่าน 17/17
- story/deep-draft focused tests ผ่าน 108/108
- source-pack service รวม test ผ่าน และชุดรวม backend ที่เกี่ยวข้องผ่าน 130/130
- client CreateSeriesWizard แบบ jsdom ผ่าน 57/57 และ QC/source persistence รวมผ่าน 77/77
- workspace TypeScript check ใช้ script ของ repo (`NODE_OPTIONS=8192`) หลังแก้ type gap รอบแรกแล้ว
- ยังไม่ได้ทำ authenticated browser smoke บน production, live OpenRouter call, deployment หรือ migration เพราะเป็น external boundary; code path ใช้ LLM จริงและไม่มี fallback ใหม่ในงานนี้

ผล: ไม่พบ gap ค้างในขอบเขต source image gate, preview, prompt grounding และ count confirmation จาก static/focused verification รอบนี้
