# Feature 017 — Virtual Workflow Examples

## Workflow Node Registry (57 Node Types)

### Available Nodes by Category

| Category | Node Types |
|---|---|
| **AI** | `llm_call`, `rag_query`, `generate_image`, `prompt_template`, `output_parser`, `multi_model_router`, `skill` |
| **Flow Control** | `conditional`, `loop`, `switch`, `wait`, `delay`, `retry`, `try_catch`, `parallel`, `join`, `subworkflow`, `execution_timeout`, `rate_limiter`, `circuit_breaker`, `idempotency`, `approval_gate` |
| **Data** | `set_variable`, `merge_data`, `code_runner`, `map_array`, `database_query`, `filter`, `split`, `batch`, `transformer`, `validator`, `read_file`, `write_file`, `csv_parser`, `template_engine` |
| **Triggers** | `manual_trigger`, `form_input`, `webhook_trigger`, `schedule_trigger`, `queue_trigger`, `event_trigger`, `file_upload_trigger`, `error_trigger` |
| **Integrations** | `http_request`, `storage_action`, `mcp_connector`, `graphql_request`, `websocket_client` |
| **Outputs** | `workflow_response`, `webhook_response`, `send_notification`, `send_email`, `send_email` (integration) |
| **Observability** | `metrics_collector`, `dead_letter_queue`, `run_history`, `secrets_vault` |

---

## Use Case Examples

> รายการ Use Case ต่อไปนี้ออกแบบมาให้ครอบคลุมทั้งองค์กรธุรกิจ (SME และ Enterprise) หน่วยงานภาครัฐ สถาบันการศึกษา การแพทย์ และผู้ใช้ทั่วไป โดยแต่ละ Use Case สามารถสร้างได้ด้วย Node ที่มีอยู่ใน registry (หรือระบุเมื่อจำเป็นต้องเพิ่ม Node ใหม่)

---

### กลุ่ม A — ธุรกิจทั่วไป / การขาย / การตลาด

---

#### 1. รายงานยอดขายประจำวัน (Daily Sales Report)

**เป้าหมาย:** สรุปยอดขายรายวันโดยอัตโนมัติ ส่งให้ผู้บริหารทุกเช้า
**กิจการ/หน่วยงาน:** ร้านค้า ธุรกิจ E-commerce บริษัทขาย B2B/B2C
**Input:**
- ฐานข้อมูล orders/transactions ของวันก่อนหน้า
- รายชื่อผู้รับรายงาน (ผู้จัดการ ผู้บริหาร)

**Output:**
- อีเมลรายงานสรุปยอดขาย มูลค่ารวม จำนวนออเดอร์ สินค้าขายดี ลูกค้าใหม่
- คำวิเคราะห์เปรียบเทียบกับเป้าหมาย/วันเดียวกันสัปดาห์ก่อน

**ประโยชน์:** ผู้บริหารไม่ต้องเปิดรายงานเอง มีข้อมูลพร้อมทุกเช้าก่อนเริ่มงาน

**Nodes ที่ใช้:**
```
schedule_trigger → database_query → transformer → llm_call → template_engine → send_email
```

---

#### 2. การวิเคราะห์และตอบกลับรีวิวลูกค้าอัตโนมัติ (Customer Review Response)

**เป้าหมาย:** อ่านรีวิวใหม่จาก Google Maps / Shopee / Lazada แล้วสร้างคำตอบที่เหมาะสมเพื่อให้ทีมอนุมัติก่อนโพสต์
**กิจการ/หน่วยงาน:** ร้านค้าออนไลน์ ร้านอาหาร โรงแรม บริการทุกประเภท
**Input:**
- Webhook จาก platform รีวิว หรือ API polling
- ข้อมูลร้าน / policy การตอบกลับ

**Output:**
- คำตอบที่ร่างโดย AI แยกตาม sentiment (บวก/ลบ/กลาง)
- แจ้งเตือนทีมเพื่ออนุมัติก่อนโพสต์จริง
- บันทึกสถิติ sentiment ลง database

**ประโยชน์:** ลดเวลาตอบรีวิว รักษาคุณภาพการสื่อสาร ไม่มีรีวิวตกหล่น

**Nodes ที่ใช้:**
```
webhook_trigger / schedule_trigger → http_request (review API) → llm_call → output_parser
→ conditional (sentiment) → approval_gate → http_request (post reply) → database_query (save stats)
```

---

#### 3. ระบบคัดกรองและให้คะแนน Lead (Lead Scoring & Routing)

**เป้าหมาย:** เมื่อมีลูกค้าใหม่กรอกแบบฟอร์มหรือส่ง inquiry เข้ามา ให้ AI ประเมิน lead score และส่งต่อให้ทีมขายที่เหมาะสม
**กิจการ/หน่วยงาน:** บริษัท B2B ตัวแทนประกัน นายหน้าอสังหาริมทรัพย์ SaaS
**Input:**
- Webhook จากฟอร์ม / CRM (ชื่อ บริษัท ขนาดทีม งบประมาณ ความต้องการ)
- ข้อมูลประวัติลูกค้าที่คล้ายกันจาก database

**Output:**
- Lead score 0-100 พร้อม reasoning
- อัปเดต CRM ผ่าน API
- แจ้งพนักงานขายที่รับผิดชอบทาง Slack/Line

**ประโยชน์:** ทีมขายโฟกัสกับ lead ที่มีโอกาสปิดการขายสูง ไม่เสียเวลากับ lead คุณภาพต่ำ

**Nodes ที่ใช้:**
```
webhook_trigger → validator → rag_query (similar customers) → llm_call → output_parser
→ http_request (CRM API update) → switch (score tier) → send_notification (sales team)
```

---

#### 4. สร้างคำอธิบายสินค้าอัตโนมัติ (Product Description Generator)

**เป้าหมาย:** เมื่อเพิ่มสินค้าใหม่เข้าระบบ ให้ AI สร้างคำอธิบายสินค้าสำหรับหลายช่องทาง (เว็บ / Shopee / Lazada / Instagram)
**กิจการ/หน่วยงาน:** ร้านค้าออนไลน์ ผู้ผลิตสินค้า แบรนด์ต่าง ๆ
**Input:**
- ชื่อสินค้า หมวดหมู่ specs หลัก รูปภาพ (optional)
- Brand voice / tone guide

**Output:**
- คำอธิบายสินค้าสำหรับแต่ละ platform (ความยาวและ format ต่างกัน)
- Hashtag แนะนำสำหรับ social media
- ต้องผ่านการอนุมัติก่อนเผยแพร่

**ประโยชน์:** ลดเวลาเขียน content หลายชั่วโมงต่อสินค้า ให้เหลือไม่กี่นาที

**Nodes ที่ใช้:**
```
event_trigger / form_input → prompt_template → parallel [
  llm_call (website desc),
  llm_call (Shopee format),
  llm_call (Instagram caption)
] → join → approval_gate → database_query (save) → send_notification
```

---

#### 5. ติดตามราคาคู่แข่งและแจ้งเตือน (Competitor Price Monitoring)

**เป้าหมาย:** ตรวจสอบราคาคู่แข่งทุกวัน เปรียบเทียบกับราคาของเรา แจ้งเตือนเมื่อคู่แข่งปรับราคา
**กิจการ/หน่วยงาน:** ร้านค้าออนไลน์ E-commerce ธุรกิจ retail
**Input:**
- รายการ URL สินค้าคู่แข่ง (stored in database)
- ราคาสินค้าของเราปัจจุบัน

**Output:**
- รายงานเปรียบเทียบราคา
- แจ้งเตือนทีมราคาเมื่อพบความแตกต่างเกินกำหนด
- แนะนำการปรับราคาโดย AI

**ประโยชน์:** ทีมราคาไม่ต้องตรวจสอบเองทุกวัน ตอบสนองตลาดได้เร็วขึ้น

**Nodes ที่ใช้:**
```
schedule_trigger → database_query (competitor urls) → loop → http_request (scrape/API)
→ llm_call (extract price) → database_query (compare) → filter (significant changes)
→ conditional → send_notification + send_email (pricing team)
```

