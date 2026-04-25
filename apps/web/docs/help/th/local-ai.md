---
slug: local-ai
title: Local AI
description: คู่มือครบเรื่องการตั้งค่า Local LLM, โมเดล, แชต, skills, ภาพ, OCR และเสียง
icon: Cpu
section: features
order: 66
pages: ["/settings"]
tags:
  - "local ai"
  - "local llm"
  - "local llm chat"
  - "gemma 4"
  - "gemma4"
  - "on-device ai"
  - "settings"
  - "local runtime"
  - "browser local"
  - "tauri local"
  - "local voice"
  - "local ocr"
  - "help"
  - "help/th"
  - "help/runtime"
  - "runtime"
  - "local-ai"
aliases:
  - "local-ai"
  - "Local AI"
  - "Local AI help"
---

# Local AI

## ภาพรวม

Local AI ช่วยให้ SmartSpecPro รันงาน LLM บางประเภทบนอุปกรณ์ของคุณด้วย Gemma 4 แทนการเรียก cloud LLM provider ทุกครั้ง

แนวคิดหลักของฟีเจอร์นี้มี 3 อย่าง:

- ถ้าไม่เปิด Local AI ระบบ cloud เดิมต้องทำงานเหมือนเดิม
- ผู้ใช้แต่ละคนเปิดใช้งานได้เองจาก **Settings > Local AI**
- แชตและ local-safe text skills ที่รองรับสามารถวิ่งด้วยโมเดล local ได้ทั้งบน **Web** และ **Desktop**

เปิด **Settings > Local AI** เพื่อเริ่มตั้งค่า โดยใน section นี้จะมีปุ่ม **Help** สำหรับเปิดคู่มือนี้โดยตรง

## Local AI เปลี่ยนอะไรบ้าง

เมื่อเปิด Local AI และ runtime พร้อม:

- แชตข้อความทั่วไปสามารถตอบด้วย Gemma 4 บนเครื่องได้
- การถอดเสียงจากไมก์แบบสั้นสามารถรัน local ได้
- local-safe text skills บางกลุ่มสามารถใช้ local model ได้
- การอ่านภาพและ OCR assist สามารถใช้ local หรือ hybrid assist ได้
- การสรุปและบีบ context สามารถใช้ local processing ได้

## อะไรที่ยังอยู่บนเส้นทาง server เดิม

Local AI ไม่ได้แปลว่า SmartSpecPro กลายเป็นระบบที่ไม่พึ่ง server เลย

สิ่งต่อไปนี้ยังใช้ server ตามปกติ:

- การบันทึกประวัติแชต
- การเขียนข้อมูลลงฐานข้อมูล
- RAG และ memory ฝั่ง server
- auth, tenant policy, audit และ feature flags
- ข้อมูล team/workspace

และสิ่งต่อไปนี้ยังอยู่บนเส้นทาง cloud หรือ API เดิม แม้ session นั้นจะเปิด local:

- การสร้างภาพ
- การสร้างวิดีโอ
- งาน media generation ที่ต้องพึ่ง provider ภายนอก
- งานที่ถูกกำหนดว่า cloud-only โดยตรง

## ความต่างระหว่าง Web กับ Desktop

## Web

Web Local AI ขึ้นกับความพร้อมของเบราว์เซอร์ เช่น secure context, worker, WebGPU และโมเดล `.web.task` ที่เตรียมไว้แล้ว

Web เหมาะกับงานอย่าง:

- local text reply
- local summaries
- local context compaction
- local image assist บนเบราว์เซอร์ที่รองรับ
- local voice transcription บนเบราว์เซอร์ที่รองรับ

## Desktop

Desktop Local AI ใช้ runtime ของ Tauri และเส้นทาง LiteRT-LM จึงเหมาะกว่าสำหรับ:

- local text chat ที่เสถียรกว่า
- local-safe skill execution
- hands-free voice mode
- wake phrase
- local voice readback แบบ native
- การติดตั้ง ตรวจสอบ ซ่อมแซม อัปเดต และลบโมเดล

