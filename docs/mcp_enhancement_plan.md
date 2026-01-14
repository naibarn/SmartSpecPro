# แผนการพัฒนา MCP Server Enhancement

**เอกสารนี้จัดทำโดย:** Manus AI  
**วันที่:** 14 มกราคม 2026

## 1. บทนำ

เอกสารฉบับนี้สรุปแผนการพัฒนาเพื่อเพิ่มขีดความสามารถ (Enhancement) ของ `media_mcp_server.py` ในโปรเจกต์ SmartSpecPro โดยมีเป้าหมายหลักเพื่อเปลี่ยนจากโครงสร้างพื้นฐาน (Stub) ที่มีอยู่ ให้เป็นเซิร์ฟเวอร์ที่ทำงานได้อย่างสมบูรณ์ สามารถเชื่อมต่อกับ Backend API, วิเคราะห์ไฟล์ `spec.md` เพื่อสร้าง Assets ที่จำเป็น และจัดการไฟล์สื่อได้อย่างเป็นระบบอัตโนมัติ

## 2. สถาปัตยกรรมที่นำเสนอ

MCP Server จะทำหน้าที่เป็นตัวกลาง (Orchestrator) ระหว่างผู้ใช้ (ผ่าน Desktop App หรือ CLI) และ Backend API โดยมีสถาปัตยกรรมการทำงานดังนี้:

```mermaid
graph TD
    subgraph "User Interface (Desktop App / CLI)"
        A[User Command: "/generate assets from spec"]
    end

    subgraph "MCP Server (media_mcp_server.py)"
        B(MCP Client)
        C{MCP Tools}
        D[1. analyze_spec_for_assets]
        E[2. generate_asset]
        F[3. save_asset_to_project]
    end

    subgraph "Python Backend (FastAPI)"
        G[Media Generation API]
        H[/api/v1/media/image]
        I[/api/v1/media/video]
        J[/api/v1/media/audio]
    end

    subgraph "External Services"
        K[Kie.ai Media Generation]
    end

    subgraph "Project File System"
        L[spec.md]
        M[assets/]
    end

    A --> B
    B -- "call_tool('analyze_spec...')" --> D
    D -- Reads --> L
    D -- Returns asset list --> B
    B -- Iterates & calls 'generate_asset' --> E
    E -- HTTP POST --> G
    G -- Proxies to --> K
    K -- Returns media URL --> E
    E -- Returns URL --> B
    B -- "call_tool('save_asset...')" --> F
    F -- Downloads from URL & saves to --> M
```

**คำอธิบายแผนภาพ:**
1.  ผู้ใช้สั่งการผ่าน UI เพื่อให้สร้าง Assets จากไฟล์ `spec.md`
2.  MCP Server เรียกใช้ Tool `analyze_spec_for_assets` เพื่ออ่านและวิเคราะห์ `spec.md` และดึงรายการ Assets ที่ต้องสร้าง
3.  MCP Server วนลูปรายการ Assets และเรียกใช้ Tool `generate_asset` สำหรับแต่ละรายการ
4.  `generate_asset` จะส่งคำขอ HTTP POST ไปยัง Backend API ที่เหมาะสม (image, video, audio)
5.  Backend API (ผ่าน LLMGateway) จะเรียกใช้ Kie.ai เพื่อสร้างสื่อ และส่ง URL ของสื่อกลับมา
6.  MCP Server เรียกใช้ Tool `save_asset_to_project` เพื่อดาวน์โหลดไฟล์จาก URL และบันทึกลงในโฟลเดอร์ `assets/` ของโปรเจกต์

## 3. MCP Tools ที่ต้องพัฒนา

เราจะปรับปรุงและเพิ่ม Tools ใน `media_mcp_server.py` ดังนี้:

| Tool Name | Description | Input Schema | Output | สถานะ |
| :--- | :--- | :--- | :--- | :--- |
| `analyze_spec_for_assets` | วิเคราะห์ไฟล์ `spec.md` เพื่อค้นหาและดึงรายการ Assets ที่ต้องสร้าง (เช่น รูปภาพ, วิดีโอ) | `{"spec_path": "string"}` | `[{"asset_type": "string", "prompt": "string", "filename": "string"}]` | **สร้างใหม่** |
| `generate_asset` | เรียกใช้ Backend API เพื่อสร้างสื่อ (Image, Video, Audio) ตาม Prompt ที่ได้รับ | `{"asset_type": "string", "prompt": "string", "model": "string"}` | `{"media_url": "string"}` | **ปรับปรุง** |
| `save_asset_to_project` | ดาวน์โหลดไฟล์สื่อจาก URL และบันทึกลงในโฟลเดอร์ `assets/` ของโปรเจกต์ | `{"media_url": "string", "filename": "string"}` | `{"file_path": "string"}` | **สร้างใหม่** |