---

#### 6. สรุปประชุมและกระจายรายงาน (Meeting Summary Distribution)

**เป้าหมาย:** หลังประชุม ให้ AI สรุป meeting notes / transcript และส่งให้ผู้เข้าร่วมพร้อม action items
**กิจการ/หน่วยงาน:** บริษัทและองค์กรทุกขนาด
**Input:**
- Meeting transcript (text) หรือ meeting notes ที่พิมพ์มา
- รายชื่อผู้เข้าร่วมและอีเมล

**Output:**
- สรุปประเด็นสำคัญ
- รายการ action items พร้อมผู้รับผิดชอบ
- ส่งอีเมลให้ผู้เข้าร่วมทุกคน
- บันทึกลง project management tool ผ่าน API

**ประโยชน์:** ไม่มีการลืม action items บันทึกมีคุณภาพสม่ำเสมอ ลดเวลาสรุป

**Nodes ที่ใช้:**
```
form_input (paste transcript + attendees) → llm_call (summarize + extract actions)
→ output_parser → parallel [
  send_email (all attendees),
  http_request (project tool API - Jira/Asana/Notion)
]
```

---

#### 7. ส่ง Newsletter รายสัปดาห์แบบ Personalized (Personalized Newsletter)

**เป้าหมาย:** ส่ง newsletter ที่ปรับเนื้อหาตาม interests ของแต่ละคน ทุกวันจันทร์
**กิจการ/หน่วยงาน:** สื่อ บล็อก ธุรกิจ subscription
**Input:**
- ฐานข้อมูลสมาชิกและ preference ของแต่ละคน
- content pool สำหรับสัปดาห์นี้

**Output:**
- อีเมล newsletter ที่ปรับเนื้อหาเฉพาะบุคคล
- บันทึก sent log

**ประโยชน์:** Open rate สูงขึ้น ลูกค้า engage มากขึ้น ไม่เสีย time ทำ segment ด้วยมือ

**Nodes ที่ใช้:**
```
schedule_trigger → database_query (subscribers + preferences) → batch (500/batch)
→ loop → rag_query (relevant content) → template_engine → send_email → metrics_collector
```

---

#### 8. ระบบอนุมัติใบเสนอราคา (Quote Approval Workflow)

**เป้าหมาย:** ใบเสนอราคาที่เกินวงเงินจะถูกส่งให้ผู้มีอำนาจอนุมัติก่อนส่งลูกค้า
**กิจการ/หน่วยงาน:** บริษัทบริการ ผู้รับเหมา ธุรกิจ B2B
**Input:**
- รายละเอียดใบเสนอราคา (สินค้า/บริการ จำนวน มูลค่า ลูกค้า)
- Policy วงเงินอนุมัติแต่ละระดับ

**Output:**
- ส่ง approval request ไปยังผู้มีอำนาจระดับที่ถูกต้อง
- เมื่ออนุมัติ: ส่งใบเสนอราคาให้ลูกค้าอัตโนมัติ
- เมื่อปฏิเสธ: แจ้งทีมขายพร้อมเหตุผล

**ประโยชน์:** ลด cycle time approval กำจัดขั้นตอนอีเมลซ้อนอีเมล

**Nodes ที่ใช้:**
```
form_input / webhook_trigger → validator → switch (amount tiers) → approval_gate
→ conditional (approved/rejected) → [send_email (customer) / send_notification (sales team)]
→ database_query (update status)
```

---

### กลุ่ม B — ทรัพยากรบุคคล (HR)

---

#### 9. คัดกรองใบสมัครงาน (Resume Screening & Scoring)

**เป้าหมาย:** เมื่อได้รับใบสมัครงาน ให้ AI ประเมินว่าผู้สมัครตรงตามคุณสมบัติที่กำหนดมากน้อยเพียงใด
**กิจการ/หน่วยงาน:** บริษัทและองค์กรทุกประเภทที่รับสมัครงาน
**Input:**
- ใบสมัคร/ประวัติ (PDF / text)
- Job description และคุณสมบัติที่ต้องการ

**Output:**
- คะแนน match 0-100 พร้อม breakdown
- จุดแข็ง/จุดอ่อนของผู้สมัคร
- แจ้งทีม HR ผู้สมัครที่ผ่านเกณฑ์
- บันทึกสถานะลง ATS system

**ประโยชน์:** ลดเวลาคัดกรองจากหลายชั่วโมงเหลือไม่กี่นาที ใช้เกณฑ์สม่ำเสมอ ไม่มี bias

**Nodes ที่ใช้:**
```
file_upload_trigger / webhook_trigger → read_file → prompt_template → llm_call
→ output_parser (score + points) → conditional (threshold) → [
  send_notification (HR - shortlisted),
  send_email (auto-reply to candidate)
] → database_query (update ATS)
```

---

#### 10. กระบวนการ Onboarding พนักงานใหม่ (Employee Onboarding Process)

**เป้าหมาย:** เมื่อพนักงานใหม่เริ่มงาน ระบบจัดการขั้นตอน onboarding ทั้งหมดอัตโนมัติ
**กิจการ/หน่วยงาน:** บริษัทและองค์กรทุกขนาด
**Input:**
- ข้อมูลพนักงานใหม่ (ชื่อ ตำแหน่ง แผนก วันเริ่มงาน email)

**Output:**
- สร้าง account ระบบต่าง ๆ ผ่าน API (email, Slack, HR system)
- ส่งชุด welcome email ลำดับขั้น (Day 1, Week 1, Month 1)
- แจ้ง manager และ IT team
- กำหนด checklist และ deadline ลง task management

**ประโยชน์:** ประสบการณ์ onboarding สม่ำเสมอ ลดภาระ HR ไม่มีขั้นตอนตกหล่น

**Nodes ที่ใช้:**
```
manual_trigger / event_trigger → form_input (employee details) → parallel [
  http_request (create email account),
  http_request (add to Slack),
  http_request (HR system),
  send_email (welcome email)
] → join → wait (delay 1 day) → send_email (day 2 checklist)
→ wait (delay 7 days) → send_email (week 1 check-in)
```

---

#### 11. ขอลาและอนุมัติวันลา (Leave Request & Approval)

**เป้าหมาย:** พนักงานยื่นใบลาออนไลน์ ระบบตรวจสอบวันลาคงเหลือและส่ง approve ให้หัวหน้า
**กิจการ/หน่วยงาน:** บริษัทและองค์กรทุกขนาด
**Input:**
- ประเภทวันลา วันที่ จำนวนวัน เหตุผล (from form)
- ข้อมูลวันลาคงเหลือและนโยบายบริษัท

**Output:**
- แจ้ง manager ให้อนุมัติ/ปฏิเสธ
- อัปเดตระบบ HR อัตโนมัติ
- แจ้งผลให้พนักงาน
- อัปเดต calendar ทีม

**ประโยชน์:** ลดกระดาษ ลดเวลาประสานงาน มีประวัติชัดเจน

**Nodes ที่ใช้:**
```
form_input → validator → database_query (check leave balance) → conditional (sufficient balance)
→ approval_gate (manager) → conditional (approved) → parallel [
  database_query (deduct leave),
  send_email (employee result),
  http_request (update calendar API)
]
```

---

#### 12. แจ้งเตือนวันเกิดและวันครบรอบพนักงาน (Employee Anniversary Notifications)

**เป้าหมาย:** ส่งคำอวยพรวันเกิดและแจ้งผู้บริหารเมื่อพนักงานครบรอบ milestone การทำงาน
**กิจการ/หน่วยงาน:** บริษัทและองค์กรทุกขนาด
**Input:**
- ฐานข้อมูลพนักงาน (วันเกิด วันที่เริ่มงาน)

**Output:**
- อีเมล/LINE แจ้งเตือนวันเกิดพร้อมข้อความส่วนตัว
- รายงานพนักงานที่ครบ 1/3/5/10 ปีในเดือนนี้ ส่งให้ HR และผู้บริหาร

**ประโยชน์:** สร้างวัฒนธรรมองค์กรที่ดี ไม่ลืมพนักงาน

