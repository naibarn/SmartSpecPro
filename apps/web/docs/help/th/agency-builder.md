---
slug: agency-builder
title: ตัวสร้าง Agency
description: ออกแบบทีม AI หลายตัวด้วยตัวสร้างภาพ
icon: Boxes
section: advanced
order: 75
pages: ["/agencies", "/agencies/templates"]
tags: [agency, builder, visual editor, nodes, agents, custom, design, template]
---

# ตัวสร้าง Agency

## Agency Builder คืออะไร?

Agency Builder คือตัวแก้ไขภาพแบบ Drag-and-drop สำหรับออกแบบทีม AI หลายตัวแบบกำหนดเอง แทนที่จะใช้ Template Agency สำเร็จรูป คุณสามารถประกอบทีมของตัวเองจากศูนย์ โดยวาง Node บน Canvas เชื่อมต่อกัน และตั้งค่าบทบาท Model และ Tools ของแต่ละ Agent

ใช้ Agency Builder เมื่อ Template Agency ที่มีในตัวไม่ตรงกับ Workflow ของคุณ หรือเมื่อคุณต้องการควบคุมอย่างละเอียดว่า Agent จะโต้ตอบกันอย่างไร

## ประเภท Node

| Node | บทบาท |
|---|---|
| **Agent** | LLM Agent หลักที่มีบทบาทเฉพาะและคำสั่ง System พื้นฐานของ Agency |
| **Supervisor** | จัดการ Agent อื่นๆ ตัดสินใจว่า Agent ไหนจัดการงานย่อย และสังเคราะห์ Output |
| **Router** | กำหนดเส้นทาง Request ขาเข้าไปยัง Agent ปลายทางตามตรรกะเงื่อนไข |
| **Aggregator** | รวบรวม Output จาก Agent หลายตัวและรวมเป็นผลลัพธ์เดียว |
| **Knowledge Base** | ให้เอกสารอ้างอิง FAQ หรือความรู้เฉพาะโดเมนแก่ Agent ที่เชื่อมต่อ |
| **Skill Call** | รัน Skill เฉพาะของ SmartAI Hub (สร้างภาพ ค้นคว้า ฯลฯ) เป็นขั้นตอนใน Workflow |
| **Human Approval** | หยุด Workflow และรอผู้ตรวจสอบอนุมัติหรือปฏิเสธก่อนดำเนินต่อ |

## การสร้าง Agency

1. ไปที่ **Agencies** แล้วคลิก **New Agency** (หรือเปิด Agency ที่มีอยู่เพื่อแก้ไข)
2. เลือก **Start from template** หรือ **Blank canvas**
3. ลาก Node จาก Palette ทางซ้ายไปวางบน Canvas
4. เชื่อม Node โดยคลิก Port ขาออกและลากไปยัง Port ขาเข้า เพื่อกำหนดการไหลของข้อมูล
5. คลิก Node ใดก็ได้เพื่อเปิดแผงตั้งค่า:
   - **Agent / Supervisor** — กำหนดชื่อบทบาท คำสั่ง System, Model และ Temperature
   - **Router** — กำหนดเงื่อนไขการกำหนดเส้นทาง
   - **Knowledge Base** — อัปโหลดหรือลิงก์เอกสารอ้างอิง
   - **Skill Call** — เลือก Skill และแมป Input
   - **Human Approval** — กำหนดคำสั่งการอนุมัติและ Timeout
6. กำหนด **Entry point** — Node แรกที่ Agency จะเรียก (ต้องเป็น Agent หรือ Supervisor)
7. คลิก **Save** เมื่อเสร็จสิ้น

## Tools

แต่ละ Agent Node สามารถติดตั้ง Tools เพื่อขยายความสามารถ:

