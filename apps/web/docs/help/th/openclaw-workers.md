---
slug: openclaw-workers
title: Claw Workers
description: เชื่อม personal worker ของตระกูล Claw เข้ากับทีม คุมงบเครดิต และเข้าใจว่าตอนนี้ gateway ใช้อะไรได้จริงบ้าง
icon: Server
section: admin
order: 87
pages: ["/admin/tenants", "/admin/monitoring", "/teams", "/credits"]
tags:
  - "openclaw"
  - "worker"
  - "external runtime"
  - "monitoring"
  - "teams"
  - "credits"
  - "feature flag"
  - "help"
  - "help/th"
  - "help/runtime"
  - "runtime"
  - "openclaw-workers"
aliases:
  - "openclaw-workers"
  - "Claw Workers"
  - "Claw Workers help"
---

# Claw Workers

ใช้คู่มือนี้เมื่อคุณต้องการให้ SmartSpecPro ส่งงานที่รองรับไปทำบน worker ภายนอกของตระกูล Claw

คู่มือนี้อธิบายเฉพาะ runtime แบบ `openclaw_gateway` เป็นหลัก ปัจจุบัน SmartSpecPro แยก runtime family อื่นไว้อย่างชัดเจนแล้ว:

- `desktop_zeroclaw_managed` สำหรับงานแบบ Desktop + ZeroClaw ที่ผูกกับเครื่อง
- `nemoclaw_sandbox` สำหรับ NemoClaw secure sandbox pool ดูเพิ่มเติมที่ [NemoClaw Workers](./nemo-claw-workers.md)
- `hiclaw_cluster` สำหรับ HiClaw collaborative cluster ดูเพิ่มเติมที่ [HiClaw Workers](./hi-claw-workers.md)

runtime เหล่านี้ไม่ได้สืบทอด semantics ของ OpenClaw โดยอัตโนมัติ ถ้าเปิดใช้งานภายหลัง หน้า operator จะเห็นเป็นคนละ runtime family พร้อม rollout และ compatibility state ของตัวเอง

Claw workers เหมาะกับงานแบบ:

- งานผู้ช่วยที่ใช้เวลานาน
- งานที่ใช้ browser หรือ tool เยอะ
- งานที่ต้องให้ worker ทำแทนเหมือนผู้ปฏิบัติงานจริง
- งานที่ต้องสร้างผลลัพธ์แล้วส่งลิงก์หรืออัปเดตกลับเข้าระบบ

ไม่ใช่เส้นทางหลักสำหรับ:

- งานอ่านไฟล์บน Windows เครื่อง local
- งาน GPU หรือ media render บนเดสก์ท็อป
- งานที่ต้องผูกกับ SmartSpec Desktop โดยตรง

## สิ่งที่เพิ่มในเฟสนี้

เฟสนี้ระบบเพิ่มความสามารถดังนี้:

- มีสวิตช์ระดับ tenant สำหรับเปิดใช้ external Claw workers
- มีแผง **Claw Workers** ในหน้า **Admin Monitoring**
- มีภาพรวม MCP ระดับ tenant ในหน้า **Admin Monitoring** เพื่อดู usage รวม, สาเหตุที่ถูกบล็อก, และ worker ที่ active มากที่สุดได้ในจุดเดียว
- มี personal worker ที่ผูกกับเจ้าของชัดเจน
- มีคำสั่งควบคุม worker คือ **Inspect**, **Drain**, **Disable**, **Resume** และ **Revoke**
- มีปุ่ม **Redact Legacy Data** สำหรับ cleanup ข้อมูลเก่า
- ในหน้า **Teams** ผูก external connector เข้ากับ worker ได้
- worker ที่ได้รับ delegated session สามารถเรียก SmartSpecPro gateway ในส่วนที่ job นั้นอนุญาตได้
- ตั้งงบเครดิตราย `ชั่วโมง`, `5 ชั่วโมง`, `รายวัน`, `รายสัปดาห์`, `รายเดือน` ให้ worker ได้
- worker เข้าถึง Library และ RAG ของเจ้าของได้ตาม grant
- worker ส่งผลลัพธ์กลับเข้า room, workflow history หรือ notification ได้
- ในหน้า **Credits** แยกให้เห็นรายการใช้งานผ่าน worker

