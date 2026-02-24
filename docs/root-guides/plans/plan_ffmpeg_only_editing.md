# แผนงานเชิงเทคนิค: FFmpeg-only (ไม่ใช้ MLT) **Render แบบ Local-only 100%** สำหรับ SmartSpecPro บน Windows และ macOS

> เป้าหมาย: รวมคลิปหลายคลิปมาต่อกัน + เพิ่มเสียงพากษ์ (voiceover) เป็น track แยก + ทำ **ducking** (ลดเสียงในคลิปอัตโนมัติเมื่อมี voiceover) + เรนเดอร์ออกเป็น **MP4 (H.264/AAC)**
>
> ข้อกำหนดสำคัญ: **เรนเดอร์ทั้งหมดทำบนเครื่องผู้ใช้ (local) เท่านั้น 100%** — ไม่มีการอัปโหลดวิดีโอขึ้น hosting เพื่อเรนเดอร์

---

## 1) สถาปัตยกรรมที่เลือก (Local-only 100%)

**ภาพรวม:** Desktop app ของ SmartSpecPro จะรวม “Render Engine” ไว้ในเครื่องผู้ใช้โดยสมบูรณ์

ตัวเลือกที่แนะนำ (เลือกตามที่ทีมถนัด):

### Option A — Local Python Service (แนะนำ ถ้าคุณมี python-backend อยู่แล้ว)
- Bundle `python-backend` ให้รันเป็น **local service** (เช่น `127.0.0.1:<port>`) ภายใน desktop app
- UI (Tauri/React) ส่ง Project JSON ไปที่ local service
- local service เรียก `ffmpeg` (ที่ bundle มากับแอป) เพื่อ render
- ไฟล์ input/output อยู่บนเครื่องผู้ใช้ทั้งหมด

### Option B — Local Native/Node Worker (ถ้าต้องการลด Python runtime)
- UI เรียก worker ที่เขียนด้วย Rust/Node เพื่อประกอบคำสั่ง ffmpeg และรันผ่าน subprocess
- ไม่ต้องมี Python runtime แต่ยังคง Local-only 100%

**หลักการสำคัญของ Local-only:**
- ไม่มีการส่งไฟล์วิดีโอขึ้นเซิร์ฟเวอร์
- เซิร์ฟเวอร์ (ถ้ามี) ทำได้แค่เก็บ metadata/บัญชี/ซิงก์โปรเจกต์ (Project JSON) *โดยไม่ต้องมี media* และไม่ทำ rendering

---

## 2) ประเด็นไลเซนส์ (เลือกแบบ “ไม่พ่วง GPL”) — เหมาะกับการ bundle ใน desktop

### 2.1 FFmpeg: ใช้ **LGPL build**
- เลือก/สร้าง FFmpeg binary ที่ **ไม่เปิด `--enable-gpl`** และไม่ลิงก์ไลบรารี GPL
- หลีกเลี่ยง `libx264` (x264 เป็น GPL)

### 2.2 H.264 encoder ที่ “ไม่ต้องพึ่ง GPL” (สำคัญมาก)
เพราะ output ต้องเป็น MP4/H.264

**ตัวเลือกแนะนำ (OS-native):**
- **macOS:** `h264_videotoolbox` (VideoToolbox)
- **Windows:** `h264_mf` (Media Foundation)

**ตัวเลือกเสริม:**
- `libopenh264` (ต้องจัดการการ bundle ตามเงื่อนไขของไลบรารี)

> ในแผนนี้ backend/worker จะ “เลือก encoder อัตโนมัติ” ตามความพร้อมของเครื่องผู้ใช้

### 2.3 AAC
- ใช้ `aac` encoder ของ FFmpeg (native) ได้ใน LGPL build โดยทั่วไป

### 2.4 การแจกจ่าย (compliance แบบ practical)
- ใส่โฟลเดอร์ `licenses/` ใน bundle:
  - LICENSE/NOTICE ของ FFmpeg build (รวม configure flags)
  - LICENSE/NOTICE ของไลบรารีอื่น ๆ ที่ bundle มาด้วย (ถ้ามี)

> หมายเหตุ: ข้อความนี้เป็นแนวทางเชิงเทคนิคทั่วไป ไม่ใช่คำปรึกษากฎหมาย

---

## 3) สัญญาข้อมูล UI ↔ Local Render Service (Project JSON)

