# SmartAIHub Public Site Integrations and Copyable Story — Design Spec

## Goal

ทำให้ Home, Features และ Docs สื่อ SmartAIHub แบบ outcome-first: ผู้ใช้ไม่ต้องเริ่มจากการเรียนศัพท์เทคนิค แต่เห็นเส้นทางจากไอเดียไปสู่งานจริง โดยเฉพาะซีรีย์แนวตั้งและวิดีโอรีวิวสินค้า พร้อมอธิบาย Chrome Extension, Worker App และ MCP เฉพาะในขอบเขตที่มีอยู่จริง

## Audience and message hierarchy

1. ผู้ใช้ทั่วไป, creator และเจ้าของร้าน: เริ่มจากโจทย์และผลลัพธ์ที่ทำได้ทันที
2. Affiliate, agency, influencer และทีมธุรกิจ: เห็นการทำซ้ำ การจัดการ asset และการขยายงาน
3. ผู้ใช้ขั้นสูง: เห็น Worker App, local render, MCP และการเชื่อมต่อ Claude, Codex, Hermes หรือ MCP client อื่น ๆ เป็นชั้นรายละเอียดท้ายเรื่อง

แกนข้อความร่วมทุกหน้า: “SmartAIHub ไม่ได้สร้างมาเพื่อให้คนไปเรียน AI แต่สร้างมาเพื่อให้คนใช้ AI เป็นเครื่องมือทำงานได้ทันที”

## Verified claim boundaries

- Chrome Extension รองรับการดึงข้อมูลและหลักฐานสินค้าจาก Shopee และ TikTok Shop แล้วให้ผู้ใช้ตรวจสอบ/แก้ไข/ยืนยันก่อน sync เข้า SmartAIHub; ไม่สื่อว่าอัปโหลดอัตโนมัติหรือดึงข้อมูลจากหน้าที่ถูกบล็อก
- Product data ที่ sync แล้วนำไปต่อยอดใน Product Detail และ Media Studio เพื่อทำ brief, มุมรีวิว, script/storyboard และวิดีโอแนวตั้งตาม workflow ที่ระบบรองรับ
- Worker App/Remotion Executor รองรับการรับงาน render บนเครื่องที่เชื่อมต่อและแสดงสถานะงาน; ไม่สื่อว่า Worker App เป็น MCP server
- MCP เป็นช่องทางเชื่อมต่อของ SmartAIHub ที่มี discovery/OAuth และต้องผ่านการเข้าสู่ระบบ/สิทธิ์/tenant policy; ระบุ Claude, Codex, Hermes และ MCP clients อื่น ๆ ได้ แต่ไม่เหมารวมว่าทุกเครื่องมือเปิดให้ทุกบัญชี
- ใช้ “100+ Skills” ตามข้อความผลิตภัณฑ์ปัจจุบัน และไม่เพิ่มผู้ให้บริการหรือ marketplace ที่ยังไม่มีหลักฐานในระบบ

## Surface architecture

### Home (`/`)

- คง hero และ feature catalog 15 รายการที่มีอยู่
- เพิ่ม spotlight แบบภาพนำ 2 เรื่อง: Marketplace Capture → Product Review และ Worker/local render → connected AI ecosystem
- เพิ่ม link ไปบทความสรุปฉบับเต็มใน Docs
- ใช้ภาพ editorial แบบหรู ไม่มีข้อความฝังในภาพและไม่ทำเป็น mockup UI

### Features (`/features`)

- คงลำดับจาก jobs/outcomes ไปสู่ catalog 15 รายการ
- เพิ่ม spotlight `capture` และ `worker` โดยแยกจาก spotlight เดิม ไม่ใช้ภาพซ้ำกับ Home
- เพิ่มกล่อง advanced integrations ที่อธิบาย MCP หลังผู้อ่านเข้าใจผลลัพธ์แล้ว
- เพิ่ม link ไปบทความสรุปใน Docs

### Docs (`/docs`)

- เพิ่ม guide cards สำหรับ capture, worker และ MCP โดยใช้ anchor บนหน้าเดียวกันหรือ route ที่มีอยู่จริง
- เพิ่ม section อธิบายเส้นทาง capture และ connected runtime พร้อมภาพเฉพาะหน้า Docs
- เพิ่มบทความ `smartaihub-story` เป็น `<textarea readOnly>` ที่แสดงเนื้อหาเต็มสองภาษา และปุ่ม copy ผ่าน Clipboard API พร้อมสถานะสำเร็จ/ล้มเหลว
- บทความครอบคลุม positioning, use cases, Chat + 100+ Skills, 15 surfaces, Shopee/TikTok Shop capture, product-review video, Worker/local render และ MCP โดยวาง technical caveat ไว้ท้ายบทความ