- **Web Search** — ค้นหาข้อมูลปัจจุบันบนอินเทอร์เน็ต
- **Browser** — นำทางและดึงเนื้อหาจากหน้าเว็บ
- **Calculator** — คำนวณทางคณิตศาสตร์และแปลงหน่วย
- **Code Interpreter** — รัน Python Snippet
- **File Reader** — อ่านเอกสารที่อัปโหลด
- **API Caller** — ทำ HTTP Request ไปยังบริการภายนอก

คลิก Node เปิดแท็บ **Tools** แล้ว Toggle Tools ที่ต้องการให้ Agent นั้นเข้าถึงได้ บาง Tool มีการตั้งค่าเพิ่มเติม (เช่น API Caller ต้องการ Endpoint และรายละเอียดการยืนยันตัวตน)

## AI Creator

หากไม่แน่ใจวิธีจัดโครงสร้าง Agency ใช้ **AI Creator**:

1. คลิก **AI Creator** บนแถบเครื่องมือ Canvas
2. อธิบายสิ่งที่ต้องการให้ Agency ทำในภาษาธรรมดา
3. AI จะออกแบบ Layout Node ที่แนะนำให้คุณ
4. ตรวจสอบ Design ที่แนะนำแล้วคลิก **Apply** เพื่อวางบน Canvas
5. ปรับแต่ง Design ตามต้องการก่อนบันทึก

## Template

มี Template สำเร็จรูปสี่แบบเป็นจุดเริ่มต้น:

| Template | วัตถุประสงค์ |
|---|---|
| **Deep Research** | Pipeline นักวิจัย → นักวิเคราะห์ → นักเขียน จากหลายแหล่ง |
| **Storyboard** | วางแผน Scene → สร้าง Prompt ภาพ → ประกอบ Storyboard |
| **Deck Builder** | วางแผน Outline → เขียน Slide → จัดรูปแบบ Deck |
| **Comparison** | นักวิจัยขนาน → Aggregator → นักเขียนคำแนะนำ |

เปิด **Agencies → Templates** เพื่อเรียกดูและปรับแต่ง Template เหล่านี้

## การจัดการเวอร์ชัน

Agency Builder บันทึกเวอร์ชันโดยอัตโนมัติทุกครั้งที่คุณคลิก **Save** เพื่อจัดการเวอร์ชัน:

- คลิกปุ่ม **Versions** ในแถบเครื่องมือเพื่อดูประวัติ
- คลิกเวอร์ชันใดก็ได้เพื่อดูตัวอย่าง
- คลิก **Restore** เพื่อกลับไปใช้เวอร์ชันนั้น

## Keyboard Shortcuts

| ปุ่มลัด | การทำงาน |
|---|---|
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `Delete` / `Backspace` | ลบ Node หรือ Edge ที่เลือก |
| `Ctrl+A` / `Cmd+A` | เลือก Node ทั้งหมด |
| `Escape` | ยกเลิกการเลือก / ปิดแผง |

## เคล็ดลับ

- **เริ่มจาก Template** — Template มีโครงสร้างที่ผ่านการพิสูจน์แล้วซึ่งคุณแก้ไขได้แทนการออกแบบจากศูนย์
- **ให้ทีมมีขนาดเล็ก** — Agency ที่มี Agent 3–5 ตัว Debug ง่ายกว่าและให้ผลลัพธ์ที่เฉพาะเจาะจงกว่าทีมใหญ่
- **กำหนดคำสั่งที่ชัดเจน** — แต่ละ Agent Node ควรมี System Prompt ที่เน้นบทบาทเฉพาะโดยไม่ซ้อนทับกัน
- **ใช้ Human Approval สำหรับการตัดสินใจสำคัญ** — แทรก Human Approval Node ก่อนขั้นตอนที่เผยแพร่เนื้อหาหรือทำการเปลี่ยนแปลงที่ย้อนกลับไม่ได้
- **ทดสอบด้วย Request ง่ายๆ ก่อน** — รัน Agency ด้วย Request สั้นๆ เฉพาะเจาะจงเพื่อตรวจสอบว่า Routing ทำงานก่อนใช้งานจริง
