# WF-SCRIPTS-001 — Workflow & Script Standards for SmartSpec

**Spec ID:** WF-SCRIPTS-001  
**Title:** Workflow & Script Scaffolding, Validation, and Indexing  
**Owner:** SmartSpec Runtime (local `.smartspec`)  
**Status:** Active

สเปคนี้ทำให้ **สิ่งที่อยู่ในโฟลเดอร์ `.smartspec/workflows/` และ `.smartspec/scripts/` “นิยามตรงกัน”** กับวิธีใช้งานจริงในระบบ runner (`.smartspec/ss_autopilot`) และการเรียก workflow แบบคำสั่งในหน้า chat ของ CLI (เช่น Kilo Code)

---

## 1) Scope

ครอบคลุม:
- Workflow markdown files ใน `.smartspec/workflows/**/*.md`
- Automation scripts ใน `.smartspec/scripts/**` (เช่น `.py`, `.sh`, `.ps1`)
- มาตรฐานสำหรับ scaffold / validate / generate index/reference สำหรับ workflows & scripts

**ไม่ครอบคลุม:**
- การพัฒนา UI (desktop/web)
- การทำ backend API ของ website

---

## 2) Definitions (สำคัญเพื่อไม่สับสน)

### 2.1 workflow_key (ตัวตนหลักของ workflow)
`workflow_key` = **ชื่อไฟล์โดยไม่รวม `.md`**  
ตัวอย่าง: `smartspec_generate_spec`, `autopilot_ask`

> ระบบ chat command อ้างอิงจาก “ชื่อไฟล์” เป็นหลัก

### 2.2 chat_command (รูปแบบที่ผู้ใช้พิมพ์ในหน้า chat ของ CLI)
รูปแบบคำสั่งขึ้นกับ platform (สอดคล้องกับแนวคิดใน `.smartspec/ss_autopilot/platform.py`):

- **Kilo Code:** `/{workflow_key}.md`
- **AntiGravity:** `/{workflow_key}`
- **Claude Code (default):** `/{workflow_key}.md`

> สรุป: ใน Kilo จะพิมพ์ “ชื่อไฟล์พร้อม `.md`” เสมอ

### 2.3 workflow_slug (canonical slug ใน frontmatter)
`workflow_slug` = ค่า `workflow:` ใน YAML frontmatter (เช่น `/smartspec_generate_spec`)

- ใช้เป็น **metadata/registry** (catalog/index/category/version/description)
- **ไม่ใช่รูปแบบคำสั่งของ Kilo** (Kilo ใช้ `/{workflow_key}.md`)

**กติกาแนะนำ (สำหรับ Production workflow):**
- `workflow_slug` SHOULD เท่ากับ `"/" + workflow_key` (ไม่มี `.md`)
- ถ้าไม่เท่ากัน ต้องมีเหตุผล/เอกสารกำกับ (เพื่อกันสับสน)

---

## 3) Workflow Types (ต้องแยกประเภทให้ตรงกับของจริงใน repo)

ใน `.smartspec/workflows/` มีไฟล์หลายบทบาทปนกันได้ สเปคนี้จึงกำหนด “ประเภท” เพื่อให้ validator/index ไม่ทำให้ repo พังเพราะไฟล์ legacy หรือเอกสารประกอบ

### 3.1 Production workflow (Strict)
**จุดประสงค์:** workflow หลักที่ควรถูกจัดเป็น command อย่างเป็นทางการ และควรถูก index/validate แบบเข้ม

เกณฑ์จำแนก (อย่างน้อยหนึ่งข้อ):
- มี YAML frontmatter ที่มี `workflow:` (แนะนำ)
- หรือชื่อไฟล์ขึ้นต้นด้วย `smartspec_` และมีโครงสร้าง section ครบ

ตัวอย่างไฟล์: `smartspec_generate_spec.md`

### 3.2 Chat/Router workflow (Lenient)
**จุดประสงค์:** workflow ที่ใช้ได้จริงในหน้า chat (โดยเฉพาะ legacy) แต่โครงสร้างอาจไม่ครบ/ไม่มี frontmatter

เกณฑ์จำแนก (อย่างน้อยหนึ่งข้อ):
- ไม่มี frontmatter
- หรือชื่อไฟล์ขึ้นต้นด้วย `autopilot_` / `router_` / `chat_` (หรือ pattern ที่ทีมใช้อยู่จริง)

ตัวอย่างไฟล์: `autopilot_ask.md`

### 3.3 Doc-only / Requirements / Reference (Doc-only)
**จุดประสงค์:** เอกสารประกอบ/requirements/คู่มือ ที่ไม่ควรถูก treated เป็น slash-command

เกณฑ์จำแนก (อย่างน้อยหนึ่งข้อ):
- ชื่อไฟล์ลงท้าย `_REQUIREMENTS.md`, `_REQUIREMENT.md`, `_DOCS.md`, `_GUIDE.md`, `_SUMMARY.md`
- หรือเป็น `README.md` ภายใต้โฟลเดอร์ workflows
- หรืออยู่ในโฟลเดอร์ย่อยที่ตั้งใจเป็น docs (ถ้ามี)

ตัวอย่างไฟล์: `API_GENERATOR_REQUIREMENTS.md`

### 3.4 System artifacts (Ignore)
ไฟล์ที่ต้อง ignore เสมอ:
- `*:Zone.Identifier` (Windows ADS)
- ไฟล์ซ่อน/ชั่วคราว เช่น `.DS_Store`, `Thumbs.db`, `~$*`, `*.tmp`
- ไฟล์ที่ไม่ใช่ `.md`

---

## 4) Workflow Standard