**Nodes ที่ใช้:**
```
schedule_trigger (daily 8am) → database_query (birthdays and anniversaries today)
→ filter → loop → template_engine → send_notification / send_email
```

---

#### 13. รายงานสรุปการทำงาน OKR/KPI รายเดือน (Monthly OKR Report)

**เป้าหมาย:** รวบรวมข้อมูลผลการดำเนินงาน สร้างรายงาน OKR/KPI รายบุคคลและทีม
**กิจการ/หน่วยงาน:** บริษัทที่ใช้ระบบ OKR/KPI
**Input:**
- ข้อมูล KPI ของแต่ละพนักงาน/ทีมจาก database
- เป้าหมายที่กำหนดไว้

**Output:**
- รายงาน PDF สรุปผลงาน OKR แต่ละทีม
- วิเคราะห์ trend และคำแนะนำเชิง AI
- ส่งให้ผู้บริหารระดับต่าง ๆ ตามสายงาน

**Nodes ที่ใช้:**
```
schedule_trigger (end of month) → database_query → transformer → llm_call (analysis)
→ template_engine → storage_action (save PDF) → send_email
```

---

### กลุ่ม C — การเงิน / บัญชี

---

#### 14. กระทบยอดธุรกรรมประจำวัน (Daily Transaction Reconciliation)

**เป้าหมาย:** เปรียบเทียบยอดรายการจาก Bank Statement กับข้อมูลในระบบบัญชีภายใน แจ้งเตือนเมื่อไม่ตรง
**กิจการ/หน่วยงาน:** บริษัท ร้านค้า ธุรกิจทุกขนาดที่มีทีมบัญชี
**Input:**
- ไฟล์ Bank Statement (CSV / Excel) ประจำวัน
- ข้อมูลธุรกรรมในระบบบัญชีภายใน

**Output:**
- รายงาน matched / unmatched transactions
- แจ้งเตือนทีมบัญชีเมื่อมีรายการที่ไม่ตรง
- บันทึกสถิติความถูกต้องรายวัน

**ประโยชน์:** ลดงาน manual reconciliation ลดความผิดพลาด ตรวจพบปัญหารวดเร็ว

**Nodes ที่ใช้:**
```
schedule_trigger / file_upload_trigger → csv_parser → database_query (internal records)
→ code_runner (reconcile logic) → filter (unmatched) → conditional
→ send_notification + send_email (accounting team) → database_query (save report)
```

---

#### 15. แจ้งเตือนค่าใช้จ่ายเกินงบประมาณ (Budget Overspend Alert)

**เป้าหมาย:** ตรวจสอบการใช้งบประมาณแต่ละแผนกรายสัปดาห์ แจ้งเตือนเมื่อใกล้หรือเกิน budget
**กิจการ/หน่วยงาน:** บริษัทและองค์กรทุกขนาดที่มีการจัดสรรงบประมาณ
**Input:**
- ข้อมูลค่าใช้จ่ายสะสมแต่ละแผนก
- งบประมาณที่ได้รับอนุมัติ

**Output:**
- แจ้งเตือนหัวหน้าแผนกเมื่อใช้งบเกิน 80% และ 100%
- รายงาน budget utilization รายสัปดาห์ส่ง CFO

**Nodes ที่ใช้:**
```
schedule_trigger (weekly) → database_query (expenses per dept) → code_runner (calc %)
→ filter (>80%) → loop → switch (>80% or >100%) → send_notification (dept head)
→ send_email (CFO report)
```

---

#### 16. สรุปรายงานกำไร-ขาดทุนรายเดือน (Monthly P&L Summary)

**เป้าหมาย:** รวบรวมข้อมูลรายได้และค่าใช้จ่าย สร้างรายงาน P&L พร้อมคำวิเคราะห์เปรียบเทียบ
**กิจการ/หน่วยงาน:** บริษัทและธุรกิจทุกขนาด
**Input:**
- ข้อมูลรายได้และค่าใช้จ่ายจาก database เดือนที่ผ่านมา
- ข้อมูลเดียวกันของเดือนก่อนหน้า / ปีที่แล้ว (YoY)

**Output:**
- รายงาน P&L ฉบับสมบูรณ์
- คำวิเคราะห์ trend และปัจจัยที่มีผลกระทบโดย AI
- ส่งให้ผู้บริหารในทุกวันที่ 5 ของเดือน

**Nodes ที่ใช้:**
```
schedule_trigger → database_query → transformer → merge_data (current + prior period)
→ llm_call (analysis + narrative) → template_engine → send_email
```

---

#### 17. แจ้งเตือนการชำระเงินที่ค้างชำระ (Overdue Invoice Reminder)

**เป้าหมาย:** ส่งอีเมลเตือนลูกค้าที่ค้างชำระตามระยะเวลา (7/14/30 วัน) อัตโนมัติ
**กิจการ/หน่วยงาน:** ธุรกิจ B2B ที่มีใบแจ้งหนี้รายเดือน
**Input:**
- ฐานข้อมูลใบแจ้งหนี้และสถานะการชำระ
- Template อีเมลตามระดับ urgency

**Output:**
- อีเมลเตือนอัตโนมัติตาม escalation level
- รายงาน aged receivables ส่ง CFO รายสัปดาห์

**Nodes ที่ใช้:**
```
schedule_trigger (daily) → database_query (overdue invoices) → filter
→ loop → switch (days overdue: 7/14/30) → template_engine → send_email
→ database_query (log sent)
```

---

### กลุ่ม D — IT / DevOps / Engineering

---

#### 18. ตรวจสอบสุขภาพระบบและแจ้งเตือน (System Health Monitoring)

**เป้าหมาย:** ตรวจสอบ API endpoints, database, external services ทุก 5 นาที แจ้งเตือน on-call engineer เมื่อพบปัญหา
**กิจการ/หน่วยงาน:** บริษัท IT ทีม DevOps สตาร์ทอัพ SaaS
**Input:**
- รายการ endpoints / services ที่ต้องตรวจ
- ค่า threshold (response time, error rate)

**Output:**
- Dashboard สถานะระบบ (เก็บใน metrics)
- แจ้งเตือน PagerDuty / Slack ทันทีเมื่อ down
- รายงานสรุป uptime รายสัปดาห์

**Nodes ที่ใช้:**
```
schedule_trigger (every 5 min) → loop (endpoints) → http_request (health check)
→ try_catch → conditional (status/latency) → circuit_breaker → send_notification
→ metrics_collector
```

---

#### 19. วิเคราะห์ Error Log และแจ้งเตือน (Error Log Analysis)

**เป้าหมาย:** อ่าน application log รายชั่วโมง ให้ AI วิเคราะห์ error pattern แจ้งเตือนเมื่อพบ anomaly
**กิจการ/หน่วยงาน:** ทีม Engineering ทุกบริษัทที่มีระบบ production
**Input:**
- Log files จาก application server
- Baseline error rate ปกติ

**Output:**
- สรุป top errors และ frequency
- ระบุ pattern ผิดปกติ (error spike)
- ส่ง alert พร้อม context ให้ on-call engineer

**Nodes ที่ใช้:**
```
schedule_trigger → read_file (log file) → split (by newline) → filter (errors only)
→ batch → llm_call (analyze pattern) → output_parser → conditional (anomaly)
→ send_notification
```

---

#### 20. Pipeline อนุมัติ Deployment (Deployment Approval Pipeline)

**เป้าหมาย:** เมื่อมี pull request หรือ build สำเร็จ ให้ส่งขอ approval ก่อน deploy สู่ production
**กิจการ/หน่วยงาน:** ทีม Engineering / DevOps
**Input:**
- Webhook จาก CI/CD (GitHub Actions, GitLab CI)
- รายละเอียด build: branch, changes summary, test results

**Output:**
- ส่ง approval request ไปยัง Tech Lead / CTO
- เมื่ออนุมัติ: trigger deployment ผ่าน API
- แจ้งทีมเมื่อ deploy สำเร็จหรือล้มเหลว

