# Feature 144 — bounded A/B evaluation record

สถานะ: `PENDING_EXPLICIT_APPROVAL`

เอกสารนี้เป็นแบบฟอร์มสำหรับ release gate เท่านั้น ยังไม่มี provider call หรือ
task ID ใดถูกบันทึกไว้ในการ implement อัตโนมัติ การกรอกต้องทำในพื้นที่จำกัดสิทธิ์
และห้ามใส่ full prompt, secret หรือ reference URL ลงใน report สาธารณะ

## Gate conditions

- ทำ matched pairs อย่างน้อย 12 คู่ต่อ family: GPT Image 2, Nano Banana และ
  Seedream
- ใช้ character facts, reference image, framing, aspect ratio และ generation
  settings เดียวกันเท่าที่ provider รองรับ
- Seedream ต้องตรวจเพิ่มว่า compact profile ไม่หลุด identity, age, safety หรือ
  Human Realism essentials
- มี reviewer สองคน หรือ reviewer คนเดียวที่บันทึก second pass แยกชัดเจน
- ห้ามผ่าน gate หาก identity, age หรือ safety ลดลงแม้เพียง family เดียว

## Run metadata

| Field | Value |
|---|---|
| Evaluation date | `YYYY-MM-DD` |
| Reviewer / second pass | `REQUIRED` |
| GPT Image 2 model IDs | `TODO` |
| Nano Banana model IDs | `TODO` |
| Seedream model IDs | `TODO` |
| Contract version | `vd_character_natural_human_v1` |
| Profiles | `rich` / `compact` |

## Pair register

ทำซ้ำตารางนี้ 12 แถวต่อ family โดยเก็บ task IDs ไว้ใน restricted evidence store
และใส่เพียง reference ID ในเอกสารนี้

| Family | Pair | Character fixture ref | Framing | Target prompt length | Baseline evidence ref | Target evidence ref | Mandatory safety/identity pass | Decision |
|---|---:|---|---|---:|---|---|---|---|
| GPT Image 2 | 1–12 | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` |
| Nano Banana | 1–12 | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` |
| Seedream | 1–12 | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` | `TODO` |

## Rubric

ให้คะแนน 1–5 ทั้ง baseline และ target ในหัวข้อต่อไปนี้:

1. identity recognizability / reference lock
2. natural human skin and facial structure
3. attractive dramatic presence
4. non-model / non-catalog authenticity
5. age and safety correctness
6. pose, hands, feet, anatomy, wardrobe plausibility
7. usefulness as a downstream character reference

## Release decision

- [ ] ทั้งสาม family มีครบ 12 matched pairs
- [ ] ไม่มี identity / age / safety regression
- [ ] Target คงไว้หรือดีขึ้นในหัวข้อบังคับ และเห็น preference ด้าน natural-human
- [ ] Seedream compact profile ผ่านการตรวจเฉพาะทาง
- [ ] อนุมัติ broad enablement โดยผู้มีสิทธิ์

จนกว่าจะติ๊กครบ ให้คง capability gate และยังไม่เปิด broad enablement
โดยอัตโนมัติ
