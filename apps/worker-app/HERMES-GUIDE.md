# Hermes agent — คู่มือใช้งานจาก Worker App

เอกสารนี้ตอบจากพฤติกรรมจริงของ `hermes-agent` ที่ติดตั้งอยู่ (ตรวจสอบด้วย
`hermes --help` / `hermes auth --help` / `hermes model --help` เมื่อ 2026-07-31)
ไม่ใช่จากการคาดเดา

## 1. เปิด Hermes TUI

แท็บ **Hermes agents** → ปุ่ม **Open Hermes TUI**

TUI ต้องการ tty จริง แอปจึงเปิด **หน้าต่างเทอร์มินัลแยก** ให้ ไม่ได้ฝังไว้ในแอป
(Windows ใช้ `cmd /K`, macOS ใช้ Terminal.app, Linux ใช้ `x-terminal-emulator`)

ถ้าเปิดอัตโนมัติไม่ได้ (เครื่องล็อกดาวน์ / ไม่มี terminal emulator) แอปจะ**แสดงคำสั่งเต็ม**
ให้คัดลอกไปรันเอง เช่น:

```bash
"C:\Users\<you>\AppData\Roaming\...\hermes-runtime\hermes.exe" --tui
```

## 2. Grok chat

แท็บเดียวกัน → ปุ่ม **Open Grok chat** (รัน `hermes chat` — "Interactive chat with the agent")

`hermes chat` เป็นโหมดคุยโต้ตอบเต็มรูปแบบ ต่างจากที่ worker ใช้ทำงานเบื้องหลัง
ซึ่งเป็นโหมด non-interactive:

```bash
hermes -z <envelope> --provider xai-oauth --model grok-build-0.1 --toolsets <...> --ignore-rules
```

## 3. ต้อง login ไหม — ต้อง

Hermes ต้องมี credential ของ provider ก่อนใช้งาน แอปแสดงสถานะให้ในแท็บ Hermes:

| ช่อง | ความหมาย |
|---|---|
| **xAI / Grok sign-in** | `Signed in` / `Not signed in` — อ่านจาก `hermes auth list` |
| **Providers with credentials** | จำนวน provider ที่มี credential พร้อมใช้ |

### วิธี login

ใน terminal ที่เปิดจากปุ่ม TUI:

```bash
hermes auth add xai-oauth --no-browser
```

จะได้ **device code** ให้เอาไปกรอกที่หน้าเว็บของ xAI (เป็นวิธีเดียวกับที่ระบบใช้อยู่แล้ว
ตอน authorize จากฝั่งเว็บ) เสร็จแล้วตรวจสถานะ:

```bash
hermes auth status xai-oauth
hermes auth list
```

คำสั่งอื่นที่เกี่ยวข้อง: `hermes login`, `hermes logout`, `hermes auth remove`

## 4. ใช้ LLM ผ่าน smartaihub.app gateway ได้ไหม — **ยังไม่ได้**

ตรวจแล้วพบว่า **ไม่รองรับในตอนนี้** เหตุผลตามข้อเท็จจริง:

- `hermes gateway` **ไม่ใช่ LLM gateway** — เป็น *messaging* gateway (Telegram,
  Discord, WhatsApp, Weixin) คนละเรื่องกัน
- `hermes model --inference-url <URL>` มีอยู่จริง แต่ help ระบุชัดว่าเป็น
  *"Inference API base URL for **Nous login**"* — ผูกกับ OAuth ของ Nous
  ไม่ใช่ตัวเลือก base URL แบบ OpenAI-compatible ทั่วไป
- `hermes config show` ไม่มีคีย์ `base_url` / `api_base` สำหรับ provider
  ที่จะชี้ไปเซิร์ฟเวอร์ของเราได้
- env ที่ hermes อ่านมีแค่ `HERMES_ACCEPT_HOOKS` และ `HERMES_INFERENCE_MODEL`
  — ไม่มีตัวกำหนด endpoint

**สรุป:** ทราฟฟิก LLM ของ Hermes วิ่งจากเครื่อง worker **ตรงไปหา provider**
(xAI ด้วย OAuth ของผู้ใช้เอง) **ไม่ผ่าน** `smartaihub.app` แปลว่า:

- ไม่ถูกนับเครดิตในระบบ Smart AI Hub
- ไม่ปรากฏใน audit log ของเรา
- ใช้โควตา/ค่าใช้จ่ายของบัญชี xAI ผู้ใช้โดยตรง

### ถ้าต้องการให้ผ่าน gateway จริง ๆ

ต้องมีอย่างใดอย่างหนึ่ง (ยังไม่มีตัวไหนทำ):

1. **Hermes เพิ่มการรองรับ base URL แบบ OpenAI-compatible** — แล้วเราชี้ไปที่
   gateway ของเรา (`server/_core/llmRoutes.ts` เป็น OpenAI-compatible อยู่แล้ว)
2. **ทำ local proxy** ที่หลอกเป็น endpoint ของ provider แล้ว forward ไป gateway
   — เปราะและผูกกับรายละเอียดภายในของ Hermes
3. **ไม่ใช้ Hermes สำหรับงาน LLM** — ให้ Hermes ทำเฉพาะงาน media/tool ส่วน LLM
   เรียกผ่าน gateway ของเราเองตามที่ระบบหลักทำอยู่

ข้อ 1 คือทางที่ถูกต้องที่สุดแต่ขึ้นกับ upstream ของ Hermes

## 5. คำสั่งที่ใช้บ่อย

```bash
hermes --tui                        # โหมด TUI เต็มจอ
hermes chat                         # คุยโต้ตอบกับ agent
hermes auth add xai-oauth --no-browser   # login xAI ด้วย device code
hermes auth list                    # ดู credential ทั้งหมด
hermes auth status xai-oauth        # สถานะ provider เดียว
hermes model                        # เลือก provider / model แบบ interactive
hermes doctor                       # ตรวจความพร้อมของ runtime
hermes status                       # สถานะรวม
hermes tools status --all           # รายการ tool ที่ใช้ได้
```