**Nodes ที่ใช้:**
```
webhook_trigger (CI/CD) → llm_call (summarize changes) → approval_gate (tech lead)
→ conditional → http_request (trigger deploy) → wait → http_request (check status)
→ send_notification (team Slack)
```

---

#### 21. Backup Verification อัตโนมัติ (Database Backup Verification)

**เป้าหมาย:** ตรวจสอบว่า database backup รายวันสำเร็จ และทดสอบ restore ได้จริง
**กิจการ/หน่วยงาน:** บริษัทที่มี critical data ทุกประเภท
**Input:**
- Storage location ของ backup files
- ข้อมูล checksum / metadata ที่คาดหวัง

**Output:**
- รายงาน backup status รายวัน
- แจ้งเตือนทันทีหาก backup ล้มเหลว
- Weekly report ส่ง CTO

**Nodes ที่ใช้:**
```
schedule_trigger → http_request (check S3/storage) → storage_action (verify file)
→ database_query (test restore query) → conditional → [send_notification (alert) / metrics_collector]
→ send_email (weekly report)
```

---

### กลุ่ม E — การแพทย์ / สาธารณสุข

---

#### 22. แจ้งเตือนนัดหมายผู้ป่วย (Patient Appointment Reminder)

**เป้าหมาย:** ส่งการแจ้งเตือนนัดหมายแพทย์ล่วงหน้า 24 ชั่วโมง และ 2 ชั่วโมงก่อนนัด
**กิจการ/หน่วยงาน:** คลินิก โรงพยาบาล ทันตแพทย์ สถานพยาบาล
**Input:**
- ตารางนัดหมายจาก HIS (Hospital Information System)
- ข้อมูลติดต่อผู้ป่วย (โทรศัพท์ / อีเมล)

**Output:**
- SMS / LINE แจ้งเตือนพร้อมรายละเอียดนัด
- ลิงก์ยืนยัน/ขอเลื่อนนัด
- รายงานยืนยันนัดวันก่อนให้แพทย์

**ประโยชน์:** ลด no-show rate ลดภาระโทรหาผู้ป่วย

**Nodes ที่ใช้:**
```
schedule_trigger (every hour) → database_query (appointments in 24h & 2h)
→ filter → loop → template_engine → send_notification → database_query (log sent)
```

---

#### 23. แจ้งเตือนผลตรวจทางห้องปฏิบัติการ (Lab Result Notification)

**เป้าหมาย:** เมื่อผลแลปออก แจ้งแพทย์เจ้าของไข้และผู้ป่วยทันที พร้อม flag ค่าผิดปกติ
**กิจการ/หน่วยงาน:** โรงพยาบาล คลินิก lab
**Input:**
- ผลตรวจจาก LIS (Lab Information System) ผ่าน event/webhook
- ค่า reference range ปกติ

**Output:**
- แจ้งแพทย์ผ่าน app ทันที พร้อม flag ค่าผิดปกติ (สูง/ต่ำกว่าปกติ)
- แจ้งผู้ป่วยว่าผลออกแล้ว ให้นัดพบแพทย์

**Nodes ที่ใช้:**
```
event_trigger (LIS webhook) → validator → code_runner (compare vs reference)
→ conditional (abnormal values) → parallel [
  send_notification (doctor - urgent if critical),
  send_notification (patient)
]
```

---

#### 24. สรุปประวัติผู้ป่วยก่อนพบแพทย์ (Pre-Visit Patient Summary)

**เป้าหมาย:** ก่อนผู้ป่วยพบแพทย์ ให้ AI สรุปประวัติการรักษา ยาที่ใช้ และเรื่องที่ควรติดตาม
**กิจการ/หน่วยงาน:** โรงพยาบาล คลินิกผู้ป่วยระยะยาว
**Input:**
- ประวัติการรักษาจาก EMR ย้อนหลัง 12 เดือน
- รายการยาปัจจุบัน ผลตรวจล่าสุด

**Output:**
- สรุป 1 หน้า A4 ส่งให้แพทย์ก่อนนัด 30 นาที
- Highlight ประเด็นสำคัญที่ควรพูดถึง

**ประโยชน์:** แพทย์ประหยัดเวลาอ่านประวัติ โฟกัสกับการรักษา

**Nodes ที่ใช้:**
```
schedule_trigger → database_query (appointments next 30 min) → loop
→ rag_query (patient history) → llm_call (summarize) → send_notification (doctor)
```

---

### กลุ่ม F — การศึกษา

---

#### 25. แจ้งเตือน Deadline การส่งงาน (Assignment Deadline Reminder)

**เป้าหมาย:** ส่งการแจ้งเตือนนักเรียน/นักศึกษาก่อน deadline งานส่ง 3 วัน, 1 วัน และ 3 ชั่วโมง
**กิจการ/หน่วยงาน:** โรงเรียน มหาวิทยาลัย สถาบันการศึกษา
**Input:**
- ตาราง deadline งานจาก LMS
- รายชื่อนักเรียนที่ยังไม่ส่ง

**Output:**
- แจ้งเตือน LINE / อีเมล นักเรียน
- รายงานสรุปผู้ที่ยังไม่ส่งให้อาจารย์

**Nodes ที่ใช้:**
```
schedule_trigger → database_query (pending assignments by deadline) → filter (not submitted)
→ loop → switch (3 days / 1 day / 3 hours) → template_engine → send_notification
```

---

#### 26. ตรวจสอบการลอกงาน (Plagiarism & AI-Content Detection)

**เป้าหมาย:** เมื่อนักเรียนส่งงาน ให้ตรวจสอบ plagiarism และ detect AI-generated content
**กิจการ/หน่วยงาน:** มหาวิทยาลัย สถาบันวิชาชีพ
**Input:**
- ไฟล์งานที่ส่ง (PDF / Word)
- งานเก่าของนักเรียนคนอื่นใน database

**Output:**
- รายงานความเหมือน (similarity score)
- Flag เนื้อหาที่น่าสงสัย
- แจ้งอาจารย์เมื่อพบเกินเกณฑ์ที่กำหนด

**Nodes ที่ใช้:**
```
file_upload_trigger → read_file → split (paragraphs) → rag_query (similar texts)
→ llm_call (assess originality) → output_parser (score) → conditional
→ send_notification (instructor)
```

---

#### 27. สร้างแบบทดสอบจากเอกสาร (Auto Quiz Generation)

**เป้าหมาย:** อาจารย์อัปโหลด lecture notes ให้ AI สร้างแบบทดสอบพร้อมเฉลย
**กิจการ/หน่วยงาน:** โรงเรียน มหาวิทยาลัย
**Input:**
- ไฟล์เอกสารการสอน (PDF / Word)
- ระดับความยาก จำนวนข้อ ประเภทคำถาม

**Output:**
- ชุดข้อสอบ multiple choice / short answer / essay พร้อมเฉลย
- บันทึกลง LMS โดยอัตโนมัติ

**Nodes ที่ใช้:**
```
form_input (file + params) → file_upload_trigger → read_file
→ prompt_template → llm_call → output_parser → approval_gate (instructor)
→ http_request (LMS API) → send_notification
```

---

#### 28. รายงานผลการเรียนรายเทอม (Student Progress Report)

**เป้าหมาย:** สร้างรายงานผลการเรียนรายบุคคลสำหรับผู้ปกครอง พร้อมคำแนะนำเฉพาะตัว
**กิจการ/หน่วยงาน:** โรงเรียน
**Input:**
- คะแนนทุกวิชา การเข้าเรียน พฤติกรรม
- เกณฑ์มาตรฐาน

**Output:**
- รายงาน PDF ส่วนตัวสำหรับผู้ปกครองแต่ละคน
- คำแนะนำการพัฒนา
- ส่งทางอีเมลหรือ LINE

**Nodes ที่ใช้:**
```
schedule_trigger (end of term) → database_query → batch (by class)
→ loop (per student) → llm_call (generate personal narrative)
→ template_engine → send_email
```

---

### กลุ่ม G — ภาครัฐ / องค์กรสาธารณะ

---

#### 29. ประมวลผลคำร้องขอบริการจากประชาชน (Citizen Service Request Processing)

