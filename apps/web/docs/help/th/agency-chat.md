---
slug: agency-chat
title: Agency Chat — รันและทดสอบ Agency
description: วิธีรัน agency ดูผลลัพธ์ และใช้ตัวเลือกการรัน
icon: MessageSquare
section: advanced
order: 72
pages: ["/agencies", "/chat"]
tags:
  - "agency"
  - "chat"
  - "test"
  - "run"
  - "streaming"
  - "preview"
  - "model"
  - "target agent"
  - "instructions"
  - "cancel"
  - "retry"
  - "tool calls"
  - "guardrails"
  - "approval"
  - "browser session"
  - "help"
  - "help/th"
  - "help/teams"
  - "teams"
  - "agency-chat"
aliases:
  - "agency-chat"
  - "Agency Chat — รันและทดสอบ Agency"
  - "Agency Chat — รันและทดสอบ Agency help"
---

# Agency Chat

## ภาพรวม

Agency Chat คือระบบรัน agency และดูผลลัพธ์แบบ real-time พิมพ์คำขอ แล้ว agent ทั้งหมดจะทำงานร่วมกันอัตโนมัติ — ดูข้อความของแต่ละ agent ไหลเข้ามา เห็น tool call ขณะทำงาน และรับ Preview Card เมื่องานเสร็จ

มี **2 วิธี** ในการรัน agency:

| วิธี | ที่ไหน | ทำงานอย่างไร |
|---|---|---|
| **หน้า Agency Chat เต็มจอ** | หน้า `/agencies/:id` | interface เต็มจอพร้อม Activity Panel |
| **Inline จากหน้า AI Chat** | หน้า `/chat` ปกติ | รัน agency โดยไม่ต้องออกจากหน้าสนทนา |

## รันจากหน้า Agency Chat เต็มจอ

1. ไปที่ **Agencies** จากเมนูด้านข้าง
2. คลิก agency ที่ต้องการ
3. จะเข้าสู่หน้า Agency Chat ของ agency นั้น (URL: `/agencies/:id`)
4. พิมพ์ข้อความกด Enter — agency รันทันที

## รันจากหน้า AI Chat (Inline)

สามารถรัน agency ได้จากหน้า AI Chat ปกติโดยไม่ต้อง navigate ไปหน้าอื่น มี 3 วิธี:

### วิธีที่ 1: ปุ่ม Run Agency

คลิกปุ่ม **Run Agency** ใน header bar ของ Chat จะเปิด picker dialog พร้อมรายการ agency ที่ค้นหาได้ เลือก agency แล้วพิมพ์ข้อความ กด Enter — agency รัน inline ใต้ chat

### วิธีที่ 2: Slash Command `/run-agency`

พิมพ์ `/run-agency` ในช่องแชท จะแสดงใน autocomplete list เลือกเพื่อเปิด agency picker

### วิธีที่ 3: ตรวจจับอัตโนมัติ

เมื่อส่งข้อความในแชทที่ตรงกับ trigger phrases ของ agency (สร้างอัตโนมัติจากชื่อ, คำอธิบาย และชื่อ agent ของ agency) จะแสดง **suggestion card**:

- แสดงชื่อ agency ที่ตรวจพบ
- ปุ่ม **Use Agency** — ตั้ง agency เป็นเป้าหมายเพื่อรัน inline
- ปุ่ม **Dismiss** — ปิด suggestion

### ประสบการณ์ Inline Run

หลังเลือก agency (ด้วยวิธีใดก็ได้) จะแสดง **panel สีม่วง** ใต้พื้นที่แชท:

1. Panel แสดงชื่อ agency พร้อมปุ่มปิด
2. พิมพ์ข้อความในช่อง input
3. กด **Enter** หรือคลิก **Send** — agency รันทันที
4. ผลลัพธ์ stream inline: เห็น agent ตอบ, สลับ agent, tool calls, guardrail events ทั้งหมดในหน้า Chat
5. เสร็จแล้วปิด panel ด้วยปุ่ม **X** หรือเลือก agency ใหม่

## ส่วนประกอบหน้าจอ

