# Vertical Drama — Story Core จากผู้ใช้ (แก่นเรื่องเป็นกฎสูงสุด) — Task #38

Owner directive (2026-07-09): ใน wizard สร้างซีรีส์ ให้ user ระบุได้ (ไม่บังคับ) ว่าอยากทำเรื่อง
เกี่ยวกับอะไร → ระบบเอา**แก่นจาก user เป็นแกนของเรื่อง** แล้วใช้ preset ที่เลือก (แฟนตาซี/
ข้ามเวลา/ปาฏิหาริย์ ฯลฯ) มา**เสริม** — ถ้าขัดกัน แก่นชนะเสมอ; ไม่ระบุ = พฤติกรรมเดิม

ตัวอย่างจริงจาก owner:
1. "บทเรียนการเลี้ยงลูกแบบผิด ๆ กับเด็กวัย 1 ขวบ ตั้งแต่คลอดมาไม่เคยเสริมพัฒนาการ
   ปล่อยให้นอน หิวก็กิน ได้แต่กินกับเปลี่ยนผ้าอ้อม แม่เอาแต่ดูมือถือ"
2. "นางเอกเป็นเด็กส่งอาหาร พระเอกลูกชาย CEO หนีมาเป็นช่างอู่ซ่อมรถหนีงานบริหาร
   และโดนจับแต่งงานกับคุณหนูหุ้นส่วน"

## หลักการผสม (หัวใจของฟีเจอร์)

**Core > Preset เสมอ** — และ preset ที่ดีต้อง "รับใช้" แก่น ไม่ใช่เบียดแก่น เช่น
แก่นข้อ 1 + preset ข้ามเวลา → กลไกข้ามเวลาถูกใช้เพื่อให้แม่**เห็นผลลัพธ์ในอนาคต**ของการ
เลี้ยงลูกผิด ๆ แล้วได้โอกาสย้อนกลับมาแก้ — แก่นยังคือ "บทเรียนการเลี้ยงลูก" เต็มร้อย
(ตัวอย่างเชิงประกอบนี้จะถูกใส่ใน prompt guidance ตรง ๆ)

กฎใน prompt (บล็อก STORY CORE วางเหนือบล็อก preset identity/mix ทุกตัว):
1. องค์ประกอบทุกอย่างที่ user ระบุ (ตัวละคร อาชีพ สถานการณ์ ประเด็น ธีม) ต้องคงอยู่ครบ
2. preset เพิ่มได้เฉพาะ แนว/โทน/บรรยากาศ/กลไกพิเศษ โดยต้องรับใช้แก่น
3. ขัดแย้งเมื่อไร → แก่นชนะ preset แพ้
4. ห้ามลดทอนแก่นให้เป็นแค่ฉากหลัง — แก่นคือเส้นเรื่องหลัก

## UI (CreateSeriesWizard step 1)

- Textarea ใหม่ **"แก่นเรื่องที่อยากเล่า (ไม่บังคับ)"** ใต้ช่องเรื่องย่อ (logline) —
  วางใกล้ช่อง "ธุรกิจ/ร้าน/บริการที่อยากผูกเรื่อง" ที่เป็น pattern คล้ายกันอยู่แล้ว
- Placeholder = ตัวอย่างย่อจาก owner ทั้ง 2 แบบ; helper text:
  "ระบุสถานการณ์/ตัวละคร/ประเด็นที่ต้องเป็นแกนของเรื่อง — ระบบจะยึดสิ่งนี้เป็นหลัก
  และใช้ preset ที่เลือกมาเสริมแนวเท่านั้น ถ้าไม่ระบุ ระบบแต่งจาก preset ล้วน"
- จำกัด ~1,500 ตัวอักษร; แสดงบนหน้าภาพรวมเป็นการ์ดเล็ก read-only "แก่นเรื่องที่กำหนดไว้"
  (แก้ภายหลัง = fast-follow ผ่าน updateSeries merge — บันทึกเป็น backlog)
- **ต่างจาก logline อย่างไร**: logline = สรุปสั้นเชิงผลลัพธ์ (ระบบ generate ทับได้);
  storyCore = ข้อกำหนดตั้งต้นที่**อยู่รอดการ generate ใหม่ทุกครั้ง**

## Storage

คอลัมน์ใหม่ `vertical_drama_series.storyCore` text nullable (manual SQL + provenance +
backup ตาม protocol) — เป็นคอลัมน์จริงไม่ใช่ bible jsonb เพราะเป็น**INPUT ของ user**
ที่ต้องรอดเมื่อ bible ถูก generate ใหม่/ล้าง (สร้างเนื้อเรื่องใหม่กี่รอบ แก่นต้องยังอยู่)

## Generation wiring

1. `createSeries` (series router): รับ `storyCore?` → persist
2. `generateStoryBible` + เส้นทาง preset mix (storyBible service): โหลด storyCore จาก
   series row → build บล็อก STORY CORE (กฎ 4 ข้อ + ตัวอย่างประกอบ) เหนือ preset blocks
   ทุกโหมด (single preset / mix) — grandfather: null = prompt เดิม byte-identical
3. Deep drafts (generateStoryBibleDeep): แก่นไหลผ่าน bible ที่ generate แล้วโดยธรรมชาติ
   แต่เพิ่ม storyCore เข้า season-sweep/judge context ด้วย (1 บรรทัด) กัน drift ระยะยาว
4. **Adherence check (deterministic, เตือนไม่ block)**: หลัง generate — keyword-overlap
   ระหว่างคำสำคัญของแก่น (ตัด stopwords) กับ mainPlot+loglines+characters; ต่ำกว่า
   threshold → warning "เนื้อเรื่องอาจหลุดแก่นที่กำหนด — ตรวจก่อนใช้" + แสดงใน
   blend report (ต่อยอด report ของ R5: เพิ่มบรรทัด "แก่นจาก user: ยึดตามนี้")

## Tests

wizard field + payload; router persist + zod bounds; prompt มี/ไม่มีบล็อกตาม storyCore;
mix path วางบล็อกเหนือ identity; adherence warning จุดตัด; overview การ์ดแสดงผล;
grandfather byte-identical เมื่อ null

## ลำดับ/ชนไฟล์

BLOCKED BY: #34 (ถือ series router + schema.ts + wizard? — เช็คตอน dispatch ว่า #34
แตะ CreateSeriesWizard ไหม: ไม่ — แต่ schema/router ชน) และ #37 (ถือ storyBible)
→ dispatch เมื่อทั้งคู่ปล่อยไฟล์; ไม่มี flag ใหม่ (เป็น input field ธรรมดา ไม่เปลี่ยน
พฤติกรรมเดิมเมื่อว่าง — grandfather ในตัว)
