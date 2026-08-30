# Character Candidate Prompt Skill

โครงสร้าง Skill สำหรับสร้าง Prompt เพื่อออกแบบตัวละคร 1–10 ภาพ โดยเน้น:

- Lock อายุและเชื้อชาติทุก Candidate
- ใช้ภาพอ้างอิงกับโครงหน้าและความยาว/แนวทรงผม
- เลือก Lock เสื้อผ้าได้
- เลือก Pose แบบ Auto Natural หรือ Lock ตามภาพได้
- เลือกระยะภาพ Full body, Three-quarter, Half body, Medium close-up, Close-up, Extreme close-up, Wide environmental หรือ Custom
- ผิวจริง ไม่พลาสติก ไม่เหมือน AI
- หน้าตาระดับนักแสดงนำ/นางเอก แต่ยังเป็นธรรมชาติ ไม่ใช่ลุคนางแบบ
- เพิ่มมิติของภาพ, Depth of Field และ Cinematic depth
- Output เป็นข้อความ Prompt เดียว ไม่มี Negative Prompt แยก

## Files

- `SKILL.md` — กติกาและตรรกะของ Skill
- `schemas/input.schema.json` — JSON Schema สำหรับ input
- `schemas/ui.schema.json` — UI hints / widget mapping
- `schemas/output.schema.json` — output เป็น plain text string

## Suggested defaults

- `image_count`: 5
- `gender_presentation`: `female`
- `ethnicity`: `Thai / Southeast Asian`
- `age_min`: 23
- `age_max`: 25
- `lock_clothing`: false
- `pose_mode`: `auto_natural`
- `camera_framing`: `half_body`
- `cinematic_intensity`: `balanced`
- `depth_of_field`: `auto`


## Multiple image output rule
When `image_count` is greater than 1, the generated prompt explicitly requests separate independent image outputs (one candidate per image). It forbids collage, grid, contact-sheet, split-screen, storyboard-sheet, labels, or multi-panel rendering.