| ส่วน | ตำแหน่ง | หน้าที่ |
|---|---|---|
| **Header bar** | ด้านบน | ชื่อ agency, จำนวน agent, agent ที่กำลังทำงาน, ปุ่มต่าง ๆ |
| **พื้นที่สนทนา** | ตรงกลาง | ข้อความ, tool calls, preview, สถานะ |
| **Input bar** | ด้านล่าง | ช่องพิมพ์, ตัวเลือกการรัน, ปุ่มส่ง |

บนหน้าจอกว้าง (≥ 1024 px) จะมี **Activity Panel** ด้านขวาแสดง timeline กิจกรรมของ agent

## ส่งข้อความอะไร — ข้อความของคุณคือ "งาน" ที่มอบให้ Agency

ข้อความที่คุณพิมพ์คือ **งาน (task)** ที่คุณมอบให้ agency เป็น input เดียวที่ขับเคลื่อนการทำงานทั้งหมด — agent ตัวแรก (entry point) จะอ่านข้อความของคุณ ตีความสิ่งที่คุณต้องการ และประสานงานกับ agent ตัวอื่นเพื่อผลิตผลลัพธ์

พูดง่าย ๆ คือ ข้อความของคุณตอบคำถาม **"ต้องการให้ทีมนี้ผลิตอะไร?"**

### ถ้าเคยใช้ ChatGPT Custom GPT — หลักการเหมือนกัน

แต่ละ agent ใน agency ทำงานเหมือน Custom GPT ตัวหนึ่ง:

| | ChatGPT Custom GPT | SmartSpecPro Agency Agent |
|---|---|---|
| **System prompt** | "Instructions" ใน GPT Builder | ช่อง **Instructions** บน Agent node |
| **User message** | ข้อความที่พิมพ์ในแชท | ข้อความที่พิมพ์ใน Agency Chat |
| **Tools** | Actions, Code Interpreter, DALL-E | Web Search, Code Interpreter, API Caller ฯลฯ |
| **Knowledge files** | ไฟล์ที่อัปโหลดใน GPT Builder | Knowledge Base node |

ความแตกต่างเดียวคือ agency มี **หลาย agent ทำงานร่วมกัน** — เหมือน Custom GPT หลายตัวส่งต่องานกันเป็นลูกโซ่ entry-point agent คือ "GPT ตัวแรก" ที่รับข้อความจากคุณ แล้วมอบหมายงานย่อยให้ agent อื่นตาม Instructions ของมัน

### ข้อความไหลผ่าน agency อย่างไร

ข้อความของคุณกลายเป็น **User Input** ที่ agency ประมวลผล ไม่มีช่อง input แยกบน node ใน Builder — ข้อความแชทนี่แหละ **คือ** input

นี่คือสิ่งที่เกิดขึ้นทีละขั้น:

1. ข้อความถูกส่งไปยัง **entry-point agent** — node ที่มีป้ายสีเขียว **entry** ใน Builder นี่คือ node เดียวที่ได้รับข้อความจากคุณโดยตรง
2. Agent ตัวนั้นอ่านข้อความของคุณ **เป็น user message** ใน LLM conversation ส่วน **Instructions** (ที่ตั้งค่าใน Builder) กลายเป็น system prompt ดังนั้น LLM เห็น: system prompt = Instructions, user message = ข้อความแชทของคุณ
3. Entry-point agent ตัดสินใจว่าจะทำอะไรตาม Instructions ของมัน เช่น ถ้า Instructions บอกว่า *"รับหัวข้อจากผู้ใช้แล้วมอบงานวิจัยคีย์เวิร์ดให้ Researcher"* มันจะอ่านหัวข้อจากข้อความแชทแล้วมอบหมายงานต่อ
4. เมื่อ entry-point agent มอบหมายงานให้ agent ถัดไป agent เหล่านั้นจะได้รับ **ข้อความต้นฉบับของคุณ + ผลลัพธ์จาก agent ก่อนหน้า** เป็นบริบทรวม
5. หาก agency มี **Knowledge Base** node เอกสารที่เกี่ยวข้องจะถูกค้นหาและแนบไปพร้อมกับข้อความของคุณอัตโนมัติ