## ทางเลือกแบบ localhost Local AI backend

ถ้า Gemma runtime ที่มากับ Web หรือ Desktop ไม่เหมาะกับเครื่องของคุณ SmartSpecPro ยังสามารถใช้ backend แบบ OpenAI-compatible และ multimodal ที่รันอยู่บนเครื่องเดียวกันผ่าน loopback ได้ โดยให้มองว่านี่คือ Local AI ของเครื่องนี้ ไม่ใช่รายการ cloud provider

ตัวอย่างที่ใช้ได้ เช่น:

- `http://localhost:8000`
- `http://localhost:8000/v1`
- `http://localhost:8000/v1/chat/completions`

ตั้งค่าได้ที่ **Settings > Local AI > เอ็นจิน Local AI**

ในแท็บนี้ให้เลือกก่อนว่าอุปกรณ์นี้จะใช้ Local AI ชุดไหน:

- **อัตโนมัติ**: ถ้ามี localhost backend ที่พร้อม ระบบจะลอง backend ก่อน แล้วค่อย fallback ไป Gemma ในเครื่องเมื่อรองรับ
- **Gemma ในเครื่อง**: ใช้เฉพาะโมเดล Gemma ที่เตรียมไว้ในเครื่องสำหรับงาน local ที่รองรับ
- **Localhost backend**: ใช้เฉพาะ backend แบบ multimodal บน localhost สำหรับงาน local ที่รองรับ

ช่องที่ต้องมี:

- **Base URL**
- **Model**

ช่องที่ใส่เพิ่มได้:

- **Bearer token**
- **Request timeout**

ระบบจะอนุญาตเฉพาะ loopback เช่น:

- `localhost`
- `127.0.0.1`
- `::1`

backend แบบนี้ใช้แทน Gemma 4 ในเครื่องได้สำหรับงาน local ที่รองรับ เช่น:

- แชตข้อความ local
- การสรุป
- context compaction
- การอ่านภาพ
- งานช่วย OCR
- local-safe text skills

ถ้า localhost server ของคุณรองรับข้อความแบบ OpenAI-compatible ที่เป็น multimodal ได้ SmartSpecPro จะส่งได้ทั้ง:

- `text`
- `image_url`

แต่ไม่ได้แทนที่:

- การสร้างภาพ
- การสร้างวิดีโอ
- cloud-only tools
- การบันทึกลง server, auth, RAG หรือ database writes

## ก่อนเริ่มใช้งาน

ตรวจสอบว่าทั้งหมดนี้เป็นจริง:

1. tenant ของคุณอนุญาต Local AI
2. อุปกรณ์ของคุณรองรับ
3. คุณเปิด Local AI ใน **Settings > Local AI**
4. คุณเตรียม Gemma 4 profile อย่างน้อย 1 ตัวสำหรับพื้นผิวที่ใช้อยู่

หาก tenant ปิด Local AI หรือบังคับ cloud-only การตั้งค่าจะยังแสดงเพื่ออธิบายได้ แต่เส้นทางแชตจริงจะยังเป็น cloud

## การตั้งค่าระดับผู้ใช้

ไปที่ **Settings > Local AI**

หน้านี้แบ่งเป็น 2 ส่วน:

- **Synced account preferences**
- **This device only**

## Synced account preferences

การตั้งค่าส่วนนี้จะติดตามบัญชีผู้ใช้ของคุณไปยังพื้นผิวที่รองรับ

### Enable

ใช้เปิดหรือปิด Local AI สำหรับบัญชีนี้

- ปิด: ใช้ cloud ตามปกติ
- เปิด: โหมด local และ profile preference จะเริ่มมีผลบนพื้นผิวที่รองรับ

### Execution mode

- **Off**: ปิด Local AI สำหรับบัญชีนี้
- **Auto**: ให้ SmartSpecPro ตัดสินใจว่าเมื่อใดควรใช้ local
- **Prefer local**: พยายามใช้ local ก่อน ถ้าเส้นทางนั้นอนุญาต
- **Local only**: งาน local ที่รองรับต้องไม่เรียก cloud LLM provider
- **Cloud only**: ใช้ cloud path ตามปกติแม้ local runtime จะพร้อม