## โมเดลแบบ personal worker

ค่าตั้งต้นที่สำคัญคือ:

- ผู้ใช้แต่ละคนเพิ่ม worker ของตัวเอง
- worker เป็นของเจ้าของคนนั้นเท่านั้น
- worker ไม่มีสิทธิ์ทำงานแทน user คนอื่น
- worker ข้าม tenant ไม่ได้
- admin มีไว้ดู ตรวจสอบ หรือหยุด worker เพื่อความปลอดภัย ไม่ใช่เอา worker ของคนหนึ่งไปใช้แทนอีกคน

ให้มองว่า Bound Worker คือผู้ปฏิบัติงานส่วนตัวของเจ้าของ worker คนนั้น ไม่ใช่บอทส่วนกลางของทั้ง tenant

## ก่อนเริ่มใช้งาน

ให้เช็ก 4 อย่างนี้ก่อน:

1. เปิด feature flag `openClawExternalRuntime` ในหน้า **Admin Tenants**
2. ผู้ใช้คนนั้นลงทะเบียน worker ของตัวเองเข้าระบบแล้ว
3. worker แสดงในหน้า **Admin Monitoring** และอยู่ในสถานะที่พร้อมใช้งาน
4. ถ้าทีม operator ใช้สวิตช์ระดับระบบ ให้เช็กว่า `OPENCLAW_EXTERNAL_RUNTIME_DISPATCH_ENABLED` ไม่ได้ถูกตั้งเป็น `false`

ถ้า tenant flag ยังปิดอยู่ ถึงแม้จะเห็น worker ในระบบ งานใหม่ก็ยังไม่ถูกส่งไปที่ worker ของ tenant นั้น

## ความจริงเรื่อง rollout ของ runtime

Feature 077 ทำให้ control plane รู้จัก runtime หลายสายมากขึ้น แต่ความพร้อมใช้งานจริงยังขึ้นกับแต่ละ runtime:

- `openclaw_gateway` คือเส้นทาง delegated external operator ที่เสถียรที่สุดในตอนนี้
- `desktop_zeroclaw_managed` แยกไว้สำหรับ local files, GPU, และ media jobs
- `nemoclaw_sandbox` กับ `hiclaw_cluster` ยังเป็น runtime แบบ admin-gated จนกว่าจะเปิด rollout ของตัวเอง

ดังนั้นอย่าอ่านคู่มือนี้ว่า runtime ทุกแบบรองรับ dispatch, callback, หรือ delegated session ได้เท่ากันทั้งหมด

ถ้ากำลังเปรียบเทียบสองเส้นทาง external runtime แบบ personal ให้ใช้คู่มือนี้สำหรับเส้นทาง OpenClaw ที่เสถียร และดู [Hermes Workers](./hermes-workers.md) สำหรับเส้นทาง bring-your-own Hermes

## ลำดับการตั้งค่าที่แนะนำ

1. เปิด `openClawExternalRuntime`
2. ให้ผู้ใช้ลงทะเบียน worker ของตัวเอง
3. เปิดหน้า **Admin Monitoring** แล้วเช็กว่า worker ออนไลน์
4. ไปที่หน้า **Teams** แล้วเพิ่มหรือแก้สมาชิกแบบ **External Connector**
5. กรอก 2 ช่องสำคัญให้ถูก:
   - `External Reference`: รหัสหรือชื่ออ้างอิงของ connector เช่น `openclaw://main-office`
   - `Bound Worker`: worker ที่ต้องการให้รับงานของ connector ตัวนี้
6. กดบันทึกทีม
7. เริ่ม run หรือ workflow แล้วตรวจจาก Monitoring กับ Credits อีกครั้ง

## ตอนนี้ worker ทำอะไรได้บ้าง

ถ้า worker ได้ delegated session สำหรับ job ที่รองรับ มันสามารถใช้ SmartSpecPro gateway ทำงานต่อได้ เช่น:

- เรียก LLM/chat และ responses
- รัน skill ที่รองรับ
- ใช้งาน agency หรือ swarm flow ที่รองรับ
- เรียก image, video, jobs และ presentation routes ที่รองรับ
- ค้นหา Library
- อัปโหลดไฟล์ที่อนุญาตเข้า Library
- ค้นหา RAG ของเจ้าของ worker
- ส่งอัปเดตกลับเข้า room
- ส่งอัปเดตเข้า workflow history
- ส่ง notification แจ้งเจ้าของว่าทำงานเสร็จแล้ว