**ตัวอย่างจริง — agency "SEO Content Team":**

```
ข้อความของคุณ: "เขียนบทความ SEO เรื่องเทรนด์ cloud kitchen ในกรุงเทพ"
                │
                ▼
   ┌─────────────────────────┐
   │  SEO Manager (entry)    │  ← ได้รับข้อความเป็น User Input
   │                         │  ← Instructions: "รับหัวข้อจากผู้ใช้
   │                         │     มอบงานวิจัยคีย์เวิร์ดให้ Researcher
   │                         │     แล้วมอบงานเขียนให้ Writer"
   └──────┬────────┬─────────┘
          │        │
          ▼        ▼
   ┌────────────┐ ┌──────────────┐
   │ Keyword    │ │ SEO Writer   │  ← ได้รับข้อความต้นฉบับ
   │ Researcher │ │              │     + ผลวิจัยคีย์เวิร์ด
   └────────────┘ └──────────────┘
```

สังเกต: **Instructions** บน SEO Manager บอกมันว่า *จะทำอย่างไรกับข้อความของคุณ* ส่วนข้อความแชทบอกว่า *หัวข้ออะไรที่ต้องทำ* ทั้งสองอย่างร่วมกันขับเคลื่อนทั้ง flow

**จุดสำคัญ:** คุณไม่ต้องตั้งค่าอะไรใน Builder เพื่อรับ input จากผู้ใช้ entry-point agent จะได้รับข้อความแชทโดยอัตโนมัติเสมอ ช่อง Instructions บอก agent ว่า **จะใช้** input นั้นอย่างไร — ไม่ใช่ว่า input คืออะไร

### ข้อความที่ดีเป็นอย่างไร

เพราะข้อความเป็น input เดียวที่ agent ได้รับ **ความเฉพาะเจาะจงสำคัญมาก** ข้อความคลุมเครือให้ผลคลุมเครือ ข้อความชัดเจนให้ผลตรงจุด

| หลักการ | ตัวอย่างไม่ดี | ตัวอย่างดี |
|---|---|---|
| **ระบุหัวข้อชัดเจน** | "ช่วยหาข้อมูลหน่อย" | "วิจัยเทรนด์การตลาด AI ในเอเชียตะวันออกเฉียงใต้ปี 2026" |
| **บอกผลลัพธ์ที่ต้องการ** | "ทำอะไรเกี่ยวกับโรงแรม" | "เปรียบเทียบโรงแรม 5 แห่งในเชียงใหม่ ราคาต่ำกว่า 3,000 บาท/คืน มีสระว่ายน้ำและอาหารเช้า" |
| **กำหนดขอบเขต** | "ทำ presentation" | "สร้างสไลด์ 8 แผ่น สรุปผลประกอบการ Q4 เน้นการเติบโตของรายได้และลูกค้าใหม่" |
| **ระบุกลุ่มเป้าหมาย/โทน** | "สรุปให้หน่อย" | "เขียน executive summary แบบไม่เทคนิคสำหรับคณะกรรมการบริษัท" |
| **ตั้งขอบเขตไม่ให้กว้างเกิน** | "บอกเรื่องคู่แข่ง" | "เปรียบเทียบเฉพาะคู่แข่งตรง 3 รายในตลาดไทย ไม่ต้องดูต่างประเทศ" |

### ตัวอย่างข้อความตามประเภท Agency

| ประเภท Agency | ตัวอย่างข้อความ |
|---|---|
| **Deep Research** | "วิจัยข้อดีข้อเสียของรถยนต์ไฟฟ้าสำหรับธุรกิจขนส่งในไทย รวมถึง TCO และโครงสร้างสถานีชาร์จ" |
| **Storyboard Planner** | "สร้าง storyboard วิดีโอเปิดตัวสินค้า 60 วินาที สำหรับแอปส่งอาหาร กลุ่มเป้าหมายคนทำงานในกรุงเทพ" |
| **Deck Builder** | "สร้าง pitch deck 10 สไลด์สำหรับ SaaS platform ด้าน HR onboarding เน้นขนาดตลาดและ traction" |
| **Comparison Agent** | "เปรียบเทียบ Notion, Coda และ Confluence สำหรับทีม 50 คน เน้นราคา รองรับภาษาไทย และฟีเจอร์ทำงานร่วมกัน real-time" |
| **Custom Agency** | อธิบายผลลัพธ์ที่ต้องการ ดูคำอธิบาย agency และรายชื่อ agent บนหน้าจอเริ่มต้น เพื่อเข้าใจว่า agency ถูกออกแบบมาเพื่ออะไร |

