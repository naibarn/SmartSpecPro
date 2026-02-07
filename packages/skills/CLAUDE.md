# @smartspec/skills

Shared package for skill detection, parsing, and type definitions. Used by `apps/web` server to identify and execute skills from user input.

## Structure

```
packages/skills/
├── src/
│   ├── index.ts        # Package entry point (re-exports)
│   ├── detector.ts     # Skill detection from user messages
│   ├── parser.ts       # YAML/markdown skill file parser
│   └── types.ts        # Skill type definitions
└── package.json
```

## Usage

```typescript
import { detectSkill, parseSkillFile, type Skill } from "@smartspec/skills";
```

## Key Types

- **Skill**: Core skill definition (name, description, schemas, chain config)
- **SkillDetection**: Result of matching user input to a skill
- **SkillSchema**: JSON Schema for skill inputs and UI rendering

## Skill File Format

Each skill lives in `apps/web/skills/<skill-name>/` with:
- `skill.md` — Markdown prompt template with YAML frontmatter
- `schemas/input.schema.json` — Input validation schema
- `schemas/ui.schema.json` — UI rendering schema

## Dependencies

- `js-yaml` — YAML parsing for skill frontmatter
- `@smartspec/shared` — Shared types and constants
