# Claude Code Compatibility

SmartSpec Pro รองรับการทำงานร่วมกับทั้ง **Kilo Code** และ **Claude Code** ผ่าน Dual Directory Support

## Overview

Skills ที่สร้างใน SmartSpec Pro สามารถใช้งานได้กับทั้งสองระบบโดยอัตโนมัติ

| Feature | Kilo Code | Claude Code | SmartSpec Pro |
|---------|-----------|-------------|---------------|
| Directory | `.kilocode/skills/` | `.claude/skills/` | ทั้งสอง |
| File name | `SKILL.md` | `SKILL.md` | `SKILL.md` |
| YAML frontmatter | ✅ | ✅ | ✅ |
| `name` field | ✅ | ✅ | ✅ |
| `description` field | ✅ | ✅ | ✅ |
| `version` field | ✅ | ❌ | ✅ |
| `author` field | ✅ | ❌ | ✅ |
| `tags` field | ✅ | ❌ | ✅ |
| `allowed-tools` field | ❌ | ✅ | ✅ |
| `model` field | ❌ | ✅ | ✅ |

## Skill Formats

### Kilo Code Format

```yaml
---
name: my-skill
description: A skill for Kilo Code
version: 1.0.0
author: Your Name
tags:
  - coding
  - best-practices
---

# My Skill

Instructions for Kilo Code...
```

### Claude Code Format

```yaml
---
name: my-skill
description: A skill for Claude Code
allowed-tools:
  - Read
  - Write
  - Edit
model: claude-sonnet-4-20250514
---

# My Skill

Instructions for Claude Code...
```

### Universal Format (SmartSpec Pro)

```yaml
---
name: my-skill
description: A skill for both systems
version: 1.0.0
author: Your Name
tags:
  - coding
  - best-practices
allowed-tools:
  - Read
  - Write
  - Edit
model: claude-sonnet-4-20250514
---

# My Skill

Instructions for both systems...
```

## Directory Structure

เมื่อสร้าง skill ใน SmartSpec Pro จะถูกบันทึกในทั้งสอง directories:

```
project/
├── .kilocode/
│   └── skills/
│       └── my-skill/
│           └── SKILL.md    ← Kilo Code format
└── .claude/
    └── skills/
        └── my-skill/
            └── SKILL.md    ← Claude Code format
```

## API Endpoints

### Sync Skills

```bash
# Sync from Kilo to Claude
POST /api/v1/skills/sync?workspace=/path/to/project
{
  "source_format": "kilo",
  "bidirectional": false
}

# Bidirectional sync
POST /api/v1/skills/sync?workspace=/path/to/project
{
  "source_format": "kilo",
  "bidirectional": true
}
```

### Diff Skills

```bash
# Get differences between directories
GET /api/v1/skills/diff?workspace=/path/to/project

# Response
{
  "synced": ["skill-1", "skill-2"],
  "only_kilo": ["kilo-only-skill"],
  "only_claude": ["claude-only-skill"],
  "total_kilo": 3,
  "total_claude": 2
}
```

### Convert Single Skill

```bash
# Convert a skill from Kilo to Claude format
POST /api/v1/skills/convert?workspace=/path/to/project&skill_name=my-skill&source_format=kilo&target_format=claude
```

## CLI Tool

SmartSpec Pro มี CLI tool สำหรับ sync skills:

```bash
# Convert a single file
python scripts/skill_converter.py convert ./skill/SKILL.md ./output/SKILL.md --from kilo --to claude

# Sync all skills in a project
python scripts/skill_converter.py sync /path/to/project --from kilo

# Bidirectional sync
python scripts/skill_converter.py sync /path/to/project --bidirectional

# Sync global skills
python scripts/skill_converter.py sync-global --from kilo --bidirectional

# Watch for changes and auto-sync
python scripts/skill_converter.py watch /path/to/project --interval 5

# List all skills
python scripts/skill_converter.py list /path/to/project

# Show diff
python scripts/skill_converter.py diff /path/to/project
```

## Frontend Integration

### Sync Button

```typescript
import { skillService } from './services/skillService';

// Sync skills
const result = await skillService.syncSkills(workspace, {
  sourceFormat: 'kilo',
  bidirectional: true,
});

console.log(`Synced ${result.synced_count} skills`);
```

### Diff View

```typescript
// Get diff
const diff = await skillService.diffSkills(workspace);

console.log('Synced:', diff.synced);
console.log('Only in Kilo:', diff.only_kilo);
console.log('Only in Claude:', diff.only_claude);
```

## Best Practices

### 1. Use Universal Format

เมื่อสร้าง skill ใหม่ ให้ใช้ universal format ที่รวมทุก fields:

```typescript
const skill: SkillCreate = {
  name: 'my-skill',
  description: 'A universal skill',
  content: '# My Skill\n\nInstructions...',
  // Kilo fields
  version: '1.0.0',
  author: 'Your Name',
  tags: ['coding'],
  // Claude fields
  allowedTools: ['Read', 'Write'],
  model: 'claude-sonnet-4-20250514',
  // Create in both formats
  formats: ['kilo', 'claude'],
};
```

### 2. Auto-Sync on Save

เปิดใช้งาน auto-sync เพื่อให้ skills sync อัตโนมัติเมื่อบันทึก

### 3. Watch Mode for Development

ใช้ watch mode ระหว่าง development:

```bash
python scripts/skill_converter.py watch /path/to/project --interval 5
```

### 4. Check Diff Before Commit

ตรวจสอบ diff ก่อน commit เพื่อให้แน่ใจว่า skills sync แล้ว:

```bash
python scripts/skill_converter.py diff /path/to/project
```

## Limitations

1. **Claude-specific features**: บาง features ของ Claude Code (เช่น `allowed-tools`) จะไม่มีผลใน Kilo Code
2. **Kilo-specific features**: บาง features ของ Kilo Code (เช่น `version`, `author`) จะไม่มีผลใน Claude Code
3. **Content**: เนื้อหาของ skill จะถูก preserve ทั้งหมด แต่ metadata อาจแตกต่างกัน

## Troubleshooting

### Skills not syncing

1. ตรวจสอบว่า workspace path ถูกต้อง
2. ตรวจสอบ permissions ของ directories
3. ใช้ `--verbose` flag เพื่อดู debug output

### Format conversion errors

1. ตรวจสอบ YAML syntax ใน SKILL.md
2. ตรวจสอบว่า `name` และ `description` fields มีอยู่
3. ใช้ universal format เพื่อหลีกเลี่ยงปัญหา

## Related Files

- `app/services/kilo_skill_manager_v2.py` - Dual path skill manager
- `scripts/skill_converter.py` - CLI converter tool
- `app/api/v1/skills.py` - API endpoints
- `desktop-app/src/services/skillService.ts` - Frontend service