### ข้อความ follow-up

หลังรันแรกเสร็จ คุณสามารถส่งข้อความเพิ่มเพื่อ:

- **ปรับปรุงผลลัพธ์**: "เพิ่มส่วนเกี่ยวกับความเสี่ยงด้านกฎระเบียบ"
- **เปลี่ยนรูปแบบ**: "เขียนการเปรียบเทียบใหม่เป็นตาราง pros/cons แทน"
- **เจาะลึก**: "ขยายข้อค้นพบ #3 ด้วยแหล่งข้อมูลเพิ่มเติม"
- **เปลี่ยนขอบเขต**: "ทำใหม่แต่เน้นเฉพาะกรุงเทพ ไม่ต้องทั้งประเทศ"

แต่ละ follow-up จะเริ่มรันใหม่ agent จะไม่จำผลรันก่อนหน้าโดยอัตโนมัติ ยกเว้น agency ตั้งค่าให้ใช้ conversation history

## ส่งข้อความ

1. พิมพ์คำขอในช่องด้านล่าง
2. กด **Enter** เพื่อส่ง (หรือคลิกปุ่ม **Send**)
3. ใช้ **Shift + Enter** เพื่อขึ้นบรรทัดใหม่โดยไม่ส่ง
4. ขณะ agent ทำงาน ช่องพิมพ์จะถูก disable และปุ่มส่งจะแสดง spinner

## สิ่งที่เกิดขึ้นระหว่างรัน

หลังส่งข้อความ ระบบจะ stream การทำงานแบบ real-time:

1. **Agent เริ่มทำงาน** — agent ตัวแรก (entry point) รับข้อความและเริ่มประมวลผล
2. **Streaming response** — ข้อความของ agent ปรากฏทีละคำพร้อมเคอร์เซอร์กะพริบ
3. **สลับ Agent** — เมื่อ agent ส่งต่อให้ตัวอื่น จะแสดงป้าย เช่น _"Analyst took over"_ ตรงกลางสนทนา
4. **Tool calls** — หาก agent ใช้เครื่องมือ (Web Search, Code Interpreter ฯลฯ) จะแสดงสถานะ: ชื่อเครื่องมือ + spinner ขณะทำงาน จากนั้นเครื่องหมายถูกหรือ X เมื่อเสร็จ
5. **Guardrail alerts** — หาก guardrail ถูกกระตุ้น:
   - **สีเหลือง (warned)** — แจ้งเตือนแต่ยังทำงานต่อ
   - **สีแดง (blocked)** — หยุดการทำงาน
6. **Human Approval** — หาก workflow มี Human Approval node จะแสดงการ์ดสีฟ้าพร้อมปุ่ม **Approve** และ **Reject** กด Reject เพื่อใส่เหตุผล (ไม่บังคับ)
7. **Preview Card** — เมื่องานเสร็จและสร้างผลลัพธ์แบบมีโครงสร้าง (รายงาน, storyboard, deck, ตารางเปรียบเทียบ) จะแสดง Preview Card ให้ตรวจสอบ

### ตัวบ่งชี้บน Header

ระหว่างรัน header จะแสดง:

- **Active agent badge** — agent ที่กำลังทำงาน (แยกสี)
- **Credits used** — จำนวนเครดิตที่ใช้ไปสะสม

## Run Options (ตัวเลือกการรัน)

คลิก **ไอคอนเฟือง ⚙** ทางซ้ายของช่องพิมพ์ เพื่อเปิด Run Options:

### Target Agent (agent เป้าหมาย)

