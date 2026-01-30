---
name: ultrathink
description: ใช้ UltraThink (MCP tool) เพื่อแตกโจทย์เป็นลำดับขั้น พร้อม confidence/assumption tracking/branching แล้วสรุปเป็นคำตอบที่ตรวจสอบได้
license: MIT
compatibility: claude-code, opencode
metadata:
  repo: https://github.com/husniadil/ultrathink
  interface: mcp
  tool: ultrathink
argument-hint: "[task-or-question]"
disable-model-invocation: true
---

# UltraThink (MCP) Skill

ใช้ skill นี้เมื่ออยาก “คิดแบบเป็นขั้นตอน” ให้ตรวจสอบย้อนกลับได้ เช่น ออกแบบสถาปัตยกรรม, debug ปัญหาซับซ้อน, วางแผนงาน, วิเคราะห์ trade-off, หรือสรุปทางเลือกหลายแบบ

> หมายเหตุ: การมีคำว่า **ultrathink** ในเนื้อหา skill ช่วยเปิด *extended thinking* ของ Claude Code ได้ด้วย (คนละอย่างกับ MCP server แต่ใช้ร่วมกันได้)

## ใช้งานเร็ว

- Claude Code: `/ultrathink <งาน/คำถาม>`
- OpenCode: โหลด skill `ultrathink` แล้วส่งต่อโจทย์เดียวกัน

---

## วิธีทำงาน (เมื่อมี MCP tool `ultrathink` อยู่แล้ว)

1. **ยืนยันว่า tool พร้อมใช้งาน**  
   - ถ้าในเครื่องมือ (MCP tools) มี tool ชื่อ `ultrathink` ให้ใช้ workflow นี้ทันที  
   - ถ้าไม่มี ให้ไปที่หัวข้อ “ตั้งค่า UltraThink MCP” ด้านล่าง

2. **ตั้งค่าเริ่มต้น**
   - ทวนโจทย์สั้น ๆ + ระบุสิ่งที่ต้องส่งมอบ
   - ตั้ง `total_thoughts` แบบประมาณการ (เช่น 5–12 แล้วแต่ความซับซ้อน)

3. **เรียก tool แบบวนลูปทีละ thought**
   - ส่ง `thought` สั้น กระชับ (1–4 ประโยค)
   - ใส่ `confidence` (0.0–1.0) เมื่อเหมาะสม
   - ถ้ามี “สิ่งที่กำลังเดา/ยังไม่ชัวร์” ให้ใส่ `assumptions`, `uncertainty_notes`
   - ถ้าต้องแก้ความคิดเดิม ให้ใช้ `is_revision: true` + `revises_thought`
   - ถ้าต้องแยกทางเลือก ให้ใช้ `branch_from_thought` + `branch_id`

4. **หยุดเมื่อจบ**
   - หยุดเมื่อ `next_thought_needed` เป็น `false` หรือคิดครบตาม `total_thoughts`
   - ปิดงานด้วย “คำตอบสุดท้าย” + สรุป assumption สำคัญ/assumption ที่เสี่ยง (ถ้ามี)

---

## ตัวอย่าง payload ที่แนะนำ

### Thought แรก (เริ่ม session ใหม่)

```json
{
  "thought": "ฉันจะเริ่มแยกโจทย์เป็นส่วน ๆ และระบุสิ่งที่ต้องตัดสินใจ",
  "total_thoughts": 7,
  "confidence": 0.6,
  "uncertainty_notes": "ยังไม่รู้ข้อจำกัดด้านเวลา/งบ/ระบบเดิม",
  "assumptions": [
    {
      "id": "A1",
      "text": "มีสิทธิ์แก้โค้ดและเพิ่ม dependency ได้",
      "confidence": 0.7,
      "critical": true,
      "verifiable": true
    }
  ]
}
```

### Thought ถัดไป (ใช้ session เดิม)

```json
{
  "session_id": "<ใช้ session_id จาก response ก่อนหน้า>",
  "thought": "ตรวจโครงสร้าง repo และจุดเชื่อมต่อที่ต้องปรับเพื่อให้ทำงานได้",
  "total_thoughts": 7,
  "confidence": 0.75
}
```

### Branch (สำรวจทางเลือก)

```json
{
  "session_id": "<session_id เดิม>",
  "thought": "ลองพิจารณาทางเลือก B เพื่อเทียบ trade-off",
  "total_thoughts": 8,
  "branch_from_thought": 2,
  "branch_id": "option-b",
  "confidence": 0.65
}
```

---

## ตั้งค่า UltraThink MCP (ถ้ายังไม่มี tool `ultrathink`)

### ทางเลือก A: Claude Code (ง่ายสุด) ติดตั้ง Plugin

ถ้าใช้ Claude Code และต้องการ “ติดตั้งง่าย/ทีมใช้เหมือนกัน” ให้ติดตั้ง plugin ที่มี UltraThink อยู่แล้ว:

```bash
claude plugin marketplace add husniadil/ekstend
claude plugin install ultrathink@ekstend
```

จากนั้นรีสตาร์ท Claude Code แล้วตรวจด้วย `/mcp` ว่าเห็นเครื่องมือจาก UltraThink

### ทางเลือก B: Claude Code เพิ่ม MCP server (project scope)

ใช้คำสั่งเพิ่ม local stdio server:

```bash
# ต้องมี uv/uvx ในเครื่อง
claude mcp add --transport stdio --scope project ultrathink --   uvx --from git+https://github.com/husniadil/ultrathink ultrathink
```

หรือจะสร้างไฟล์ `.mcp.json` ที่ root โปรเจกต์เองก็ได้ (project scope):

```json
{
  "mcpServers": {
    "UltraThink": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/husniadil/ultrathink", "ultrathink"],
      "env": { "DISABLE_THOUGHT_LOGGING": "false" }
    }
  }
}
```

### OpenCode เพิ่ม MCP server (ผ่าน opencode.jsonc)

เพิ่มใน `opencode.jsonc` ภายใต้ `mcp`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "ultrathink": {
      "type": "local",
      "command": ["uvx", "--from", "git+https://github.com/husniadil/ultrathink", "ultrathink"],
      "enabled": true,
      "environment": { "DISABLE_THOUGHT_LOGGING": "false" }
    }
  }
}
```

---

## Output ที่ควรส่งกลับผู้ใช้เสมอ (หลังจบ)

- คำตอบสุดท้าย / แผนที่แนะนำ / patch ที่ต้องการ (ตามโจทย์)
- ข้อสมมติฐานสำคัญ (assumptions) + ข้อไหนเสี่ยง/ต้องตรวจ
- ถ้าต้องทำต่อ: ระบุ `session_id` ที่จะใช้ต่อ