### Default local profile

เลือก Gemma 4 profile หลักของผู้ใช้

ตัวอย่างเช่น:

- `gemma4-e2b-web-fast`
- `gemma4-e4b-web-balanced`
- profile ฝั่ง desktop ที่ bundled หรือ prepare แล้ว

### Use for general chat

อนุญาตให้ SmartSpecPro ใช้ Local AI กับแชตข้อความทั่วไปเมื่อคำขอนั้นเข้าเงื่อนไข

### Use for summaries

ใช้ Local AI กับงานอย่าง:

- การสรุป
- context compaction
- การย่อข้อความเก่าในบทสนทนา

### Use for image understanding and OCR assist

ใช้ Local AI กับงานอย่าง:

- อธิบาย screenshot
- pre-read ใบเสร็จ
- scene understanding
- ช่วย cleanup และตีความ OCR

ตัวเลือกนี้ไม่ได้หมายความว่างานสร้างภาพหรือสื่อทั้งหมดจะกลายเป็น local

### Voice input mode

- **Legacy STT**: ใช้เส้นทางถอดเสียงเดิม
- **Gemma 4 local**: บังคับถอดเสียงบนอุปกรณ์
- **Auto**: พยายามใช้ local ก่อน ถ้าไม่ได้ค่อย fallback ตามที่อนุญาต

สิ่งสำคัญ:

- ถ้าเลือก **Gemma 4 local** แบบ explicit ระบบควร fail-closed ไม่แอบสลับไป third-party STT
- ถ้าเลือก **Auto** ระบบอาจ fallback ได้บนเครื่องที่ไม่พร้อม

### Enable short voice commands

เปิดให้แชตรับคำสั่งเสียงแบบสั้น เช่น:

- “เปิดหน้า chat”
- “หาร้านอาหารแถวนี้”
- “อ่าน notification ที่ยังไม่อ่าน”

### Voice readback mode

- **Off**
- **Important only**
- **All responses**

คือการให้ผู้ช่วยอ่านคำยืนยันหรือคำตอบบางส่วนกลับมาเป็นเสียง

### Voice readback language

ไม่บังคับ

ปล่อยว่างเพื่อให้เครื่องเลือกให้อัตโนมัติ หรือใส่เช่น:

- `th-TH`
- `en-US`

### Voice readback rate

ปรับความเร็วของการอ่านออกเสียง

### Read back only voice-command responses

จำกัดให้การอ่านกลับเกิดกับคำสั่งเสียงเชิง assistant เป็นหลัก ไม่ใช่ทุกคำตอบ

### Use location context for “near me” searches

ให้ voice search เข้าใจคำสั่งเช่น:

- “ร้านอาหารใกล้ฉัน”
- “หาร้านกาแฟแถวนี้”

ร่วมกับข้อมูลตำแหน่งที่พื้นผิวนั้นรองรับ

### Hands-free mode

ใช้ได้เฉพาะบน Desktop

- **Off**
- **Wake phrase**

### Wake phrase

ใช้ได้เฉพาะบน Desktop

เช่น:

- `hey smartspec`

runtime จะเปิดโหมด wake phrase ก็ต่อเมื่อ local voice พร้อมจริง

## This device only

การตั้งค่าส่วนนี้ผูกกับ:

- tenant
- user
- runtime surface

ดังนั้น Web และ Desktop ของบัญชีเดียวกันอาจมีโมเดลที่เตรียมไว้ไม่เหมือนกัน

### Allow model downloads on this device

เปิดหรือปิดการติดตั้งโมเดลบนอุปกรณ์นี้

### Prefer Wi-Fi / unmetered downloads

เหมาะกับโมเดล Gemma 4 ที่มีขนาดค่อนข้างใหญ่

### Storage budget

กำหนดงบพื้นที่เก็บโมเดลบนอุปกรณ์นี้