**เป้าหมาย:** ประชาชนยื่นคำร้องออนไลน์ ระบบจัดเส้นทางไปยังหน่วยงานที่รับผิดชอบอัตโนมัติ
**กิจการ/หน่วยงาน:** เทศบาล อบต. หน่วยงานภาครัฐ
**Input:**
- แบบฟอร์มคำร้อง (ประเภทปัญหา สถานที่ รายละเอียด รูปภาพ)

**Output:**
- เลขที่รับเรื่องและ QR code ติดตาม
- ส่งต่อให้หน่วยงานที่รับผิดชอบโดยอัตโนมัติ
- แจ้ง status update ให้ผู้ร้องเรียน

**Nodes ที่ใช้:**
```
webhook_trigger / form_input → validator → llm_call (classify request type)
→ switch (department routing) → database_query (create ticket)
→ parallel [send_notification (dept), send_notification (citizen + ref no)]
```

---

#### 30. สรุปข่าวสารสำหรับผู้บริหารรายวัน (Executive News Brief)

**เป้าหมาย:** รวบรวมข่าวที่เกี่ยวข้องกับองค์กร อุตสาหกรรม และนโยบาย สรุปส่งผู้บริหารทุกเช้า
**กิจการ/หน่วยงาน:** หน่วยงานรัฐ บริษัทขนาดใหญ่ สมาคมวิชาชีพ
**Input:**
- RSS feeds / news APIs ที่กำหนดไว้
- Keyword ที่เกี่ยวข้อง

**Output:**
- สรุปข่าวสำคัญ 5-10 ข้อ พร้อมลิงก์ต้นฉบับ
- จัดหมวดหมู่ (นโยบาย / เศรษฐกิจ / อุตสาหกรรม)
- ส่งอีเมลเวลา 6:30 ทุกเช้า

**Nodes ที่ใช้:**
```
schedule_trigger (6:00 AM) → parallel [http_request (RSS/news API x3)]
→ join → merge_data → llm_call (summarize + categorize)
→ template_engine → send_email
```

---

#### 31. แจ้งเตือนงบประมาณโครงการ (Project Budget Alert)

**เป้าหมาย:** ติดตามการใช้จ่ายโครงการ แจ้งเตือนผู้รับผิดชอบเมื่อใกล้ครบงบ
**กิจการ/หน่วยงาน:** หน่วยงานรัฐ NGO บริษัทที่ดูแลหลายโครงการ
**Input:**
- ข้อมูลค่าใช้จ่ายสะสมแต่ละโครงการ
- งบประมาณที่ได้รับอนุมัติ milestone

**Output:**
- แจ้งเตือน project manager เมื่อใช้งบเกิน 70%, 90%, 100%
- รายงานภาพรวม portfolio ทุกโครงการ

**Nodes ที่ใช้:**
```
schedule_trigger (weekly) → database_query → code_runner (calc burn rate)
→ filter → loop → switch (70/90/100%) → send_notification → send_email (PMO)
```

---

### กลุ่ม H — ผู้ใช้ทั่วไป / Personal Use

---

#### 32. สรุปข่าวส่วนตัวรายวัน (Personal News Digest)

**เป้าหมาย:** รวบรวมข่าวจาก sources ที่สนใจ สรุปและส่งอีเมลทุกเช้า
**ผู้ใช้:** นักลงทุน นักธุรกิจ ผู้ที่ติดตามข่าว
**Input:**
- รายการ RSS / news topics ที่กำหนดเอง
- ความยาวสรุปที่ต้องการ

**Output:**
- Email digest พร้อมสรุปเป็นภาษาไทย/อังกฤษ
- จัด priority ตาม relevance

**Nodes ที่ใช้:**
```
schedule_trigger → parallel [http_request (news APIs)] → join
→ llm_call (summarize + translate) → template_engine → send_email
```

---

#### 33. ติดตามราคาหุ้นและแจ้งเตือน (Stock Price Alert)

**เป้าหมาย:** ตรวจสอบราคาหุ้น/crypto ที่ติดตาม แจ้งเตือนเมื่อถึงราคาเป้าหมาย
**ผู้ใช้:** นักลงทุนรายย่อย
**Input:**
- รายการ symbol และ price target (buy/sell)
- ราคาปัจจุบันจาก finance API

**Output:**
- Push notification เมื่อราคาถึงเป้าหมาย
- สรุป portfolio วันละครั้ง

**Nodes ที่ใช้:**
```
schedule_trigger (every 15 min) → database_query (watchlist) → loop
→ http_request (price API) → conditional (price >= target)
→ send_notification → rate_limiter (prevent spam)
```

---

#### 34. บันทึกค่าใช้จ่ายและสรุปรายเดือน (Personal Expense Tracker)

**เป้าหมาย:** บันทึกค่าใช้จ่ายรายวัน สรุปและวิเคราะห์ทุกสิ้นเดือน
**ผู้ใช้:** บุคคลทั่วไปที่ต้องการควบคุมการเงิน
**Input:**
- ข้อมูลค่าใช้จ่ายที่กรอกรายวัน (manual trigger / form)
- งบประมาณที่ตั้งไว้

**Output:**
- รายงานสรุปรายหมวดหมู่
- กราฟค่าใช้จ่ายเทียบงบ
- คำแนะนำการลดค่าใช้จ่ายจาก AI

**Nodes ที่ใช้:**
```
schedule_trigger (end of month) → database_query → transformer
→ llm_call (analysis + tips) → template_engine → send_email
```

---

#### 35. แผนการท่องเที่ยวส่วนตัว (Travel Itinerary Generator)

**เป้าหมาย:** กรอกข้อมูลการเดินทาง ให้ AI สร้างแผนการเดินทางละเอียดพร้อมข้อมูลที่พัก อาหาร สถานที่
**ผู้ใช้:** นักท่องเที่ยว
**Input:**
- ปลายทาง จำนวนวัน งบประมาณ ความสนใจ (ธรรมชาติ/วัฒนธรรม/อาหาร)
- วันที่เดินทาง

**Output:**
- แผนการเดินทางรายวัน พร้อมเวลา สถานที่ ข้อแนะนำ
- รายการสิ่งของที่ต้องเตรียม
- ส่งไฟล์ PDF และ/หรืออีเมล

**Nodes ที่ใช้:**
```
form_input → http_request (weather API) → rag_query (destination info)
→ prompt_template → llm_call → template_engine → send_email
```

---

#### 36. แนะนำสูตรอาหารจากวัตถุดิบ (Recipe Suggestion from Ingredients)

**เป้าหมาย:** บอก AI ว่ามีวัตถุดิบอะไรในตู้เย็น ให้แนะนำสูตรอาหารที่เหมาะสม
**ผู้ใช้:** บุคคลทั่วไป
**Input:**
- รายชื่อวัตถุดิบที่มี
- preference (มังสวิรัติ / อาหารไทย / เวลาทำ)

**Output:**
- 3-5 สูตรอาหารพร้อมขั้นตอนละเอียด
- รายการวัตถุดิบที่ต้องซื้อเพิ่ม

**Nodes ที่ใช้:**
```
form_input → prompt_template → llm_call → output_parser → workflow_response
```

---

### กลุ่ม I — อสังหาริมทรัพย์ / นายหน้า

---

#### 37. จับคู่ผู้ซื้อกับอสังหาริมทรัพย์ (Property Matching)

**เป้าหมาย:** เมื่อมีทรัพย์สินใหม่เข้าระบบ ให้จับคู่กับผู้ซื้อที่สนใจและส่งแจ้งเตือน
**กิจการ/หน่วยงาน:** บริษัทนายหน้าอสังหา แพลตฟอร์มอสังหา
**Input:**
- รายละเอียดทรัพย์สินใหม่ (ที่ตั้ง ราคา ขนาด ประเภท)
- Requirement ของผู้ซื้อแต่ละราย

**Output:**
- รายชื่อผู้ซื้อที่ match พร้อม % compatibility
- แจ้งเตือนนายหน้าและผู้ซื้อที่เกี่ยวข้อง

**Nodes ที่ใช้:**
```
event_trigger (new property) → rag_query (buyer requirements)
→ llm_call (calculate match) → filter (>70% match)
→ loop → send_notification (agent + buyer)
```