จุดสำคัญ:

- worker ใช้ได้เฉพาะ route หรือ action ที่ delegated session ของ job นั้นอนุญาต
- เครดิตยังหักจากยอด SmartSpecPro ของเจ้าของ worker
- ถ้ายอดเครดิตหรือ budget guardrail ถึงเพดาน worker จะถูกบล็อกไม่ให้ใช้เส้นทาง SmartSpecPro ต่อ
- การเรียก LLM ของ delegated worker ต้องใช้ model alias ที่ SmartSpecPro อนุญาต
- ฝั่ง gateway ยังมีเพดาน concurrent call ต่อ job เพื่อกัน worker ที่มีปัญหายิงคำขอถี่เกินไป

โมเดล Bound Worker แบบนี้ยังคงเป็น owner-bound สำหรับ OpenClaw เท่านั้น ส่วน shared department worker, dedicated GPU host, และ runtime แบบ cluster จะใช้ approval และ execution semantics คนละแบบ

## worker รู้ได้อย่างไรว่ามีอะไรให้ใช้บ้าง

ให้ใช้สองอย่างคู่กัน:

- `GET /v1/openapi.json` เพื่อดูสัญญา HTTP แบบคงที่
- delegated worker manifest เพื่อดูสิ่งที่ job นั้นใช้ได้จริง

manifest จะบอกว่า:

- route family ไหนพร้อมใช้สำหรับ job นี้
- knowledge หรือ upload action ไหนได้รับอนุญาต
- callback target ไหนได้รับอนุญาต
- model alias ไหนที่ profile ของ job นี้ใช้ได้
- HTTP route จริงที่พร้อมใช้ตอนนี้มีอะไรบ้าง รวมถึง RAG ingest ถ้า job นั้นได้ grant
- ความพร้อมของ capability ว่าพร้อม จำกัด หรือยังไม่เปิด

กฎของเฟสนี้คือ:

- delegated worker ให้ใช้เส้นทาง HTTP เป็นหลัก
- delegated worker ใช้ MCP ได้เมื่อ delegated manifest ของ job นั้นระบุว่า MCP เป็น `ready`
- `/v1/mcp/catalog` ใช้ดู catalog MCP แบบคงที่ แต่ delegated manifest ยังเป็นตัวบอกความจริงของ job นั้นอยู่

## Library และ RAG

worker ใช้ความรู้ของเจ้าของได้เฉพาะเมื่อ job นั้นมี grant ให้

ตอนนี้ทำได้คือ:

- ค้นหา Library ของเจ้าของ
- อัปโหลดไฟล์ที่ระบบอนุญาตเข้า Library ของเจ้าของ
- ค้นหา RAG ของเจ้าของ
- อัปโหลดไฟล์ใหม่เข้า `POST /v1/knowledge/rag/ingest` เพื่อให้เข้า RAG ของเจ้าของ
- สั่ง re-index ไฟล์ใน Library ของเจ้าของผ่าน `POST /v1/knowledge/rag/ingest`

สิ่งที่ทำไม่ได้:

- อ่าน Library ของ user คนอื่น
- เขียนไฟล์เข้า Library ของ user คนอื่น
- ข้าม tenant

## งบเครดิตของ worker

เจ้าของสามารถตั้ง guardrail ให้ worker ได้เป็นช่วงเวลา:

- รายชั่วโมง
- ทุก 5 ชั่วโมง
- รายวัน
- รายสัปดาห์
- รายเดือน

ปล่อยช่องว่างไว้ได้ถ้าไม่ต้องการจำกัดช่วงนั้น

งบพวกนี้ใช้กับการเรียก SmartSpecPro ผ่าน worker เท่านั้น ถ้า worker ไปใช้บริการภายนอกด้วย credential ของตัวเอง ค่าใช้จ่ายส่วนนั้นยังแยกออกไปตามปกติ

นอกจาก budget แล้ว ฝั่ง SmartSpecPro ยังมีเพดาน in-flight requests ต่อ worker job ด้วย:

- งานอ่านหรือค้นหาเบา ๆ พร้อมกันได้สูงสุด 4 คำขอ
- งานกลุ่ม compute เช่น LLM, skill, agency หรือการสร้าง job พร้อมกันได้สูงสุด 2 คำขอ
- งานเริ่มต้น media ที่กินทรัพยากรสูงพร้อมกันได้สูงสุด 1 คำขอ

ถ้าเกินเพดานนี้ gateway จะปฏิเสธคำขอเพิ่ม แทนที่จะปล่อยให้ usage พุ่งแบบไม่รู้ตัว

ตั้งค่าได้จาก:

- หน้า **Teams** ระหว่างเลือก Bound Worker
- หน้า **Admin Monitoring** ตอน inspect worker

## ความหมายของปุ่มแต่ละตัวในหน้า Worker

### Inspect

เปิดดู snapshot การวินิจฉัยล่าสุดของ worker ที่ถูก redacted แล้ว

ถ้า worker ตัวนั้นมี delegated MCP activity อยู่ panel เดียวกันนี้จะแสดงเพิ่มด้วย:

- สถานะ MCP manifest ล่าสุดของ worker
- family MCP ที่ใช้ได้จริงและข้อจำกัดจาก operator
- tool ที่ถูกใช้บ่อย, สาเหตุที่ถูก deny, และ recent MCP events ของ worker ตัวนั้น

เหมาะกับการใช้ตรวจว่า:

- worker ยังรายงานสถานะเข้ามาอยู่หรือไม่
- มีข้อมูล dashboard หรือไม่
- warning flags และ summary ดูปกติหรือไม่

### Drain

หยุดรับงานใหม่ แต่ปล่อยให้งานที่กำลังรันอยู่จบก่อน

เหมาะสำหรับช่วงซ่อมบำรุง รีสตาร์ต หรือปิดเครื่องแบบคุมได้

### Disable

หยุดไม่ให้ worker ถูกใช้งาน

ใช้เมื่ออยากพัก worker ไว้ก่อนจนกว่าแอดมินจะกลับมาเปิดอีกครั้ง

### Resume

เปิดให้ worker ที่เคยถูก drain หรือ disable กลับมารับงานได้อีกครั้ง

ใช้หลังซ่อมบำรุงหรือหลังแก้ปัญหาชั่วคราวเสร็จแล้ว

### Revoke

ยกเลิกความน่าเชื่อถือของการลงทะเบียน worker ตัวปัจจุบัน

ใช้เมื่อไม่ต้องการให้ worker ตัวนั้นทำงานแทน tenant นี้อีกต่อไป หลายกรณีจะต้องลงทะเบียนใหม่หลัง revoke

### Redact Legacy Data

ใช้ cleanup ข้อมูลวินิจฉัยและ metadata ของ artifact ที่ถูกเก็บไว้ตั้งแต่ก่อนกฎ redaction รุ่นปัจจุบัน

ควรใช้เมื่อ:

- environment นี้เคยมีข้อมูล worker จาก build เก่า
- เปิดฟีเจอร์นี้หลังจากเคยทดลองใช้งานมาก่อน
- ต้องการล้างข้อมูล worker เก่าของ tenant นี้ให้ตรงกับกฎความเป็นส่วนตัวปัจจุบัน

ปุ่มนี้เป็นงาน cleanup เป็นครั้งคราว ไม่ใช่งานที่ต้องกดทุกวัน

## หน้า Teams: ต้องกรอกอะไรบ้าง

เมื่อเพิ่มสมาชิกแบบ **External Connector** ในหน้า **Teams** จะมี 2 ช่องที่สำคัญที่สุด:

- `External Reference`: ใช้ระบุว่า connector นี้คือใคร
- `Bound Worker`: ใช้ระบุว่า worker ตัวไหนต้องเป็นคนรับงาน

จำง่าย ๆ:

- **External Reference** = ตัวอ้างอิงของ connector
- **Bound Worker** = worker ที่จะรับงานจริง

ถ้าปล่อย **Bound Worker** ว่างไว้ งานที่ต้องใช้ connector นี้อาจ pause หรือยังทำต่อไม่ได้จนกว่าจะผูก worker ให้เรียบร้อย

## จุดสำคัญ: Bound Worker อย่างเดียวไม่ได้ให้สิทธิ์ทุกอย่าง