## การจัดการโมเดล

การจัดการจะแตกต่างกันระหว่าง Web และ Desktop

## บน Web

Web จะ cache โมเดลเบราว์เซอร์เพื่อใช้กับ Local AI

ปุ่มที่มีได้ เช่น:

- **Cache selected model**
- **Remove selected model**
- **Pause download**
- **Resume**
- **Retry**

และมีข้อมูลอย่าง:

- progress การดาวน์โหลด
- ขนาดที่ดาวน์โหลดแล้ว
- capability blockers
- eligible text และ voice profiles

## บน Desktop

Desktop ใช้เส้นทาง LiteRT-LM แบบ managed

ปุ่มที่มีได้ เช่น:

- **Prepare selected model**
- **Remove selected model**
- **Verify**
- **Repair**
- **Update**

Desktop ยังแสดงได้ด้วยว่าโมเดลนั้น:

- มากับแอป
- ติดตั้งบนเครื่องแล้ว
- ถูกตั้งเป็น default profile แล้วหรือยัง

## Bundled กับ on-demand บน Desktop

Desktop build อาจมีหลายรูปแบบ:

- มีเฉพาะ runtime แล้วค่อยดาวน์โหลดโมเดลเมื่อต้องใช้
- bundle Gemma 4 profile มาพร้อม installer

ถ้าโมเดลเป็น bundled:

- มักจะไม่สามารถลบแบบโมเดลที่ดาวน์โหลดทีหลังได้
- UI จะแสดงชัดว่าเป็น bundled

## Runtime diagnostics

หน้า Settings มี diagnostics panel เพื่อให้ผู้ใช้เห็นว่าทำไม Local AI ถึงพร้อมหรือยังไม่พร้อม

## Web diagnostics มีอะไรบ้าง

- secure context
- มี WebGPU หรือไม่
- adapter พร้อมหรือไม่
- device พร้อมหรือไม่
- eligible text profiles
- eligible voice profiles
- ความพร้อมของ voice readback
- blockers ปัจจุบัน

## Desktop diagnostics มีอะไรบ้าง

- runtime พร้อมหรือไม่
- Gemma 4 text พร้อมหรือไม่
- Gemma 4 voice พร้อมหรือไม่
- พาธ LiteRT-LM
- bundled profiles
- installed profiles
- ความพร้อมของ voice readback
- runtime note ปัจจุบัน

## การใช้งานใน Chat

Local AI ทำงานได้มากกว่า 1 ระดับใน chat

## พฤติกรรมระดับบัญชี

ค่าระดับบัญชีจะกำหนดค่าเริ่มต้นของบทสนทนาใหม่

## พฤติกรรมระดับ session

แต่ละ chat session สามารถ override ค่า default ของบัญชีได้

แนวคิดที่รองรับ เช่น:

- ใช้ค่าตามบัญชี
- บังคับ local
- บังคับ cloud

คุณสามารถเปลี่ยนค่านี้ได้จากปุ่ม **Chat Local AI** บนหัวแชต หรือจาก **Skill Settings** ของบทสนทนานั้น

ถ้าคุณเปิด session ให้เป็น local สำหรับบทสนทนานั้น ระบบสามารถใช้ local LLM สำหรับคำตอบข้อความที่รองรับได้ โดยไม่เรียก cloud LLM provider

## ความหมายที่สำคัญ

คำว่า **local chat session** หมายถึง:

- LLM ที่ตอบสำหรับงานข้อความที่รองรับเป็น local
- local-safe text skills ใน session เดียวกันสามารถใช้ local ได้ด้วย

แต่ไม่ได้แปลว่า:

- server หยุดบันทึกข้อความ
- RAG หายไป
- database write หยุดทำงาน

SmartSpecPro ยังสามารถ persist บทสนทนาบน server ได้ตามปกติ ขณะเดียวกันก็ให้เส้นทาง LLM สำหรับงานที่เข้าเกณฑ์เป็น local

## พฤติกรรมของ Skills ใน local session

