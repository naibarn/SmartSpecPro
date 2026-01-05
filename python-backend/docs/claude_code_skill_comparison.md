# Claude Code Skill vs Kilo Code Skill - Comparison

## Claude Code Skill Format

จาก documentation ของ Claude Code:

### โครงสร้างไฟล์
```
skill-name/
├── SKILL.md          (required - main file)
├── reference.md      (optional - detailed docs)
├── examples.md       (optional - usage examples)
└── scripts/
    └── helper.py     (optional - utility scripts)
```

### SKILL.md Format
```markdown
---
name: skill-name
description: Brief description of what this Skill does and when to use it
allowed-tools: [optional - tools Claude can use]
model: [optional - model to use]
---

# Skill Name

## Instructions
Clear, step-by-step guidance for Claude.

## Examples
Concrete examples of using this Skill.
```

### Metadata Fields
| Field | Required | Description |
|-------|----------|-------------|
| name | Yes | Lowercase letters, numbers, hyphens (max 64 chars) |
| description | Yes | What skill does and when to use (max 1024 chars) |
| allowed-tools | No | Tools Claude can use without permission |
| model | No | Model to use when skill is active |

### Storage Locations
| Location | Path | Applies to |
|----------|------|------------|
| Enterprise | managed settings | All users in organization |
| Personal | ~/.claude/skills/ | User, across all projects |
| Project | .claude/skills/ | Anyone in repository |
| Plugin | Bundled with plugins | Anyone with plugin |

---

## Kilo Code Skill Format

จาก implementation ของเรา:

### โครงสร้างไฟล์
```
skill-name/
└── SKILL.md          (required - main file)
```

### SKILL.md Format
```markdown
---
name: skill-name
description: Brief description
version: 1.0.0
author: optional
tags: [optional, tags]
---

# Skill Name

## Description
Brief description...

## Instructions
- Instruction 1
- Instruction 2

## Examples
...
```

### Metadata Fields
| Field | Required | Description |
|-------|----------|-------------|
| name | Yes | Skill identifier |
| description | Yes | What skill does |
| version | No | Version string |
| author | No | Author name |
| tags | No | Categorization tags |

### Storage Locations
| Location | Path | Applies to |
|----------|------|------------|
| Global | ~/.kilocode/skills/ | User, across all projects |
| Project | .kilocode/skills/ | Project-specific |

---

## Comparison Summary

| Feature | Claude Code | Kilo Code | Compatible? |
|---------|-------------|-----------|-------------|
| **File name** | SKILL.md | SKILL.md | ✅ Same |
| **Directory structure** | skill-name/SKILL.md | skill-name/SKILL.md | ✅ Same |
| **YAML frontmatter** | Yes | Yes | ✅ Same |
| **name field** | Required | Required | ✅ Same |
| **description field** | Required | Required | ✅ Same |
| **allowed-tools** | Supported | Not supported | ⚠️ Different |
| **model** | Supported | Not supported | ⚠️ Different |
| **version** | Not mentioned | Supported | ⚠️ Different |
| **author** | Not mentioned | Supported | ⚠️ Different |
| **tags** | Not mentioned | Supported | ⚠️ Different |
| **Project path** | .claude/skills/ | .kilocode/skills/ | ❌ Different |
| **Personal path** | ~/.claude/skills/ | ~/.kilocode/skills/ | ❌ Different |
| **Supporting files** | Supported | Not implemented | ⚠️ Different |
| **Scripts** | Supported | Not implemented | ⚠️ Different |

---

## Compatibility Analysis

### ✅ Compatible (Core Format)
- ทั้งสองใช้ **SKILL.md** เป็นไฟล์หลัก
- ทั้งสองใช้ **YAML frontmatter** สำหรับ metadata
- ทั้งสองมี **name** และ **description** เป็น required fields
- ทั้งสองใช้ **Markdown** สำหรับ content

### ⚠️ Partially Compatible
- Extra fields (version, author, tags) จะถูก ignore โดย Claude Code
- Claude Code fields (allowed-tools, model) จะถูก ignore โดย Kilo Code

### ❌ Not Compatible
- **Directory paths ต่างกัน**:
  - Claude Code: `.claude/skills/`
  - Kilo Code: `.kilocode/skills/`

---

## Recommendations for Full Compatibility

### Option 1: Dual Directory Support
สร้าง skills ใน both directories:
```
project/
├── .claude/skills/my-skill/SKILL.md
└── .kilocode/skills/my-skill/SKILL.md
```

### Option 2: Symlink
```bash
ln -s .kilocode/skills .claude/skills
```

### Option 3: Update Kilo Code to Support Claude Path
แก้ไข KiloSkillManager ให้รองรับ `.claude/skills/` path

### Option 4: Converter Script
สร้าง script ที่ convert/sync skills ระหว่าง directories

---

## Proposed Changes for Full Compatibility

1. **Add Claude Code metadata fields**:
   - `allowed-tools` - Tools that can be used
   - `model` - Model preference

2. **Support both directory paths**:
   - `.claude/skills/` (Claude Code)
   - `.kilocode/skills/` (Kilo Code)

3. **Add supporting files support**:
   - Reference files (reference.md, examples.md)
   - Utility scripts

4. **Progressive disclosure**:
   - Load only name/description at startup
   - Load full content when skill is activated