## Component and asset plan

นำ pattern เดิมของหน้าเว็บกลับมาใช้ (`SafeImage`, `ImageFrame`, `SpotlightSection`, Navbar/Footer, existing tokens) และเพิ่มภาพ GPT Image 2 ที่ไม่ซ้ำกับ asset เดิม:

- Home: `smartaihub-home-marketplace-to-content.webp`, `smartaihub-home-connected-ecosystem.webp`
- Home: `smartaihub-home-ai-work-hub.webp` for the plain-language AI Work Hub story
- Features: `smartaihub-features-marketplace-capture.webp`, `smartaihub-features-worker-mcp.webp`
- Features: `smartaihub-features-organization-security.webp` for team, tenant, and data-boundary messaging
- Docs: `smartaihub-docs-capture-flow.webp`, `smartaihub-docs-connected-runtime.webp`
- Docs: `smartaihub-docs-idea-to-output.webp` for the idea-to-output flow

ภาพเป็น cinematic/editorial concept, มี negative space สำหรับข้อความ, ไม่ใส่โลโก้หรือข้อความที่อ่านได้ และมี alt text สองภาษาใน translation bundle

## Interaction, responsive and accessibility contract

- ปุ่ม Copy ต้องมี accessible label และ live status; textarea อ่านได้ คัดลอก/เลือกข้อความเองได้ และไม่ถูกตัดข้อความ
- ภาพทุกภาพมี alt text ที่สื่อเนื้อหา; หากโหลดไม่ได้ต้องยังเห็นพื้นหลังและข้อความหลัก
- section ใหม่ต้องเรียงเป็น single column บน mobile, ไม่บังคับความกว้างคงที่ และตรวจ horizontal overflow ที่ 390px
- แถบ link และ card ต้อง keyboard-focus ได้และมี contrast ตาม pattern เดิม
- ใช้ loading/lazy image เดิม ไม่เพิ่ม dependency หรือ global reset

## Validation

- ตรวจ JSON locale parity และบทความมีคำสำคัญทั้งสองภาษา
- รัน focused Vitest ของ public-site i18n/page ที่เกี่ยวข้อง
- รัน `git diff --check` และ web build
- ตรวจ public routes `/`, `/features`, `/docs` ด้วย browser ที่ desktop/mobile; ยืนยัน textarea, copy status, asset loading และไม่มี horizontal overflow

## Out of scope

- ไม่เพิ่มฟังก์ชันใน product app, extension, Worker หรือ MCP
- ไม่ประกาศ provider/feature ที่ยังไม่ตรวจพบจริง
- ไม่ลบหรือแก้ไฟล์ release/runtime ที่มีการเปลี่ยนแปลงจากงานอื่น

## Content expansion addendum

บทความ copy-ready ต้องอธิบายภาพใหญ่ให้ครบก่อนลงรายละเอียด technical โดยเพิ่มลำดับดังนี้:

- ปัญหาของการต้องเรียนหลาย AI และ positioning ว่า AI ควรเป็นเครื่องมือทำงาน
- เส้นทาง `Idea → Concept/Script → Image/Reference → Storyboard → Video → Social/Marketing → Product Review/Affiliate → Automation/Agents`
- ความหมายของ AI Work Hub และกลุ่มผู้ใช้ตั้งแต่ creator ถึงองค์กร
- ฟังก์ชันปัจจุบัน 15 ส่วน แบ่งเป็น Create, Organize, Control และ Organization & Security
- ตัวอย่าง Vertical Series และ Product Content workflow แบบเชื่อมต่อกัน
- Tenant Isolation, Data Isolation, Access Control, Organization Workspace และ Private Organization Data
- Chrome Extension, Worker App/local render และ MCP/Claude/Claude Code/Codex/Hermes โดยแยกความสามารถที่มีวันนี้ออกจากทิศทางระยะยาวของ AI Agents

เนื้อหาใหม่ยังคงเป็น plain text ใน textarea เพื่อให้เลือกและคัดลอกได้ทั้งหมด และใช้ locale key แยกเพื่อให้ปุ่ม Copy คัดลอกข้อความเดียวกับที่แสดงจริงทั้งภาษาไทยและภาษาอังกฤษ