---

#### 38. สร้างรายงานประเมินราคาทรัพย์สิน (Property Valuation Report)

**เป้าหมาย:** วิเคราะห์ราคาตลาดของทรัพย์สินโดยเปรียบเทียบกับการขายในพื้นที่ใกล้เคียง
**กิจการ/หน่วยงาน:** บริษัทประเมินมูลค่า ธนาคาร นายหน้า
**Input:**
- ที่อยู่ทรัพย์สิน ขนาด อายุอาคาร สภาพ
- ข้อมูลการขายทรัพย์ในรัศมี 1-3 กม. จาก database

**Output:**
- รายงานประเมินราคา พร้อม comparable properties
- Range ราคาที่แนะนำ
- ส่งให้ผู้ขาย/ธนาคาร

**Nodes ที่ใช้:**
```
form_input → database_query (comparable sales) → http_request (map API for distance)
→ llm_call (valuation analysis) → template_engine → send_email
```

---

### กลุ่ม J — การขนส่ง / Logistics

---

#### 39. แจ้งเตือนสถานะการจัดส่ง (Shipment Status Notification)

**เป้าหมาย:** อัปเดต tracking status และแจ้งลูกค้าทุกครั้งที่พัสดุเปลี่ยน milestone
**กิจการ/หน่วยงาน:** บริษัทขนส่ง ร้านค้าออนไลน์
**Input:**
- Webhook จากระบบขนส่ง (tracking events)
- ข้อมูลลูกค้าและการสั่งซื้อ

**Output:**
- SMS / LINE แจ้งสถานะพัสดุ (รับพัสดุแล้ว / กำลังจัดส่ง / ถึงแล้ว)
- แจ้งเตือนพิเศษเมื่อเกินกำหนดจัดส่ง

**Nodes ที่ใช้:**
```
webhook_trigger (tracking event) → database_query (customer info)
→ switch (event type) → template_engine → send_notification
```

---

#### 40. วางแผนเส้นทางจัดส่งประจำวัน (Daily Delivery Route Planning)

**เป้าหมาย:** รวบรวม orders ที่ต้องจัดส่งวันนี้ คำนวณเส้นทางที่เหมาะสมที่สุด
**กิจการ/หน่วยงาน:** บริษัทขนส่ง ร้านดอกไม้ ร้านอาหาร delivery
**Input:**
- รายการ orders วันนี้ พร้อม address
- จุดออกรถ จำนวนรถ

**Output:**
- เส้นทางที่เหมาะสมแต่ละรถ ลำดับจัดส่ง
- ส่งให้คนขับรถ

**Nodes ที่ใช้:**
```
schedule_trigger (6:00 AM) → database_query (today deliveries)
→ http_request (routing API) → llm_call (optimize + format)
→ batch (by driver) → send_notification
```

---

### กลุ่ม K — Content Creator / Media

---

#### 41. สร้าง Social Media Content Calendar (Content Planning Automation)

**เป้าหมาย:** วางแผน content สำหรับ 1 เดือนข้างหน้า สร้าง caption และ visual brief อัตโนมัติ
**กิจการ/หน่วยงาน:** แบรนด์ Agency บล็อกเกอร์ SME
**Input:**
- Theme/campaign ของเดือน
- ช่องทาง (Facebook, Instagram, TikTok, X)
- Tone of voice และ Brand guideline

**Output:**
- Content calendar 30 วัน พร้อม hook, caption, hashtag
- Visual brief แต่ละ post
- Export เป็น spreadsheet / Notion

**Nodes ที่ใช้:**
```
form_input (theme + channels) → rag_query (brand guidelines)
→ prompt_template → llm_call → output_parser
→ parallel [send_email (calendar), http_request (Notion API)]
```

---

#### 42. สรุปและ Repurpose Podcast / YouTube (Content Repurposing)

**เป้าหมาย:** นำ transcript จาก podcast หรือ YouTube มาสร้างเป็น blog post, tweet thread, LinkedIn post
**กิจการ/หน่วยงาน:** Podcast creator YouTuber Content marketer
**Input:**
- Transcript หรือ URL ของคลิป (ดึง caption)
- Platform target และ tone

**Output:**
- Blog post ฉบับสมบูรณ์
- Tweet thread (10-15 tweets)
- LinkedIn post
- Email newsletter section

**Nodes ที่ใช้:**
```
form_input → http_request (get transcript) → split (segments)
→ parallel [
  llm_call (blog post),
  llm_call (tweet thread),
  llm_call (LinkedIn post)
] → join → approval_gate → http_request (publish to platforms)
```

---

#### 43. สร้างภาพประกอบบทความอัตโนมัติ (Auto Blog Image Generation)

**เป้าหมาย:** เมื่อเพิ่มบทความใหม่ ให้ AI สร้าง featured image และ inline images ที่เหมาะสม
**กิจการ/หน่วยงาน:** Blog website สื่อออนไลน์
**Input:**
- ชื่อและเนื้อหาบทความ
- Brand color / style preference

**Output:**
- ภาพ featured image ขนาดที่กำหนด
- 2-3 inline images ประกอบบทความ
- อัปโหลดเข้า CMS อัตโนมัติ

**Nodes ที่ใช้:**
```
event_trigger (new post) → llm_call (generate image prompts)
→ parallel [generate_image x3] → join
→ storage_action (upload) → http_request (update CMS) → send_notification
```

---

### กลุ่ม L — Restaurant / Food Service

---

#### 44. วิเคราะห์สินค้าคงคลังและสั่งซื้อวัตถุดิบ (Inventory Analysis & Auto-Order)

**เป้าหมาย:** ตรวจสอบ stock วัตถุดิบทุกเช้า แจ้งเตือนและสร้าง purchase order อัตโนมัติเมื่อต่ำกว่า reorder point
**กิจการ/หน่วยงาน:** ร้านอาหาร โรงแรม โรงงาน
**Input:**
- ปริมาณ stock ปัจจุบันจาก database
- Reorder point และ supplier contact

**Output:**
- Purchase order อีเมลถึง supplier
- แจ้งเตือน manager ที่ต้องอนุมัติ
- บันทึก PO ลง database

**Nodes ที่ใช้:**
```
schedule_trigger → database_query (inventory levels) → filter (below reorder point)
→ loop → template_engine → approval_gate (manager) → send_email (supplier)
→ database_query (create PO record)
```

---

#### 45. วิเคราะห์ menu performance รายสัปดาห์ (Menu Performance Analysis)

**เป้าหมาย:** วิเคราะห์ว่าเมนูไหนขายดี กำไรสูง และ recommend การปรับเมนู
**กิจการ/หน่วยงาน:** ร้านอาหาร cloud kitchen
**Input:**
- ยอดขายแต่ละเมนูรายสัปดาห์
- ต้นทุนวัตถุดิบแต่ละเมนู

**Output:**
- Matrix วิเคราะห์ Stars/Plowhorses/Puzzles/Dogs
- คำแนะนำ: เมนูที่ควร promote, ปรับราคา, หรือเอาออก
- ส่ง report ให้ manager / เจ้าของ

**Nodes ที่ใช้:**
```
schedule_trigger (Monday) → database_query → code_runner (menu engineering matrix)
→ llm_call (analysis + recommendations) → template_engine → send_email
```

---

### กลุ่ม M — Legal / Compliance

---

#### 46. ตรวจสอบและสรุปสัญญา (Contract Review & Summary)

**เป้าหมาย:** อัปโหลดสัญญา ให้ AI สรุปประเด็นสำคัญ ความเสี่ยง และ clause ที่ต้องระวัง
**กิจการ/หน่วยงาน:** ทีม Legal บริษัทจัดซื้อ ผู้ประกอบการ
**Input:**
- ไฟล์สัญญา (PDF)
- เกณฑ์การตรวจสอบ (ระยะเวลา การรับประกัน ค่าปรับ)

**Output:**
- สรุปสัญญา 1 หน้า
- Flag clause ที่มีความเสี่ยงหรือผิดปกติ
- ส่ง report ให้ lawyer หรือ decision maker