session-level local override ยังมีผลกับ local-safe text skills ที่รองรับด้วย

ตัวอย่าง skill กลุ่มที่อาจใช้ local ได้เมื่อ policy อนุญาต:

- เขียน prompt
- ร่างบทความ
- rewrite
- summarize
- evaluator แบบข้อความ
- translation
- JSON extraction

ตัวอย่างงานที่ยังอยู่บนเส้นทางเดิม:

- การสร้างภาพ
- การสร้างวิดีโอ
- cloud media tools
- media API ภายนอก

## Slash skills และ explicit selection

เมื่อ session เป็น local-only ระบบจะหลีกเลี่ยงการใช้ cloud LLM เพื่อ detect skill ในกรณีที่จำเป็น

แนวปฏิบัติที่ดี:

- ถ้ารู้ skill ที่ต้องใช้ ให้เลือกแบบ explicit
- ใช้ slash command กับ workflow แบบ local-safe text

## เสียงและปุ่มไมก์

Local AI รองรับ workflow จากไมก์ทั้งบน Web และ Desktop โดย Desktop มักจะทำได้ครบกว่า

## ปุ่มไมก์ / ปุ่มอัดเสียง

ปุ่มไมก์สามารถ:

- รับ short dictation
- ถอดเสียงพูดเป็นข้อความ
- ส่งข้อความนั้นเข้า chat
- ตีความ short voice command เมื่อเปิดใช้

เส้นทางไมก์อาจใช้:

- legacy STT
- Gemma 4 local transcription
- auto mode

## Voice commands

คำสั่งเสียงสั้น ๆ สามารถ route ไปยัง action บางอย่างได้ เช่น:

- เปิดหน้า chat
- ค้นหาพร้อม location context
- draft ข้อความ
- อ่าน notifications

งานที่มีผลข้างเคียงสำคัญยังควรมี confirmation เสมอ

## Voice readback

Voice readback สามารถ:

- อ่านคำยืนยันสั้น ๆ
- อ่านคำตอบสำคัญ
- อ่านคำตอบได้มากขึ้นเมื่อเปิดใช้

Desktop อาจใช้ backend แบบ native ส่วน Web อาจใช้ browser speech synthesis ถ้ามี

## Hands-free mode

Desktop สามารถรองรับการฟังแบบ hands-free ด้วย wake phrase ได้เมื่อ runtime พร้อม

## ภาพและ OCR

Local AI ช่วยในงานอ่านภาพและ OCR ได้

## Local image understanding

ตัวอย่าง:

- อธิบาย screenshot
- บรรยาย scene
- pre-read ใบเสร็จ
- สรุปสิ่งที่เห็นก่อนส่งต่อไป workflow ที่ลึกกว่า

## Hybrid OCR

บาง OCR flow เป็นแบบ hybrid:

1. OCR engine ดึงข้อความออกมาก่อน
2. Gemma 4 local ช่วยตีความ cleanup หรือสรุปผล

เหมาะกับงานอย่าง:

- ใบเสร็จ
- screenshots
- เอกสารที่เป็นภาพจำนวนมาก
- scanned text cleanup

## สิ่งที่ Local AI ไม่ได้การันตีสำหรับ OCR

การมี image assist ไม่ได้แปลว่า workflow เอกสารทุกแบบจะกลายเป็น local ทั้งหมดหรือ offline ทั้งหมด

ข้อจำกัดของ document, workspace และ provider ยังอาจมีผลตามประเภทงาน

## ความเป็นส่วนตัวและความหมายของ routing

ให้ใช้หลักนี้เพื่อเข้าใจพฤติกรรม:

- **Local AI off**: ใช้ cloud path ปกติ
- **Cloud only**: ใช้ cloud path ปกติ
- **Prefer local**: ใช้ local ก่อนเมื่อรองรับ แต่ยังอาจ fallback
- **Local only**: งาน local ที่รองรับต้องไม่เรียก cloud LLM provider

สำหรับเสียง:

- **Gemma 4 local** ควร fail-closed ถ้า local transcription ใช้ไม่ได้
- **Auto** อาจ fallback ได้