```json
{
  "profile": { "width": 1920, "height": 1080, "fps": 30 },
  "clips": [
    { "path": "C:/.../a.mp4", "in_sec": 0.0, "out_sec": 12.4 },
    { "path": "C:/.../b.mov", "in_sec": 3.0, "out_sec": 20.0 }
  ],
  "voiceover": {
    "path": "C:/.../vo.wav",
    "start_sec": 1.2,
    "gain_db": -2.0,
    "normalize": true
  },
  "ducking": {
    "enabled": true,
    "threshold": 0.03,
    "ratio": 6.0,
    "attack_ms": 10,
    "release_ms": 300,
    "makeup_db": 0.0,
    "background_gain_db": -1.0
  },
  "output": {
    "path": "C:/.../out.mp4",
    "video": {
      "codec_preference": ["h264_videotoolbox", "h264_mf", "libopenh264"],
      "bitrate_k": 6000,
      "pix_fmt": "yuv420p"
    },
    "audio": { "codec": "aac", "bitrate_k": 192, "sample_rate": 48000 }
  }
}
```

---

## 4) กลยุทธ์การเรนเดอร์ (FFmpeg-only)

แนะนำ **Filtergraph เดียวจบ** เพื่อควบคุมเวลาและ normalize สเปกของคลิปให้ตรงกันก่อน concat

ลำดับงาน:
1) ต่อคลิป: trim/in-out ต่อคลิป → normalize video/audio → concat เป็น timeline เดียว
2) เตรียม VO: resample → delay ตาม start_sec → gain/normalize
3) ducking: `sidechaincompress` ให้เสียงคลิป (background) ถูกกดโดย VO
4) mix: `amix` รวม background ที่ถูกกด + VO
5) encode: H.264 (OS-native encoder) + AAC → mp4

---

## 5) รายละเอียด Filtergraph (Template)

### 5.1 Normalize และ concat คลิปหลายตัว
สำหรับคลิป i:
- วิดีโอ:
  - `[i:v]trim=start=IN:end=OUT,setpts=PTS-STARTPTS,scale=W:H,fps=FPS,format=yuv420p[v{i}]`
- เสียง:
  - `[i:a]atrim=start=IN:end=OUT,asetpts=PTS-STARTPTS,aresample=48000[a{i}]`

แล้ว concat:
- `[v0][a0][v1][a1]...concat=n=N:v=1:a=1[vbase][abase]`

> ถ้า clip บางอันไม่มีเสียง ให้สร้าง silent track (`anullsrc`) ให้ครบก่อน concat

### 5.2 เตรียม voiceover ให้ “ชัดเจน”
- delay: `adelay=DELAY_MS|DELAY_MS`
- gain: `volume=...dB`
- normalize (เลือก): `dynaudnorm` หรือ `loudnorm`

ตัวอย่าง:
- `[N:a]aresample=48000,adelay=1200|1200,volume=-2dB,dynaudnorm[vo]`

### 5.3 Ducking ด้วย sidechaincompress
- `[abase][vo]sidechaincompress=threshold=0.03:ratio=6:attack=0.01:release=0.3[ducked]`

> `attack`/`release` ใน ffmpeg เป็นวินาที (แปลงจาก ms)

### 5.4 Mix เสียงสุดท้าย
- `[ducked][vo]amix=inputs=2:normalize=0[afinal]`

---

## 6) คำสั่ง FFmpeg (ตัวอย่างโครง)

> Backend/worker จะ generate ตามจำนวนคลิปจริง + ค่า in/out + encoder ที่มีในเครื่อง

```bash
ffmpeg \
  -i a.mp4 -i b.mov -i vo.wav \
  -filter_complex "
    [0:v]trim=0:12.4,setpts=PTS-STARTPTS,scale=1920:1080,fps=30,format=yuv420p[v0];
    [0:a]atrim=0:12.4,asetpts=PTS-STARTPTS,aresample=48000[a0];
    [1:v]trim=3:20,setpts=PTS-STARTPTS,scale=1920:1080,fps=30,format=yuv420p[v1];
    [1:a]atrim=3:20,asetpts=PTS-STARTPTS,aresample=48000[a1];
    [v0][a0][v1][a1]concat=n=2:v=1:a=1[vbase][abase];
    [2:a]aresample=48000,adelay=1200|1200,volume=-2dB,dynaudnorm[vo];
    [abase][vo]sidechaincompress=threshold=0.03:ratio=6:attack=0.01:release=0.3[ducked];
    [ducked][vo]amix=inputs=2:normalize=0[afinal]
  " \
  -map "[vbase]" -map "[afinal]" \
  -c:v h264_videotoolbox -b:v 6000k -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ar 48000 \
  -movflags +faststart out.mp4
```