## 4. ขั้นตอนการดำเนินงาน (Implementation Steps)

### ขั้นตอนที่ 1: ตั้งค่าสภาพแวดล้อมและ Dependencies

1.  **ติดตั้ง Libraries:** เพิ่ม `httpx` สำหรับการทำ HTTP requests ใน `python-backend/requirements.txt` และติดตั้งในสภาพแวดล้อม
    ```bash
    uv pip install httpx
    ```
2.  **Refactor MCP Server:** ปรับ `media_mcp_server.py` ให้ใช้ `FastMCP` จาก `mcp.server.fastmcp` เพื่อให้ง่ายต่อการพัฒนาและจัดการ Context

### ขั้นตอนที่ 2: พัฒนา Tool `generate_asset`

1.  **แก้ไข `handle_call_tool`:** ปรับ Logic ของ `generate_project_asset` (เปลี่ยนชื่อเป็น `generate_asset`)
2.  **ใช้ `httpx`:** สร้าง `httpx.AsyncClient` เพื่อส่ง POST request ไปยัง Backend API endpoints:
    - `http://localhost:8000/api/v1/media/image`
    - `http://localhost:8000/api/v1/media/video`
    - `http://localhost:8000/api/v1/media/audio`
3.  **จัดการ Response:** ดึง `url` จาก JSON response ที่ได้รับจาก Backend และส่งคืนเป็นผลลัพธ์ของ Tool

### ขั้นตอนที่ 3: พัฒนา Tool `analyze_spec_for_assets`

1.  **เพิ่ม Tool ใหม่:** สร้างฟังก์ชันสำหรับ `analyze_spec_for_assets`
2.  **Logic การอ่านไฟล์:** อ่านเนื้อหาจาก `spec_path` ที่ระบุ
3.  **Parsing Logic:** ใช้ Regular Expressions (Regex) หรือวิธีการแยกวิเคราะห์ข้อความแบบง่าย เพื่อค้นหารูปแบบที่บ่งชี้ถึง Asset ที่ต้องการ เช่น:
    ```markdown
    ![ภาพประกอบหน้า Login](assets/login_illustration.png "model: google-nano-banana-pro, prompt: a minimalist illustration of a secure login screen")
    ```
4.  **คืนค่ารายการ:** จัดรูปแบบข้อมูลที่ดึงได้ให้อยู่ในรูปแบบ List ของ Dictionaries ตามที่กำหนดใน Output Schema

### ขั้นตอนที่ 4: พัฒนา Tool `save_asset_to_project`

1.  **เพิ่ม Tool ใหม่:** สร้างฟังก์ชันสำหรับ `save_asset_to_project`
2.  **ดาวน์โหลดไฟล์:** ใช้ `httpx` เพื่อดาวน์โหลดเนื้อหาไฟล์จาก `media_url`
3.  **บันทึกไฟล์:** สร้างโฟลเดอร์ `assets/` หากยังไม่มี และบันทึกไฟล์ที่ดาวน์โหลดลงในนั้นโดยใช้ `filename` ที่ระบุ
4.  **คืนค่า Path:** ส่งคืน Local path ของไฟล์ที่บันทึกสำเร็จ

## 5. กลยุทธ์การทดสอบ

1.  **Unit Testing:** สร้างไฟล์ทดสอบสำหรับแต่ละ Tool เพื่อให้แน่ใจว่าทำงานได้อย่างถูกต้อง
    - `test_analyze_spec`: ทดสอบด้วย `spec.md` ตัวอย่างหลายๆ รูปแบบ
    - `test_generate_asset`: Mock HTTP requests เพื่อทดสอบการเรียก API และการจัดการ Response
    - `test_save_asset`: Mock การดาวน์โหลดไฟล์และตรวจสอบว่าไฟล์ถูกบันทึกถูกต้อง
2.  **Integration Testing:** ทดสอบการทำงานร่วมกันของทุก Tools โดยสร้าง `spec.md` ทดสอบขึ้นมา และเรียกใช้ Workflow ทั้งหมดตั้งแต่ต้นจนจบ เพื่อตรวจสอบว่า Asset ถูกสร้างและบันทึกในโปรเจกต์อย่างถูกต้อง

## 6. อ้างอิง

[1] modelcontextprotocol/python-sdk. (n.d.). *GitHub*. Retrieved January 14, 2026, from https://github.com/modelcontextprotocol/python-sdk
