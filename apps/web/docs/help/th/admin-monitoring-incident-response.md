---
slug: admin-monitoring-incident-response
title: คู่มือรับมือ Incident จากหน้า Monitoring
description: อ่าน alert ให้เข้าใจเร็ว ตรวจให้ถูกจุด และปิด incident ด้วยหลักฐานที่ชัดเจน
icon: ShieldAlert
section: admin
order: 86
pages: ["/admin/monitoring", "/admin/dashboard"]
tags: [admin, monitoring, incident, alerts, triage, faq]
---

# คู่มือรับมือ Incident จากหน้า Monitoring

ใช้คู่มือนี้เมื่อมี alert เปิดมาจาก popup กลาง, Command Center หรือหน้า Server Monitoring

## 1. อ่าน incident summary ก่อน

ก่อนจะไล่กดหลายแท็บ ให้ตอบคำถามเหล่านี้จาก summary card ก่อน:

- เกิดอะไรขึ้น
- ทำไมต้องรีบตรวจ
- ควรตรวจอะไรต่อทันที
- ตอนนี้มี owner หรือยัง
- มีการส่ง notification และ acknowledge แล้วหรือยัง

ถ้ายังตอบไม่ได้ อย่ารีบ resolve ให้บันทึก note ก่อน

## 2. วิธี triage ตามประเภทสัญญาณ

### Monitoring stale

หมายถึงข้อมูล monitoring ใหม่ไม่เข้าตามรอบ

ตรวจ:

- `Last check`
- แท็บ `Checks`
- ปุ่ม `Force Fresh Check`

ทำดังนี้:

1. ดูว่า check ล่าสุดหยุดตั้งแต่เมื่อไร
2. กด `Force Fresh Check`
3. ถ้ายังไม่มีแถวใหม่ ให้ไล่ collector, scheduler หรือ backend ที่เขียน monitoring rows

ค่อย resolve หลังจากเห็นข้อมูลใหม่กลับมาจริง

### Critical alert backlog

หมายถึงมี alert ระดับสูงเปิดค้าง แต่ ownership หรือ acknowledgement ยังไม่ชัด

ตรวจ:

- `Open Alerts`
- `Current owner`
- `Latest operator update`

ทำดังนี้:

1. แยก alert ซ้ำออกจาก failure แรกที่น่าจะเป็นต้นเหตุ
2. กำหนด owner
3. ใส่ action note ว่ากำลังตรวจอะไรอยู่

อย่า acknowledge ทุกอันเพียงเพื่อให้กล่องแจ้งเตือนโล่ง

### ปัญหาระดับ service runtime

มักแปลว่า service ใด service หนึ่ง degraded, unhealthy หรือ restart บ่อยผิดปกติ

ตรวจ:

- service cards
- หลักฐานจาก alert
- สุขภาพของ dependency ที่เกี่ยวข้อง

ทำดังนี้:

1. แยกให้ได้ว่าเสียเฉพาะ service เดียว หรือมี dependency ใต้ระบบเป็นต้นเหตุ
2. ถ้ามี restart ให้บันทึกว่าทำกับ service ไหน
3. รอดูว่า alert ซ้ำหยุดจริงก่อน resolve

### Resource pressure

หมายถึง CPU, memory, disk หรือ restart pressure กำลังสูงขึ้น

ตรวจ:

- `Metrics`
- รูปแบบการ restart
- queue pressure

ทำดังนี้:

1. แยกให้ได้ว่าตึงเฉพาะ process เดียวหรือทั้งเครื่อง
2. เลือกวิธีบรรเทา เช่น restart, scale, drain หรือชะลอโหลด
3. เฝ้าดูว่ากราฟลงจริง ไม่ใช่เด้งลงชั่วคราว

### Audit หรือ provider health issue

หมายถึงคุณภาพ, latency หรือ error rate กำลังแย่ลง แม้ service จะยังตอบอยู่

ตรวจ:

- error spike
- latency spike
- provider หรือ model ที่เกี่ยวข้อง

ทำดังนี้:

1. ยืนยันว่า provider, model หรือ endpoint ไหนเป็นตัวหลัก
2. เทียบกับช่วงที่ระบบยังนิ่งก่อนหน้า
3. ค่อย fail over เมื่อเห็นว่าความเสื่อมต่อเนื่องและมีผลกับผู้ใช้จริง

### Orchestration issue

มักหมายถึง fallback, classification drift, queue lag หรือ worker behavior เริ่มผิดรูป

ตรวจ:

- queue health
- orchestration alerts
- พฤติกรรมของ worker

ทำดังนี้:

1. แยกให้ได้ว่าปัญหาอยู่ที่ classification, fallback, worker หรือ dependency ภายนอก
2. ถ้ามี manual retry หรือ reroute ให้บันทึกใน operator log
3. resolve เมื่อเส้นทางอัตโนมัติหลักกลับมานิ่งจริง

## 3. Acknowledge ที่ดีควรบอกอะไร

การ acknowledge ที่ดีควรตอบให้ได้ว่า:

- ใครเป็น owner ตอนนี้
- ตรวจอะไรไปแล้ว
- ขั้นตอนถัดไปคืออะไร

ถ้ายังไม่มีสามอย่างนี้ แปลว่า incident ยังไม่ได้ถูกควบคุมจริง

## 4. เมื่อไรจึงควร Mark Resolved

ควร resolve เมื่อ:

- สัญญาณเดิมหยุดยิงซ้ำ
- มีหลักฐานใหม่ยืนยันว่าหายจริง
- operator log อธิบายชัดว่าแก้อะไรไป

ถ้าปัญหากลับมาเร็ว ให้ reopen และใส่ reopen reason

## 5. Workflow ที่แนะนำ

1. อ่าน incident summary
2. เปิด alert inbox ของ incident
3. กำหนด owner
4. ใส่ action note
5. เปิด checks, alerts หรือ metrics ตามประเภท incident
6. ยืนยันการฟื้นตัวด้วยข้อมูลใหม่
7. resolve พร้อม resolution note ที่ชัดเจน

## FAQ

### ทำไมมี alert ทั้งที่ยังดูไม่เหมือนระบบล่ม

เพราะระบบถูกออกแบบให้เตือนตั้งแต่เริ่มเห็นความเสี่ยง ไม่ใช่รอให้ล่มก่อน

### ถ้าขึ้น `Stale` หมายถึงอะไร

หมายถึงมีข้อมูลเก่าอยู่ แต่ไม่สดแล้ว ควรกด `Force Fresh Check` ก่อนเชื่อถือข้อมูลนั้น

### ถ้าขึ้น `Unknown` หมายถึงอะไร

หมายถึงข้อมูลล่าสุดยังไม่พอให้จัดประเภทสถานะ service ได้ชัดเจน ต้องดู fresh check และ grouped alerts เพิ่ม

### ถ้า manual retry ผ่านครั้งเดียว ปิด incident ได้ไหม

ยังไม่ควร ต้องรอให้ flow ปกติกลับมานิ่งและ alert หยุดยิงซ้ำก่อน