โดยปกติข้อความจะส่งไปที่ **entry point** ของ agency (ที่แสดง "(entry)" ใน team list) ถ้า agency มีหลาย agent คุณสามารถเลือก agent เฉพาะจาก dropdown เพื่อส่งข้อความตรงไปหามัน — ข้าม routing ปกติ

- **Auto (entry point)** — พฤติกรรมปกติ
- เลือก agent อื่นตามชื่อเพื่อกำหนดเป้าหมายตรง

### Additional Instructions (คำสั่งเพิ่มเติม)

ช่องข้อความสำหรับใส่คำสั่งเพิ่มเติมเฉพาะรอบนี้ คำสั่งจะถูกต่อท้าย system prompt ของ agent สำหรับรอบนี้เท่านั้น เหมาะสำหรับ:

- กำหนดรูปแบบผลลัพธ์: _"ตอบเป็นภาษาไทย"_, _"ใช้ bullet points เท่านั้น"_
- เพิ่มข้อจำกัด: _"เน้นเฉพาะราคา ไม่ต้องดูรีวิว"_
- ปรับโทน: _"เขียนสำหรับผู้เชี่ยวชาญเทคนิค"_

คลิก **X** บน Run Options panel เพื่อล้างการตั้งค่าและปิด

## Model Override (เปลี่ยนโมเดล)

คลิกปุ่ม **Model** บน header bar เพื่อเปลี่ยนโมเดล LLM:

1. Popover จะเปิดขึ้นพร้อม model picker
2. เลือกโมเดลเพื่อใช้กับ **ทุก agent** ในการสนทนานี้
3. แถบสีฟ้าจะปรากฏเหนือช่องพิมพ์: _"Using model override: gpt-4o"_ พร้อมลิงก์ **Clear**
4. คลิก **Reset to agent defaults** เพื่อลบ override (แต่ละ agent จะใช้โมเดลที่ตั้งค่าไว้)

เหมาะสำหรับทดสอบว่า agency ทำงานอย่างไรกับโมเดลต่าง ๆ โดยไม่ต้องแก้ไขการตั้งค่า agency

## ยกเลิกการรัน

ขณะ agent ทำงาน ปุ่ม **Cancel** จะปรากฏด้านล่างสนทนา คลิกเพื่อเลือก:

| ตัวเลือก | พฤติกรรม |
|---|---|
| **Cancel Now** | หยุดทันที กลางประโยค |
| **Cancel After Turn** | ให้ agent ปัจจุบันทำเทิร์นให้เสร็จ แล้วหยุด |

## ลองใหม่เมื่อเกิดข้อผิดพลาด

หากรันล้มเหลว จะแสดงการ์ดสีแดงพร้อมข้อความผิดพลาดและปุ่ม **Retry** คลิก Retry เพื่อส่งข้อความล่าสุดอีกครั้ง

## Preview Cards

เมื่อ agency ทำงานเสร็จและสร้างผลลัพธ์แบบมีโครงสร้าง จะแสดง **Preview Card** ในสนทนา:

| สถานะ Preview | สิ่งที่ต้องทำ |
|---|---|
| **Preview Ready** | ตรวจสอบเนื้อหา แล้วคลิก **Save to Library** หรือ **Save as Presentation** |
| **Saving...** | รอให้บันทึกเสร็จ |
| **Committed** | เสร็จแล้ว สำหรับ deck จะเปิด Presentation Editor อัตโนมัติ สำหรับอื่น ๆ จะแสดง toast "View in Library" |
| **Save Failed** | คลิก **Retry Save** เพื่อลองใหม่ |
| **Expired** | Preview หมดเวลา ส่งคำขออีกครั้งเพื่อรันใหม่ |

คลิก **X** บน Preview Card เพื่อปิดโดยไม่บันทึก

## Activity Panel

บน desktop คลิก **ปุ่มเปิด/ปิดแพเนล** (ด้านขวาของ header) เพื่อเปิดหรือปิด Activity Panel แสดง:

- **Active agent** — agent ที่กำลังทำงาน
- **Event timeline** — ลำดับเหตุการณ์ตามเวลา: การสลับ agent, tool calls, และจุดสำคัญ
- Spinner ขณะรันอยู่

## Browser Session

หาก tenant เปิดใช้ Browser Session จะมีฟีเจอร์เพิ่มเติม:

### เปิด Browser Session

คลิก **Open Browser Session** ที่ header เพื่อเปิดเบราว์เซอร์สดให้ agent ใช้ หากมี session อยู่แล้ว ข้อความปุ่มจะเปลี่ยนตามสถานะ และคลิกเพื่อเปิด session เดิม

### Quick Browser Instruction

เมื่อ browser session ทำงานอยู่ จะแสดงการ์ดด้านบนสนทนาพร้อม:

1. **Skill selector** — เลือกสิ่งที่เบราว์เซอร์ควรทำ (navigate, extract, compare ฯลฯ)
2. **ช่องข้อความ** — อธิบายเป้าหมายหรือขั้นตอนถัดไป
3. **ปุ่ม Send Browser Instruction** — ส่งคำสั่งไปยัง browser session โดยไม่ต้องออกจาก Agency Chat

### Suggested Browser Launch

หากส่งข้อความที่ดูเหมือนต้องใช้เบราว์เซอร์สด (เช่น _"หาดีลโรงแรมที่ดีที่สุดในกรุงเทพ"_) จะแสดงการ์ดแนะนำให้เปิด browser session คลิก **Confirm** เพื่อเปิด หรือ **Dismiss** เพื่อข้าม

## Creator Fee

agency จาก community บางตัวมี **creator fee** เป็นเครดิตต่อรอบที่สำเร็จ หากมีจะแสดงแถบสีส้มเหนือช่องพิมพ์แสดงจำนวนค่าธรรมเนียม

## หน้าจอเริ่มต้น (Empty State)

เมื่อเปิด agency ครั้งแรก (ยังไม่มีข้อความ) พื้นที่สนทนาจะแสดง:

- ชื่อและคำอธิบายของ agency
- **Team Members** — รายชื่อ agent ทั้งหมดพร้อมบทบาท แยกสี Supervisor แสดงไอคอนมงกุฎ agent ปกติแสดงไอคอนบอท entry point มีป้าย "(entry)"
- ข้อความ: _"Send a message to start the conversation"_

## Keyboard Shortcuts

| ปุ่มลัด | การทำงาน |
|---|---|
| **Enter** | ส่งข้อความ |
| **Shift + Enter** | ขึ้นบรรทัดใหม่ |

## เคล็ดลับ

- **เริ่มง่าย ๆ** — ทดสอบด้วยคำขอสั้น ๆ ก่อน เพื่อตรวจสอบว่า routing ทำงานถูกต้อง
- **ใช้ Run Options ทดลอง** — กำหนด agent เป้าหมายหรือเพิ่มคำสั่งชั่วคราวโดยไม่ต้องแก้ไข agency
- **ดู Activity Panel** — ช่วยเข้าใจว่า agent ทำงานร่วมกันอย่างไร และจุดไหนเป็นคอขวด
- **ลองเปลี่ยนโมเดล** — โมเดลเร็วอาจเหมาะกับแบบร่าง ส่วนโมเดลที่ดีกว่าให้ผลลัพธ์สุดท้ายที่ดีกว่า
- **ยกเลิกอย่างนุ่มนวล** — ใช้ "Cancel After Turn" เมื่อเป็นไปได้ เพื่อรับผลลัพธ์บางส่วนแทนที่จะไม่ได้อะไรเลย

<!-- knowledge-graph:related:start -->
## หัวข้อที่เกี่ยวข้อง

- [[teams|ทีม AI]]
- [[getting-started|เริ่มต้นใช้งาน]]
- [[document-management|จัดการเอกสาร]]
- [[agencies|Agencies - ทีม AI หลายตัว]]
- [[agency-builder|ตัวสร้าง Agency]]
- [[groups|กลุ่ม]]
- [[team-monitoring|การติดตามทีมและ Scoped Memory]]
<!-- knowledge-graph:related:end -->
