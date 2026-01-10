# SmartSpecPro - Bug Fixes Summary

## วันที่แก้ไข: 10 มกราคม 2026

---

## 1. แก้ไขปัญหาการตัดเครดิต (Credit Deduction)

### ปัญหาเดิม
- `UnifiedLLMClient._convert_to_llm_response()` ตั้งค่า `cost=None` เสมอ
- ทำให้ condition `if user and response.cost and response.cost > 0:` ใน `openai_compat.py` ไม่ผ่าน
- ผลลัพธ์: ไม่มีการตัดเครดิตแม้จะใช้งาน LLM

### Root Cause
1. OpenRouter API สามารถส่ง cost กลับมาได้ แต่ต้องเปิด **Usage Accounting** โดยส่ง `usage: { include: true }` ใน request
2. Code เดิมไม่ได้ส่ง parameter นี้
3. Code เดิมไม่ได้ดึง cost จาก response.usage.cost

### การแก้ไข

#### ไฟล์ที่แก้ไข:

**1. `python-backend/app/llm_proxy/openrouter_wrapper.py`**
- เพิ่ม parameter `include_usage: bool = True` ใน `_build_extra_body()`
- เพิ่มการส่ง `usage: { include: true }` ใน extra_body

```python
def _build_extra_body(
    self,
    # ... other params ...
    include_usage: bool = True  # NEW
) -> Dict[str, Any]:
    extra_body = {}
    
    # Enable usage accounting to get cost information
    if include_usage:
        extra_body["usage"] = {"include": True}  # NEW
```

**2. `python-backend/app/llm_proxy/unified_client.py`**
- แก้ไข `_convert_to_llm_response()` ให้ดึง cost จาก OpenRouter response
- OpenRouter คืนค่า cost เป็น credits (1 credit = $0.000001 USD)
- เพิ่ม fallback ให้ estimate cost จาก tokens ถ้าไม่มี cost จาก API

```python
def _convert_to_llm_response(self, response: Any) -> LLMResponse:
    # OpenRouter returns cost in credits (1 credit = $0.000001 USD)
    openrouter_cost = getattr(response.usage, 'cost', None)
    if openrouter_cost is not None:
        cost = float(openrouter_cost) * 0.000001  # Convert to USD
    
    # Fallback: estimate from tokens if no cost from API
    if cost is None and prompt_tokens and completion_tokens:
        cost = float(self.estimate_cost(model_name, prompt_tokens, completion_tokens))
```

### ผลลัพธ์
- ✅ OpenRouter จะส่ง cost กลับมาใน response.usage.cost
- ✅ Cost จะถูกแปลงเป็น USD และใช้ในการตัดเครดิต
- ✅ มี fallback ให้ estimate cost จาก tokens ถ้า API ไม่ส่ง cost

---

## 2. แก้ไขหน้า Terminal (KiloPty)

### ปัญหาเดิม
- PTY Manager ใช้ `ss_autopilot.cli_enhanced` ซึ่งอาจไม่มีอยู่
- ไม่รองรับ interactive shell
- UI ยังไม่สมบูรณ์ (ไม่มี connection status, error handling)

### การแก้ไข

#### ไฟล์ที่แก้ไข:

**1. `python-backend/app/kilo/pty_manager.py`**
- เพิ่ม `_get_shell()` สำหรับหา default shell
- เพิ่ม `_build_command()` รองรับ:
  - Empty command → Interactive shell
  - Shell commands → Execute via shell
  - Workflow files (*.md) → Execute via ss_autopilot (ถ้ามี)
- เพิ่ม `resize()` สำหรับ resize terminal
- เพิ่ม `kill()` สำหรับ force kill session
- เพิ่ม `list_sessions()` สำหรับ list active sessions
- เพิ่ม `cleanup_session()` สำหรับ cleanup completed sessions
- ปรับปรุง terminal settings (TERM, COLORTERM, terminal size)

**2. `python-backend/app/api/kilo_pty.py`**
- เพิ่ม REST endpoints:
  - `GET /api/v1/kilo/pty/sessions` - List sessions
  - `DELETE /api/v1/kilo/pty/sessions/{session_id}` - Cleanup session
- เพิ่ม WebSocket message types:
  - `resize` - Resize terminal
  - `kill` - Force kill session
- ปรับปรุง error handling

**3. `desktop-app/src/services/pty.ts`**
- เพิ่ม functions:
  - `ptyResize()` - Resize terminal
  - `ptyKill()` - Force kill session
  - `listPtySessions()` - List sessions via REST
  - `cleanupPtySession()` - Cleanup session via REST

**4. `desktop-app/src/pages/KiloPty.tsx`**
- เพิ่ม connection status indicator (connected/connecting/disconnected/error)
- เพิ่ม auto-reconnect (3 วินาที)
- เพิ่ม error message display
- ปรับปรุง UI:
  - Tab status colors
  - Close button per tab
  - Empty command = interactive shell
  - Enter key to create session
- ปรับปรุง keyboard shortcuts

**5. `desktop-app/src/components/PtyXterm.tsx`**
- เพิ่ม `onResize` callback
- ปรับปรุง terminal theme (dark theme)
- เพิ่ม debounced resize
- ปรับปรุง initialization timing

### ผลลัพธ์
- ✅ รองรับ interactive shell (bash/sh)
- ✅ รองรับ shell commands ทั่วไป
- ✅ รองรับ workflow files (*.md) ถ้ามี ss_autopilot
- ✅ มี connection status และ auto-reconnect
- ✅ มี error handling ที่ดีขึ้น
- ✅ รองรับ terminal resize
- ✅ UI ใช้งานง่ายขึ้น

---

## ไฟล์ที่แก้ไขทั้งหมด

| ไฟล์ | การเปลี่ยนแปลง |
|------|---------------|
| `python-backend/app/llm_proxy/openrouter_wrapper.py` | เพิ่ม usage accounting |
| `python-backend/app/llm_proxy/unified_client.py` | แก้ไข cost extraction |
| `python-backend/app/kilo/pty_manager.py` | ปรับปรุง PTY management |
| `python-backend/app/api/kilo_pty.py` | เพิ่ม endpoints และ message types |
| `desktop-app/src/services/pty.ts` | เพิ่ม functions |
| `desktop-app/src/pages/KiloPty.tsx` | ปรับปรุง UI |
| `desktop-app/src/components/PtyXterm.tsx` | เพิ่ม resize และ theme |

---

## การทดสอบ

### Credit Deduction
1. เรียก LLM ผ่าน `/v1/chat/completions` endpoint
2. ตรวจสอบ log ว่ามี `openrouter_cost_extracted` หรือ `cost_estimated_from_tokens`
3. ตรวจสอบว่า credits ถูกหักจาก user account

### Terminal (KiloPty)
1. เปิดหน้า Terminal
2. ตรวจสอบ connection status (ควรเป็น "Connected")
3. กด "New Tab" โดยไม่ใส่ command → ควรเปิด interactive shell
4. ลองพิมพ์ command เช่น `ls -la`, `echo hello`
5. ลอง Ctrl+C เพื่อ interrupt
6. ลองปิด tab

---

## หมายเหตุ

- OpenRouter cost อาจมี delay เล็กน้อย (few hundred milliseconds) เนื่องจากต้องคำนวณ token counts
- Terminal ต้องการ backend server ที่รันอยู่
- Interactive shell ต้องการ POSIX system (Linux/macOS) สำหรับ PTY support เต็มรูปแบบ