### 4.1 Production workflow template (บังคับ/ควรมี)
**ต้องมี YAML frontmatter** อย่างน้อย:

```yaml
---
workflow: /smartspec_generate_spec
version: 1.0
category: spec
description: Generate a new feature spec pack (spec.md, plan.md, tasks.md)
---
```

**Sections ที่ต้องมี (หัวข้อระดับ H2):**
- `## Goal`
- `## Inputs`
- `## Steps`
- `## Outputs`
- `## Examples`

**Examples ต้องมีตัวอย่าง Kilo command อย่างน้อย 1 ตัวอย่าง:**
- `/smartspec_generate_spec.md <args...>`

### 4.2 Chat/Router workflow (ขั้นต่ำ)
- อาจไม่มี frontmatter ได้
- ต้องมีอย่างน้อย:
  - เป้าหมาย/คำอธิบายสั้น
  - ตัวอย่างการเรียกใน Kilo: `/{workflow_key}.md ...`
- ไม่บังคับ sections ครบแบบ Production

### 4.3 Doc-only
- เป็นเอกสารทั่วไป ไม่บังคับโครงสร้าง workflow
- ต้องไม่ถูกนำไปเป็น slash-command ใน index

---

## 5) Validation Rules (ต้องสอดคล้องกับของจริงใน repo)

Validator ต้อง “จำแนกประเภทก่อน” แล้วค่อยใช้ ruleset ตามประเภท:

### 5.1 Strict ruleset (Production)
- ต้องมี frontmatter และต้องมี `workflow:` เป็น `/...` (ขึ้นต้นด้วย `/`)
- แนะนำให้ `workflow_slug == "/" + workflow_key` (SHOULD)
- ต้องมี sections ตามข้อ 4.1 ครบ
- ต้องมี Examples ที่แสดงการเรียกแบบ Kilo (`/{workflow_key}.md`)
- ต้องไม่อ้าง path/ไฟล์นอก workspace แบบ hardcode (ยกเว้นระบุว่าเป็นตัวอย่าง)

### 5.2 Lenient ruleset (Chat/Router)
- ไม่บังคับ frontmatter
- ตรวจขั้นต่ำ:
  - ไฟล์เป็น UTF-8
  - มีอย่างน้อย 1 บรรทัดอธิบาย
  - มี example หรืออย่างน้อยมีคำว่า `/{workflow_key}` หรือ `/{workflow_key}.md` สักที่หนึ่ง
- ห้าม validator fail ทั้ง repo เพราะไฟล์กลุ่มนี้

### 5.3 Doc-only ruleset
- ตรวจขั้นต่ำ:
  - ไฟล์อ่านได้/ไม่เสียรูป (UTF-8)
  - ไม่มี “frontmatter ที่ทำให้สับสน” เช่นใส่ `workflow:` แต่เนื้อหาเป็น requirement (ถ้ามี ให้เตือนเป็น warning)
- ห้ามถูกจัดเป็น command ใน index

### 5.4 Ignore ruleset (System artifacts)
- ข้ามทันที (ไม่ validate)

---

## 6) Index & Reference Generation

สร้างไฟล์ index แบบ deterministic (เรียงตาม `workflow_key`) ที่ `.smartspec/workflows/WORKFLOWS_INDEX.md` โดยมีอย่างน้อย:

- `workflow_key`
- `type` (Production | Chat/Router | Doc-only)
- `workflow_slug` (ถ้ามี)
- `kilo_command` = `/{workflow_key}.md`
- `description` (จาก frontmatter ถ้ามี)
- `version` (ถ้ามี)
- `path` (relative path)

**ข้อกำหนด:**
- ห้ามรวม System artifacts
- Doc-only แยก section ออกจาก list ของ command
- Index generation ต้องไม่ขึ้นกับ OS (path/line endings) และไม่พังเพราะไฟล์ legacy

---

## 7) Script Standard (ขั้นต่ำ)

### 7.1 หลักการ
Scripts ใน `.smartspec/scripts/` ต้อง “เรียกซ้ำได้” และมีโหมด `--help`

### 7.2 Python
- shebang: `#!/usr/bin/env python3`
- ต้องมี `--help` (argparse)
- ต้องรองรับ `--dry-run` ถ้า script มีผลข้างเคียงกับไฟล์

### 7.3 Shell (bash/zsh)
- `set -euo pipefail`
- ต้องมี usage/help อย่างน้อยผ่าน `-h/--help`

### 7.4 Index
สร้าง `.smartspec/scripts/SCRIPTS_INDEX.md` ระบุ:
- ชื่อไฟล์, ประเภท, วิธีรันตัวอย่าง, สรุปสั้น ๆ

---

## 8) Non-goals
- ไม่บังคับให้ย้ายไฟล์ legacy ออกทันที
- ไม่บังคับให้ทุก workflow ต้องมี frontmatter (เฉพาะ Production)

---

## 9) Acceptance Criteria

- อธิบายชัดเจนและ “ไม่ขัดกัน” ว่า:
  - ผู้ใช้พิมพ์คำสั่งใน Kilo เป็น `/{workflow_key}.md`
  - `frontmatter.workflow` เป็น canonical slug เพื่อ metadata/index ไม่ใช่รูปแบบคำสั่งของทุก platform
- Validator ไม่ fail เพราะไฟล์ legacy/doc-only ใน `.smartspec/workflows/`
- Production workflow ใหม่ 1 ไฟล์ สร้างจาก template แล้วผ่าน Strict ruleset
- สร้าง WORKFLOWS_INDEX.md ได้แบบ deterministic และไม่รวม artifacts (`*:Zone.Identifier`)
- สร้าง SCRIPTS_INDEX.md ได้จากการ scan scripts folder