### Encoder selection (local)
- ตรวจด้วย `ffmpeg -hide_banner -encoders`
- เลือกตามลำดับ preference:
  - macOS: `h264_videotoolbox`
  - Windows: `h264_mf`
  - fallback: `libopenh264` (ถ้ารวมมา)

---

## 7) การรองรับ input ต่างสเปค (งานจริง)

เพื่อให้ concat เสถียร:
- video: scale/fps/pix_fmt ให้เหมือนกัน
- audio: `aresample=48000` และจัด channel layout (เช่น stereo)

เคสสำคัญ:
- clip ไม่มีเสียง → เติม `anullsrc`
- VFR → บังคับ `fps=FPS` ก่อน concat

---

## 8) Progress, Logging, Cancel (Local-only)

### 8.1 Progress
- ใช้ `-progress pipe:1 -nostats` อ่าน `out_time_ms`
- duration รวมคำนวณจากผลรวม (out_sec - in_sec) ของคลิปทั้งหมด

### 8.2 Cancel
- เก็บ process handle แล้ว terminate
  - Windows: `proc.terminate()`
  - macOS: ส่ง `SIGTERM` แล้วค่อย `SIGKILL` ถ้าจำเป็น

### 8.3 Logs
- เก็บ stderr เป็นไฟล์ต่อ job เพื่อ debug

---

## 9) Local API/IPC Design (แทน server API)

ถ้าใช้ Option A (local FastAPI):
- `POST /local/media/render` → รับ JSON, สร้าง job, คืน `job_id`
- `GET /local/media/render/{job_id}` → สถานะ + progress
- `POST /local/media/render/{job_id}/cancel` → ยกเลิก

หรือใช้ Tauri IPC/Command (Option B) แทน HTTP:
- `render(projectJson)` → คืน job id
- `getRenderStatus(jobId)`
- `cancelRender(jobId)`

---

## 10) Packaging สำหรับ Windows และ macOS (Local-only 100%)

### 10.1 หลักการ
- Bundle `ffmpeg` (LGPL build) ไปกับแอป
- Bundle local service/worker ไปกับแอป
- เรียก `ffmpeg` ด้วย absolute path ภายใน bundle (ไม่พึ่ง ffmpeg ที่ผู้ใช้ติดตั้ง)

### 10.2 Windows
- `resources/ffmpeg/win/ffmpeg.exe`
- เรียกผ่าน `subprocess` แบบ list args เพื่อกันปัญหา path มีช่องว่าง

### 10.3 macOS
- `YourApp.app/Contents/Resources/ffmpeg/mac/ffmpeg`
- ตั้ง executable permission ตอน build
- ตั้ง notarization/signing หลังรวม binary

---

## 11) Roadmap (Local-only)

### Phase 0 — Spike (2–4 วัน)
- generator สร้าง ffmpeg command จาก JSON
- render 2 คลิป + VO + ducking ได้

### Phase 1 — MVP Integration (1 สปรินต์)
- UI หน้าเรียงคลิป + ใส่ VO + ducking preset
- local job queue + progress/cancel
- แพ็ก Windows/macOS (dev build)

### Phase 2 — Hardening (1–2 สปรินต์)
- รองรับ clip ไม่มีเสียง/VFR/สเปคต่างกัน
- ปรับ VO ให้ชัดขึ้น (loudnorm + limiter ถ้าจำเป็น)
- เพิ่ม CI smoke test บน 2 OS (render sample project)

---

## 12) Checklist คุณภาพเสียง (เน้น VO ชัด)
- ทุกสตรีม audio เป็น 48k
- normalize VO (`dynaudnorm` หรือ `loudnorm`)
- ducking:
  - attack 5–20ms
  - release 200–500ms
  - ratio 4–8
  - ปรับ threshold ให้ background ลดลงชัด แต่ยังได้ ambience
- เพิ่ม limiter หลัง mix ถ้าจำเป็นเพื่อกัน peak

---

## Appendix A — ข้อควรระวังสำคัญ
- อย่าใช้ `libx264` ถ้าต้องการหลีกเลี่ยง GPL
- ทดสอบ encoder availability จริงบนเครื่องผู้ใช้ (บางเครื่องอาจไม่มี `h264_mf`)
- วาง fallback/ข้อความแจ้งผู้ใช้กรณี encoder ไม่พร้อม