สำหรับ chat session:

- session local มีผลกับข้อความ local-safe และ local-safe text skills ที่รองรับ
- media generation ยังอยู่บนเส้นทางเดิม

## การแก้ปัญหา

## “โมเดลยังไม่พร้อม”

ไปที่ **Settings > Local AI** แล้ว:

- เลือก default profile
- prepare หรือ cache โมเดล
- ถ้าอยู่บน Desktop ให้ลอง Verify โมเดล

## “Local voice ยังใช้ไม่ได้”

ตรวจสอบ:

- voice input mode ที่เลือก
- profile ปัจจุบันรองรับ voice หรือไม่
- runtime readiness ของ Web หรือ Desktop
- diagnostics blockers ใน Settings

## “คำขอนี้รัน local-only ไม่ได้”

สาเหตุที่เป็นไปได้:

- คำขอต้องใช้ cloud-only tool
- skill ปัจจุบันไม่ใช่ local-safe
- อุปกรณ์ยังไม่มีโมเดลพร้อม
- คำขอพึ่งงานสร้าง media

ลอง:

- เปลี่ยนเป็น **Auto** หรือ **Prefer local**
- เอา attachment ที่ไม่รองรับออก
- เลือก local-safe text skill แบบ explicit

## “ดาวน์โหลดโมเดลบน Web ไม่ได้”

ตรวจสอบ:

- secure context
- WebGPU support
- storage budget
- สิทธิ์การดาวน์โหลดบนอุปกรณ์นี้

## “โมเดลบน Desktop ดูเหมือนเสีย”

ลองใช้:

- **Verify**
- **Repair**
- **Update**

ใน **Settings > Local AI**

## แนวปฏิบัติที่แนะนำ

- ถ้าเพิ่งเริ่ม ให้เริ่มจาก **Auto**
- ถ้าต้องการ local มากขึ้นแต่ยังอยากมี fallback ให้ใช้ **Prefer local**
- ใช้ **Local only** เมื่อเข้าใจแล้วว่างานที่ไม่รองรับจะ fail แทนการสลับไป cloud แบบเงียบ ๆ
- เตรียม Gemma 4 profile อย่างน้อย 1 ตัวในทุกพื้นผิวที่ใช้งานบ่อย
- ใช้ explicit skill selection กับ workflow สำคัญที่ต้องการ local-only
- เปิด diagnostics panel ทุกครั้งเมื่อ Local AI ทำงานไม่ตรงกับที่คาด

## ตัวอย่างการใช้งานแบบเร็ว

## แชตทั่วไปแบบ local

1. เปิด Local AI
2. เลือก default Gemma 4 profile
3. เตรียมโมเดลบน Web หรือ Desktop
4. เปิด **Use for general chat**
5. เปิด chat session แล้วสลับ session นั้นเป็น local เมื่อต้องการ

## การพิมพ์ด้วยเสียงแบบ local

1. ตั้ง **Voice input mode** เป็น **Gemma 4 local** หรือ **Auto**
2. เตรียม Gemma 4 profile ที่รองรับเสียง
3. ใช้ปุ่มไมก์ใน chat

## ภาพ + OCR assist

1. เปิด **Use for image understanding and OCR assist**
2. เตรียม profile ที่รองรับ
3. แนบภาพ ใบเสร็จ หรือ screenshot ใน chat
4. ให้ SmartSpecPro ใช้ local หรือ hybrid assist ตามสิทธิ์และความพร้อมของ runtime

<!-- knowledge-graph:related:start -->
## หัวข้อที่เกี่ยวข้อง

- [[desktop-host|Desktop Host]]
- [[getting-started|เริ่มต้นใช้งาน]]
- [[document-management|จัดการเอกสาร]]
- [[browser-session|Browser Session]]
- [[cli|CLI (Kilo)]]
- [[desktop-host-managed-mode|Desktop Host Managed Mode]]
- [[desktop-releases|Desktop Releases]]
<!-- knowledge-graph:related:end -->