`Bound Worker` ใช้เลือก worker แต่สิทธิ์จริงจะมาจาก delegated session ของ job นั้น

ดังนั้นการ bind อย่างเดียวไม่ได้แปลว่า:

- เรียกได้ทุก API
- ใช้ได้ทุก skill
- เข้าถึงข้อมูลของ user คนอื่นได้
- ข้าม tenant ได้
- กลายเป็น web login แบบใช้งานได้ทุกอย่าง
- ใช้ MCP ได้ทุก tool แบบอัตโนมัติ

worker ใช้ได้เฉพาะสิ่งที่ delegated job manifest และ grants ระบุให้เท่านั้น

อีกจุดที่ควรรู้คือ path นี้ใช้กับ **OpenClaw gateway worker** เท่านั้น ยังไม่ใช่การ bind ZeroClaw desktop runtime, NemoClaw sandbox, หรือ HiClaw cluster runtime แบบเดียวกัน

## หน้า Monitoring: ควรดูอะไรก่อน

ในแผง **Claw Workers** ของหน้า **Admin Monitoring** ให้ดู 5 อย่างก่อน:

- สถานะของ worker
- เวลา last seen
- จำนวนงานที่กำลังรัน
- จำนวน connector ที่ผูกกับ worker ตัวนั้น
- มี diagnostics ให้ดูหรือไม่

ถ้าเห็น worker แต่ไม่มีงานเข้า สาเหตุที่เจอบ่อยคือ:

- tenant flag ยังปิดอยู่
- worker อยู่สถานะ drained, disabled หรือ revoked
- ไปผูก worker ผิดตัวในหน้า Teams
- operator ปิด dispatch ระดับระบบไว้

## หน้า Credits: ดูรายการอย่างไร

ในหน้า **Credits** รายการใช้งานผ่าน worker จะขึ้นเป็น:

- `Worker Runtime` ถ้าใช้ UI ภาษาอังกฤษ
- `รันผ่าน Worker` ถ้าใช้ UI ภาษาไทย

จุดนี้ช่วยให้ดูออกว่างานนั้นวิ่งผ่านเส้นทาง external worker ไม่ใช่ chat ปกติหรือ media path แบบอื่น

ถ้าภายหลัง worker ไปเรียก public media API โดยตรง รายการเครดิตของ media จะถูกบันทึกแยกตามเส้นทาง media/API ไม่ได้ถูกรวมเป็นรายการเดียวกับการ bind worker

## สถานะจริงของ API และ MCP ตอนนี้

สถานะปัจจุบันคือ:

- delegated worker ใช้เส้นทาง HTTP gateway ที่รองรับได้จริงและหักเครดิตถูกต้องเมื่อ route นั้นได้รับอนุญาต
- Library search, Library upload และ RAG search ใช้งานได้ผ่าน delegated HTTP path
- delegated worker MCP ใช้ได้แล้วแบบจำกัดตาม grant และ namespace สำหรับ tool family ที่รองรับ เช่น gateway, knowledge, skills, agencies, media, jobs, presentations และ video projects

สรุปง่าย ๆ:

- ถ้าเป็น delegated worker ตอนนี้ ให้เริ่มจาก HTTP gateway ก่อน และใช้ MCP เมื่อ delegated manifest ระบุว่า MCP พร้อมใช้สำหรับ job นั้น
- อย่าถือว่าแค่ตั้ง `Bound Worker` แล้วจะใช้ฟังก์ชันของแพลตฟอร์มได้ทุกอย่างเอง

## เช็กลิสต์สั้น ๆ ก่อนบอกว่าใช้งานได้แล้ว

- เปิด `openClawExternalRuntime` แล้ว
- worker ออนไลน์ใน **Admin Monitoring**
- worker เป็นของผู้ใช้ที่ถูกต้อง
- ทีมเลือก **Bound Worker** ถูกตัว
- ตั้ง budget caps แล้วถ้าต้องการคุมการใช้เครดิต
- หน้า **Credits** แสดงรายการใช้งานผ่าน worker ตามที่คาดไว้
- ถ้า tenant นี้เคยมีข้อมูล worker เก่า ให้กด **Redact Legacy Data** อย่างน้อยหนึ่งครั้ง

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