**Nodes ที่ใช้:**
```
file_upload_trigger → read_file → split (sections) → batch
→ llm_call (review each section) → merge_data → llm_call (overall summary + risk)
→ approval_gate (lawyer review) → send_email
```

---

#### 47. ติดตามใบอนุญาตและวันหมดอายุ (License & Permit Expiry Tracking)

**เป้าหมาย:** ติดตามวันหมดอายุของใบอนุญาต ใบรับรอง ใบประกัน แจ้งเตือนล่วงหน้า 90/30/7 วัน
**กิจการ/หน่วยงาน:** บริษัทที่มี license หลายประเภท (food safety, ISO, สัมปทาน)
**Input:**
- ฐานข้อมูล licenses พร้อมวันหมดอายุ ผู้รับผิดชอบ

**Output:**
- แจ้งเตือน ผู้รับผิดชอบ + ผู้บริหาร
- รายงานภาพรวม compliance status

**Nodes ที่ใช้:**
```
schedule_trigger → database_query (expiring licenses) → filter
→ loop → switch (90/30/7 days) → send_notification + send_email
```

---

### กลุ่ม N — Customer Service

---

#### 48. ระบบ Triage คำถาม Support อัตโนมัติ (Support Ticket Triage)

**เป้าหมาย:** เมื่อลูกค้าส่ง support ticket ให้ AI จัดหมวดหมู่ ประเมิน priority และส่งต่อทีมที่เหมาะสม
**กิจการ/หน่วยงาน:** SaaS บริษัทเทคโนโลยี ธุรกิจ e-commerce
**Input:**
- เนื้อหา ticket (subject + body)
- ข้อมูลลูกค้า (plan, usage, history)

**Output:**
- หมวดหมู่ปัญหา + priority (P1-P4)
- ตอบ auto-reply พร้อม KB article ที่เกี่ยวข้อง
- Assign ให้ agent ที่ถูกต้อง

**Nodes ที่ใช้:**
```
webhook_trigger (helpdesk webhook) → rag_query (knowledge base)
→ llm_call (classify + priority + draft reply) → output_parser
→ parallel [
  http_request (assign ticket in Zendesk/Freshdesk),
  send_email (auto-reply to customer)
]
```

---

#### 49. วิเคราะห์ Customer Satisfaction และแจ้งเตือน Churn Risk (Churn Risk Detection)

**เป้าหมาย:** วิเคราะห์ pattern การใช้งาน ผลสำรวจ NPS เพื่อระบุลูกค้าที่มีความเสี่ยงจะยกเลิก
**กิจการ/หน่วยงาน:** SaaS subscription business
**Input:**
- ข้อมูลการใช้งาน 30/60/90 วันที่ผ่านมา
- NPS score / support ticket frequency
- Payment history

**Output:**
- Churn risk score แต่ละลูกค้า
- แจ้ง Customer Success team ให้ proactively reach out
- แนะนำ action สำหรับแต่ละลูกค้า

**Nodes ที่ใช้:**
```
schedule_trigger (weekly) → database_query (usage + NPS + payment)
→ llm_call (churn prediction + reasoning) → output_parser
→ filter (high risk) → loop → send_notification (CS team with context)
```

---

#### 50. Auto-Response FAQ สำหรับ Line Official Account (FAQ Auto-Responder)

**เป้าหมาย:** เมื่อลูกค้าส่งข้อความ Line เข้ามา ให้ AI ตอบคำถาม FAQ ทันที
**กิจการ/หน่วยงาน:** ธุรกิจ SME ที่ใช้ Line OA
**Input:**
- Webhook จาก Line Messaging API
- Knowledge base ของธุรกิจ (สินค้า บริการ ราคา เวลาทำการ)

**Output:**
- ตอบกลับทันทีด้วย AI
- ถ้าตอบไม่ได้: escalate ให้ human agent
- บันทึก conversation log

**Nodes ที่ใช้:**
```
webhook_trigger (Line) → rag_query (FAQ knowledge base)
→ llm_call → output_parser (confidence check)
→ conditional (high confidence) → [webhook_response / send_notification (human agent)]
→ database_query (log conversation)
```

---

### กลุ่ม O — Use Cases เพิ่มเติม (ต้องการ Node ใหม่บางส่วน)

---

#### 51. สร้างวิดีโอสรุปข่าวรายวัน (Daily News Video Generation)

**เป้าหมาย:** สร้างคลิปสรุปข่าวประจำวัน 60 วินาที สำหรับ social media
**กิจการ/หน่วยงาน:** สื่อ YouTuber
**Input:**
- ข่าวสำคัญของวัน 5-7 ข้อ

**Output:**
- Script คำบรรยาย
- ภาพประกอบแต่ละข่าว
- Video ที่ render เสร็จแล้ว (ต้องการ video generation node)

**Nodes ที่ใช้:**
```
schedule_trigger → http_request (news API) → llm_call (script)
→ parallel [generate_image (thumbnail), skill (video_generation)]
→ join → storage_action → send_notification
```

> **หมายเหตุ:** ต้องการ Node ใหม่: `generate_video` หรือใช้ `skill` node กับ video generation skill

---

#### 52. แปลงเอกสาร PDF เป็นฐานความรู้ (PDF to Knowledge Base)

**เป้าหมาย:** อัปโหลด manual / เอกสาร policy ให้ระบบอ่านและ index เข้า RAG
**กิจการ/หน่วยงาน:** บริษัทที่มีเอกสาร policy จำนวนมาก
**Input:**
- ไฟล์ PDF หลายไฟล์
- Collection name สำหรับ vector database

**Output:**
- เอกสาร indexed ใน RAG collection
- สรุปสาระสำคัญแต่ละเอกสาร

**Nodes ที่ใช้:**
```
file_upload_trigger → read_file → split (chunks) → batch
→ loop → http_request (embedding API) → storage_action (save to vector DB)
→ send_notification
```

> **หมายเหตุ:** อาจต้องการ `vector_store` node สำหรับ indexing โดยเฉพาะ

---

#### 53. สร้าง Personalized Learning Path (AI Tutor Workflow)

**เป้าหมาย:** วิเคราะห์ระดับความรู้และ learning style แล้วสร้าง learning path เฉพาะบุคคล
**กิจการ/หน่วยงาน:** EdTech แพลตฟอร์ม สถาบันฝึกอบรม
**Input:**
- ผลแบบทดสอบวัดระดับ
- เป้าหมายการเรียน เวลาที่มี
- Learning style preference

**Output:**
- Curriculum ส่วนตัว 4-12 สัปดาห์
- Recommended resources และ exercises
- Check-in reminders รายสัปดาห์

**Nodes ที่ใช้:**
```
form_input → rag_query (curriculum library) → llm_call (personalize path)
→ output_parser → database_query (save plan) → loop (weekly reminders)
→ schedule_trigger → send_notification
```

---

#### 54. วิเคราะห์ความเสี่ยงซัพพลายเชน (Supply Chain Risk Monitoring)

**เป้าหมาย:** ติดตามข่าวและ signal ความเสี่ยงที่อาจกระทบซัพพลายเออร์หลัก
**กิจการ/หน่วยงาน:** โรงงานผลิต บริษัท import/export
**Input:**
- รายชื่อซัพพลายเออร์หลักและประเทศต้นทาง
- News feed และ trade data API

**Output:**
- รายงานความเสี่ยงรายสัปดาห์
- แจ้งเตือนทันทีเมื่อพบ risk level สูง (ภัยธรรมชาติ นโยบายการค้า)

**Nodes ที่ใช้:**
```
schedule_trigger → parallel [http_request (news APIs), http_request (trade API)]
→ join → llm_call (risk analysis) → output_parser (risk score per supplier)
→ filter (high risk) → send_notification
```

---

#### 55. ระบบ Onboarding ลูกค้าใหม่ (Customer Onboarding Sequence)

**เป้าหมาย:** เมื่อลูกค้าใหม่สมัคร ส่ง sequence อีเมลแนะนำผลิตภัณฑ์ระยะ 14 วัน
**กิจการ/หน่วยงาน:** SaaS App subscription service
**Input:**
- ข้อมูลลูกค้าใหม่ (ชื่อ อีเมล plan ที่เลือก)

