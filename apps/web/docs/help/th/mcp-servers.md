---

aliases:
  - "mcp-servers"
  - "การเชื่อมต่อ MCP Server"
  - "การเชื่อมต่อ MCP Server help"
tags:
  - "help"
  - "help/th"
  - "help/knowledge"
  - "knowledge"
  - "mcp-servers"
---
# การเชื่อมต่อ MCP Server

## ภาพรวม

SmartSpecPro รองรับการเชื่อมต่อกับ MCP (Model Context Protocol) Server ภายนอก ทำให้ AI Agent สามารถใช้เครื่องมือจากบริการของบุคคลที่สามได้

## การเพิ่ม MCP Server

ไปที่ **Admin > MCP Servers** แล้วคลิก **Add Server**

### ประเภท Transport

| Transport | คำอธิบาย | กรณีใช้งาน |
|-----------|----------|-----------|
| **HTTP** | JSON-RPC มาตรฐานผ่าน HTTP/HTTPS | ทั่วไปที่สุด ใช้ได้กับ MCP Server ทุกตัว |
| **Streamable HTTP** | SSE transport พร้อมจัดการ session | สำหรับ streaming response แบบ real-time |
| **stdio** | ทำงานผ่าน OpenSandbox container | สำหรับเครื่องมือ CLI ที่ทำงานเป็นโปรเซส |

### ตั้งค่า HTTP Server

1. กรอก URL ของ server (เช่น `https://mcp.example.com`)
2. เพิ่ม Bearer token สำหรับยืนยันตัวตน (ถ้าจำเป็น)
3. คลิก **Test Connection** เพื่อทดสอบการเชื่อมต่อ
4. เปิดใช้งาน server เพื่อให้ agent ใช้เครื่องมือได้

### การเชื่อมต่อ OAuth

สำหรับ server ที่ต้องใช้ OAuth 2.1:
1. คลิก **Connect with OAuth** บนการ์ด server
2. คุณจะถูกส่งไปยังหน้ายืนยันสิทธิ์ของผู้ให้บริการ
3. หลังอนุญาตแล้ว จะกลับมาที่ SmartSpecPro
4. Token จะถูกเข้ารหัสอย่างปลอดภัยและรีเฟรชอัตโนมัติ

### ตั้งค่า stdio Server

ต้องเปิดใช้งาน OpenSandbox ก่อน server จะทำงานใน container แยก:
1. ระบุคำสั่ง (เช่น `npx`)
2. เพิ่ม arguments (เช่น `@modelcontextprotocol/server-github`)
3. ตั้งค่า environment variables (ข้อมูลลับจะถูกเข้ารหัส)
4. Container ไม่มีการเข้าถึงเครือข่ายเพื่อความปลอดภัย

## เครื่องมือปรากฏใน Agent อย่างไร

เมื่อ MCP server เปิดใช้งานและถูกกำหนดให้กับ agency/agent:
- เครื่องมือจาก server จะปรากฏในรายการเครื่องมือของ agent
- Agent สามารถเรียกใช้ได้ระหว่างการสนทนา
- การเรียกเครื่องมือจะถูกบันทึกใน audit trail
- ค่าใช้จ่ายเครดิตจะถูกติดตามต่อการเรียกใช้

## การตรวจสอบสุขภาพ

สถานะสุขภาพของแต่ละ server แสดงบนหน้า MCP Servers:
- **Healthy**: Server ตอบสนองปกติ
- **Degraded**: Server ช้าแต่ยังทำงานได้
- **Unhealthy**: Server ไม่ตอบสนอง

## การแก้ปัญหา

### การเชื่อมต่อถูกปฏิเสธ
- ตรวจสอบ URL ของ server ว่าถูกต้องและเข้าถึงได้
- ตรวจสอบว่า server ต้องการยืนยันตัวตนหรือไม่
- ตรวจสอบว่า IP ของ server ไม่อยู่ในช่วงที่ถูกบล็อก

### OAuth Token หมดอายุ
- คลิก **Reconnect** บนการ์ด server เพื่อรีเฟรช OAuth
- ตรวจสอบว่าผู้ให้บริการ OAuth ไม่ได้เพิกถอนสิทธิ์

### stdio Server ใช้ไม่ได้
- ตรวจสอบว่าเปิดใช้งาน OpenSandbox แล้ว (`OPENSANDBOX_ENABLED=true`)
- ตรวจสอบจำนวน container สูงสุดต่อ tenant (ค่าเริ่มต้น: 2)

## ความปลอดภัย

- URL ของ server ทุกตัวผ่านการตรวจสอบ SSRF (IP ภายในถูกบล็อก)
- ป้องกัน DNS rebinding สำหรับการเชื่อมต่อ HTTP
- OAuth token ถูกเข้ารหัสด้วย AES-256-GCM
- stdio container ทำงานโดยไม่มีการเข้าถึงเครือข่าย
- ขนาด response จำกัดที่ 1MB ต่อการเรียกเครื่องมือ
- การเรียกเครื่องมือทั้งหมดถูกบันทึกใน audit log

<!-- knowledge-graph:related:start -->
## หัวข้อที่เกี่ยวข้อง

- [[document-management|จัดการเอกสาร]]
- [[getting-started|เริ่มต้นใช้งาน]]
- [[chat|คู่มือ Chat]]
- [[memory|ระบบ Memory]]
- [[personas|บุคลิก AI]]
<!-- knowledge-graph:related:end -->