**Output:**
- Day 0: Welcome email + setup guide
- Day 3: Feature highlight #1
- Day 7: Success story + tips
- Day 14: Check-in + offer upgrade

**Nodes ที่ใช้:**
```
event_trigger (new signup) → database_query (customer details)
→ send_email (day 0) → wait (3 days) → send_email (day 3)
→ wait (4 days) → send_email (day 7)
→ wait (7 days) → database_query (check usage)
→ conditional (engaged) → send_email (upgrade) / send_email (re-engage)
```

---

#### 56. แจ้งเตือน SLA Breach (Service Level Agreement Monitor)

**เป้าหมาย:** ตรวจสอบ support tickets ที่ใกล้หรือเกิน SLA deadline แจ้งเตือนทีมก่อนเวลา
**กิจการ/หน่วยงาน:** บริษัท IT Services Managed Service Provider
**Input:**
- รายการ open tickets พร้อม priority และ SLA deadline
- ข้อมูล agent ที่รับผิดชอบ

**Output:**
- แจ้งเตือน agent เมื่อเหลือ 25% ของ SLA time
- Escalate ให้ manager เมื่อเกิน SLA
- รายงาน SLA compliance รายสัปดาห์

**Nodes ที่ใช้:**
```
schedule_trigger (every 30 min) → database_query (open tickets)
→ code_runner (calc SLA remaining %) → filter → loop
→ switch (<25% / breached) → send_notification (agent / manager)
```

---

#### 57. Auto-Translate และ Publish เนื้อหาหลายภาษา (Multi-language Content Publishing)

**เป้าหมาย:** เมื่อสร้างบทความภาษาหนึ่ง ให้แปลและ publish ไปยังเว็บไซต์ภาษาอื่น ๆ อัตโนมัติ
**กิจการ/หน่วยงาน:** สื่อ บริษัท global, platform หลายภาษา
**Input:**
- บทความต้นฉบับ (ภาษาไทยหรืออังกฤษ)
- ภาษาปลายทาง (EN, TH, ZH, JP)

**Output:**
- บทความที่แปลแล้วแต่ละภาษา
- Publish ไปยัง CMS แต่ละภาษา
- ต้องผ่าน review ก่อน publish (optional)

**Nodes ที่ใช้:**
```
event_trigger (new article) → read_file / database_query
→ parallel [
  llm_call (translate EN),
  llm_call (translate ZH),
  llm_call (translate JP)
] → join → [approval_gate →] loop → http_request (CMS publish per language)
```

---

#### 58. ระบบตอบสนองเหตุฉุกเฉินองค์กร (Emergency Alert System)

**เป้าหมาย:** เมื่อมีเหตุฉุกเฉิน (ไฟไหม้, ระบบล่ม, ข้อมูลรั่ว) ส่ง alert หลายช่องทางพร้อมกัน
**กิจการ/หน่วยงาน:** บริษัทและองค์กรทุกขนาด
**Input:**
- ประเภทเหตุฉุกเฉิน
- ระดับ severity
- พื้นที่/ระบบที่ได้รับผลกระทบ

**Output:**
- แจ้งเตือน ALL channels พร้อมกัน (SMS, email, Slack, LINE)
- สร้าง incident record
- เรียก response team พร้อม runbook

**Nodes ที่ใช้:**
```
manual_trigger / event_trigger → form_input (incident details)
→ switch (severity) → parallel [
  send_notification (SMS all staff),
  send_email (management),
  http_request (Slack #emergency),
  database_query (create incident record)
] → wait → send_notification (status update)
```

---

#### 59. ระบบวิเคราะห์ Feedback แบบสำรวจ (Survey Analysis Automation)

**เป้าหมาย:** เมื่อปิดแบบสำรวจ ให้ AI วิเคราะห์ผล open-ended questions สรุป themes และ insights
**กิจการ/หน่วยงาน:** HR, Marketing, ผู้ให้บริการทุกประเภท
**Input:**
- ผลแบบสำรวจ (CSV export จาก Google Forms / Typeform)
- คำถามปลายเปิดที่ต้องการวิเคราะห์

**Output:**
- Theme clustering ของคำตอบ
- Sentiment breakdown (positive/neutral/negative)
- Executive summary พร้อม top 5 insights
- ส่ง report ให้ stakeholders

**Nodes ที่ใช้:**
```
file_upload_trigger → csv_parser → filter (open-ended columns)
→ batch (100 responses/batch) → loop → llm_call (theme extraction)
→ merge_data (all batches) → llm_call (final synthesis)
→ template_engine → send_email
```

---

#### 60. ระบบ Auto-Renewal และแจ้งเตือนสมาชิก (Subscription Renewal Workflow)

**เป้าหมาย:** จัดการ renewal lifecycle สมาชิก/subscription: แจ้งเตือน → ต่ออายุ → ยืนยัน → ส่ง invoice
**กิจการ/หน่วยงาน:** SaaS, Membership club, Magazine, Gym
**Input:**
- รายการสมาชิกที่ใกล้หมดอายุ (30/14/7/1 วัน)
- Pricing plan และ payment method

**Output:**
- อีเมลแจ้งเตือนตาม escalation
- Process payment อัตโนมัติ (ถ้า auto-renew)
- ส่ง invoice และ confirmation
- ยกเลิก access เมื่อไม่ต่ออายุ

**Nodes ที่ใช้:**
```
schedule_trigger → database_query (expiring subscriptions) → loop
→ switch (days remaining) → conditional (auto-renew enabled)
→ [http_request (payment gateway) → conditional (payment success)]
→ [send_email (invoice) / send_email (renewal reminder)]
→ database_query (update status)
```

---

## สรุป Node ที่ใช้บ่อยที่สุด

| Node | จำนวน Use Cases | บทบาทหลัก |
|---|---|---|
| `send_email` | 45+ | แจ้งผล ส่งรายงาน confirmation |
| `send_notification` | 50+ | Push alert แจ้งเตือน real-time |
| `database_query` | 55+ | ดึงข้อมูล / บันทึกผล |
| `llm_call` | 45+ | วิเคราะห์ สรุป สร้าง content |
| `schedule_trigger` | 40+ | automation รายวัน/สัปดาห์/เดือน |
| `conditional` | 40+ | routing ตาม business logic |
| `loop` | 35+ | process per item |
| `template_engine` | 30+ | สร้างเนื้อหา format |
| `http_request` | 25+ | เชื่อมต่อ API ภายนอก |
| `filter` | 25+ | คัดเลือกข้อมูล |
| `approval_gate` | 15+ | human-in-the-loop |
| `parallel` | 15+ | ทำงานหลายอย่างพร้อมกัน |

---

## Node ใหม่ที่แนะนำให้เพิ่ม

| Node Type | Description | Use Cases |
|---|---|---|
| `generate_video` | สร้างวิดีโอจาก prompt หรือ assets | UC-51, Social media automation |
| `ocr_reader` | อ่านข้อความจากภาพ/เอกสาร scan | ใบเสร็จ, เอกสาร scan, บัตรประชาชน |
| `vector_store` | Index และ query vector database โดยตรง | Knowledge base building (UC-52) |
| `pdf_generator` | สร้าง PDF จาก template | รายงาน, ใบเสร็จ, certificate |
| `calendar_integration` | อ่าน/เขียน Google Calendar / Outlook | การจัดตาราง, แจ้งเตือนนัด |
| `sms_sender` | ส่ง SMS ผ่าน provider (DTAC, True, Twilio) | OTP, แจ้งเตือน, marketing |
| `speech_to_text` | แปลงเสียงเป็นข้อความ | Meeting transcription, call center |
| `data_aggregator` | รวมข้อมูลจากหลาย sources ตาม time window | Analytics, reporting |

---

## Changelog

| Version | Date | Author | Notes |
|---|---|---|---|
| 1.0.0 | 2026-02-19 | System | Initial spec — 60 use cases, 57 nodes inventory |
