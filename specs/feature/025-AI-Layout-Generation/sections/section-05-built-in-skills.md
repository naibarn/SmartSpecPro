Now I have a thorough understanding of the codebase. The `content_writing` category in the plan doesn't match any existing database enum value. This is a critical detail -- the implementer needs to know they should map to an existing category (likely `chat_assistant` or `other`) since `content_writing` would require a DB migration. Let me verify this once more and also look at the `mapCategoryToEnum` function.

Looking at the `mapCategoryToEnum` function in `/home/dev/projects/SmartSpecPro/packages/skills/src/parser.ts`, if `content_writing` is passed, it falls through to the default `"prompt_enhancement"`. This means the skills will be auto-categorized as `prompt_enhancement` unless we either:
1. Add `content_writing` to the DB enum (requires migration) and parser mapping
2. Use an existing category

The plan says `category: content_writing` but this needs clarification. Let me now generate the section content.

# Section 05: Built-in Article Writer Skills

## Overview

This section creates 5 new `skill.md` files for built-in article writer skills used by the AI Presentation Draft pipeline (Phase 1 -- article generation). Each skill defines a system prompt that instructs an LLM to write a structured article on a given topic, which is then split into slides by Phase 2.

These are `llm-only` execution mode skills with simple text input/output. They do not require `schemas/` directories, JSON schemas, or any server-side code changes. The existing skill registry auto-sync mechanism (`autoSyncSkillsFromFolder` in `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillRegistry.ts`) will automatically import them into the database on the next server startup.

## Dependencies

- **No code dependencies on other sections.** These are standalone markdown files.
- **Needed by:** Section 06 (Orchestrator) uses these skills via `skillRegistry.getSkill(articleSkillId)` to retrieve the system prompt for Phase 1 article generation.
- **Needed by:** Section 08 (Frontend Modal) lists these skills in the article skill dropdown.

## Critical Category Mapping Detail

The plan specifies `category: content_writing`, but this category does **not** exist in the database `skill_category` enum (defined in `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` at line 2113). The existing enum values are:

```
image_generation, video_generation, image_video_generation, audio_generation,
sound_effects, prompt_enhancement, code_assistant, document_analysis,
web_search, data_analysis, translation, summarization, chat_assistant,
automation, other
```

The `mapCategoryToEnum` function in `/home/dev/projects/SmartSpecPro/packages/skills/src/parser.ts` maps unknown categories to the default `"prompt_enhancement"`.

**Resolution:** Use `category: chat_assistant` for the article writer skills. This is the closest existing category for general-purpose LLM text generation skills, and it avoids a database migration. The orchestrator (Section 06) identifies skills by their slug ID, not their category, so the category is only used for filtering in the UI skill list. If a dedicated `content_writing` category is desired later, it can be added as a follow-up with a DB migration.

Alternatively, if the implementer prefers `category: other`, that also works and avoids migration. The key constraint is: the YAML `category` value MUST map to a value present in the `skillCategoryEnum` in the database schema.

## Files to Create

All files are created under `/home/dev/projects/SmartSpecPro/apps/web/skills/`:

| File Path | Skill Slug (directory name) | Purpose |
|---|---|---|
| `skills/general-article-writer/skill.md` | `general-article-writer` | All-purpose article writer |
| `skills/business-article-writer/skill.md` | `business-article-writer` | Business-focused articles |
| `skills/education-article-writer/skill.md` | `education-article-writer` | Educational content |
| `skills/marketing-article-writer/skill.md` | `marketing-article-writer` | Marketing content |
| `skills/lifestyle-article-writer/skill.md` | `lifestyle-article-writer` | Lifestyle/wellness content |

No `schemas/` subdirectory is needed for any of these skills -- they are `llm-only` mode with simple text input/output.

## Skill File Structure

Each `skill.md` file follows the established pattern observed in existing skills (e.g., `/home/dev/projects/SmartSpecPro/apps/web/skills/brainstorm/skill.md`, `/home/dev/projects/SmartSpecPro/apps/web/skills/translation/skill.md`):

1. **YAML frontmatter** between `---` delimiters containing metadata
2. **Markdown body** containing the system prompt for the LLM

### Required YAML Frontmatter Fields

Every article writer skill must have these frontmatter fields:

```yaml
---
name: <Human-readable skill name>
slug: <directory-name, matches folder>
description: <Brief description for the UI skill list>
category: chat_assistant
icon: <Lucide icon name>
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 50
creditMultiplier: 1.0
execution_mode: llm-only
---
```

Key field decisions:
- **`execution_mode: llm-only`** -- The orchestrator calls `invokeLLM()` directly with the skill's system prompt. It does NOT call `executeSkill()`. The `llm-only` mode in `executeSkill` just echoes back the prompt, so the orchestrator bypasses it entirely.
- **`isAutoTrigger: false`** -- These skills are explicitly selected by the user in the AI Draft modal, not auto-detected from chat messages.
- **`enabledByDefault: true`** -- Available to all users without admin activation.
- **`priority: 50`** -- Standard priority (same as Translation, Image Prompt Engineer).
- **`category: chat_assistant`** -- Maps to the existing `chat_assistant` enum value in the database. See the "Critical Category Mapping Detail" section above.

### System Prompt Body Requirements

The markdown body after the frontmatter serves as the system prompt passed to `invokeLLM()` in Phase 1. Each system prompt must instruct the LLM to:

1. Write a well-structured article (500-2000 words) on the user's topic
2. Organize content with clearly numbered sections (the Phase 2 LLM splits on these)
3. Use the language specified by the user (or auto-detect)
4. Include a clear title
5. Write in plain text with section headers -- no JSON, no special formatting
6. Tailor tone and content structure to the skill's domain specialty

The exact system prompt wording is left to the implementer, but each skill should produce articles that are:
- Clearly structured with numbered or headed sections
- Appropriate length for splitting into the requested number of slides (typically 5-10 sections)
- Written in a tone matching the skill's domain (professional for business, pedagogical for education, etc.)

## Skill Definitions

### 1. general-article-writer

**File:** `/home/dev/projects/SmartSpecPro/apps/web/skills/general-article-writer/skill.md`

**Frontmatter:**
```yaml
---
name: General Article Writer
slug: general-article-writer
description: Write articles on any topic for presentation slides. Versatile all-purpose writer with no domain assumptions.
category: chat_assistant
icon: pen-tool
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 50
creditMultiplier: 1.0
execution_mode: llm-only
---
```

**System prompt body guidance:** The markdown body should instruct the LLM to act as a versatile article writer. No domain assumptions. Should handle any topic -- technology, science, history, culture, etc. Emphasis on clarity, logical flow, and well-organized sections. The prompt should mention that the article will be used for presentation slides, so sections should be self-contained and concise.

### 2. business-article-writer

**File:** `/home/dev/projects/SmartSpecPro/apps/web/skills/business-article-writer/skill.md`

**Frontmatter:**
```yaml
---
name: Business Article Writer
slug: business-article-writer
description: Write business-focused articles covering strategy, operations, market analysis, and case studies for professional presentations.
category: chat_assistant
icon: briefcase
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 50
creditMultiplier: 1.0
execution_mode: llm-only
---
```

**System prompt body guidance:** Instruct the LLM to write in a professional business tone. Focus areas include strategy, operations, market analysis, case studies, competitive landscapes, financial concepts, and organizational topics. Use data-driven language, actionable insights, and executive-level clarity. Each section should present a key business concept or finding suitable for a presentation slide.

### 3. education-article-writer

**File:** `/home/dev/projects/SmartSpecPro/apps/web/skills/education-article-writer/skill.md`

**Frontmatter:**
```yaml
---
name: Education Article Writer
slug: education-article-writer
description: Write educational content including lesson plans, explainers, and learning-focused articles for academic presentations.
category: chat_assistant
icon: graduation-cap
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 50
creditMultiplier: 1.0
execution_mode: llm-only
---
```

**System prompt body guidance:** Instruct the LLM to write in a pedagogical, approachable style. Focus on explaining concepts clearly, using examples and analogies. Structure content with learning objectives, key concepts, practical applications, and summary points. Suitable for classroom presentations, training materials, and educational workshops.

### 4. marketing-article-writer

**File:** `/home/dev/projects/SmartSpecPro/apps/web/skills/marketing-article-writer/skill.md`

**Frontmatter:**
```yaml
---
name: Marketing Article Writer
slug: marketing-article-writer
description: Write marketing-focused content covering campaigns, audience targeting, brand messaging, and growth strategies for pitch decks.
category: chat_assistant
icon: megaphone
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 50
creditMultiplier: 1.0
execution_mode: llm-only
---
```

**System prompt body guidance:** Instruct the LLM to write in a persuasive, engaging marketing voice. Cover topics like campaign strategy, audience segmentation, brand positioning, content marketing, digital channels, metrics and KPIs, and growth tactics. Use compelling language suitable for pitch decks and stakeholder presentations. Include actionable recommendations.

### 5. lifestyle-article-writer

**File:** `/home/dev/projects/SmartSpecPro/apps/web/skills/lifestyle-article-writer/skill.md`

**Frontmatter:**
```yaml
---
name: Lifestyle Article Writer
slug: lifestyle-article-writer
description: Write lifestyle and wellness content covering health tips, recipes, travel, and personal development for inspiring presentations.
category: chat_assistant
icon: heart
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 50
creditMultiplier: 1.0
execution_mode: llm-only
---
```

**System prompt body guidance:** Instruct the LLM to write in a warm, approachable, inspiring tone. Cover topics like health and wellness, fitness, nutrition, travel destinations, personal development, mindfulness, work-life balance, and hobby exploration. Use vivid descriptions and practical tips. Each section should inspire or inform, suitable for motivational or informational presentations.

## Tests

### Test File

`/home/dev/projects/SmartSpecPro/apps/web/skills/__tests__/articleWriterSkills.test.ts`

This is a standalone test file that validates the 5 skill markdown files are correctly formed and parseable by the skill parser. No unit test file for individual skill content is needed since skills are markdown, but structural validation is important.

### Test Approach

The tests use the `parseSkillFile` function from `@smartspec/skills` to parse each `skill.md` and validate the extracted metadata and content. They also use the `mapCategoryToEnum` function to verify the category maps to a valid database value.

### Test Stubs

```typescript
// File: /home/dev/projects/SmartSpecPro/apps/web/skills/__tests__/articleWriterSkills.test.ts

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseSkillFile, mapCategoryToEnum } from "@smartspec/skills";

const SKILLS_DIR = path.resolve(__dirname, "..");

const ARTICLE_WRITER_SLUGS = [
  "general-article-writer",
  "business-article-writer",
  "education-article-writer",
  "marketing-article-writer",
  "lifestyle-article-writer",
];

describe("Built-in Article Writer Skills", () => {
  it("all 5 skill.md files exist and are readable", () => {
    // Verify each slug has a skills/<slug>/skill.md file
  });

  for (const slug of ARTICLE_WRITER_SLUGS) {
    describe(slug, () => {
      it("parses successfully via parseSkillFile", () => {
        // Read the skill.md, call parseSkillFile, check metadata is non-null
      });

      it("has execution_mode set to llm-only", () => {
        // Parse skill.md, verify metadata.execution_mode === "llm-only"
        // or metadata.executionMode === "llm-only"
      });

      it("has category that maps to a valid database enum value", () => {
        // Parse skill.md, call mapCategoryToEnum(metadata.category)
        // Verify result is NOT "prompt_enhancement" (the fallback default)
        // unless that's intentional
      });

      it("has enabledByDefault set to true", () => {
        // Parse skill.md, verify metadata.enabledByDefault === true
        // or metadata.enabled_by_default === true
      });

      it("has a non-empty system prompt in the markdown body", () => {
        // Parse skill.md, verify parsed.content.length > 50
        // (50 chars minimum to ensure it's a real prompt, not empty)
      });

      it("has a unique slug matching the directory name", () => {
        // Parse skill.md, verify metadata.slug === slug (if present)
        // or verify the directory name matches the expected slug
      });
    });
  }

  it("all skill IDs (slugs) are unique", () => {
    // Verify ARTICLE_WRITER_SLUGS has no duplicates (belt-and-suspenders)
    // Also verify no slug matches an existing non-article-writer skill
  });
});
```

### Explanation of Test Cases

**"all 5 skill.md files exist and are readable"** -- Confirms the files were actually created in the correct directories. Uses `fs.existsSync` and `fs.readFileSync` on each path.

**"parses successfully via parseSkillFile"** -- Calls `parseSkillFile(content)` and verifies the returned `metadata` object has a non-empty `name` field and the `content` string is non-empty.

**"has execution_mode set to llm-only"** -- The orchestrator depends on this being `llm-only` mode. The YAML frontmatter uses `execution_mode` (snake_case) which is parsed by the skill parser into `metadata.execution_mode`.

**"has category that maps to a valid database enum value"** -- Calls `mapCategoryToEnum(metadata.category)` and asserts the result is `"chat_assistant"` (or whichever valid enum value was chosen). This catches the case where `content_writing` is accidentally used without being added to the parser mapping.

**"has enabledByDefault set to true"** -- These skills must be available to all users without admin activation.

**"has a non-empty system prompt in the markdown body"** -- The `content` returned by `parseSkillFile` is the markdown body after YAML frontmatter. This is the system prompt used by Phase 1. It must be substantial (not an empty or trivially short string).

**"all skill IDs (slugs) are unique"** -- Sanity check that no two article writer skills share a slug, which would cause conflicts in the skill registry.

## Auto-Sync Behavior

When the web server starts, `initializeSkillRegistry()` is called (from `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillRegistry.ts`). This triggers `autoSyncSkillsFromFolder()` which:

1. Scans the `skills/` directory for subdirectories containing `skill.md`
2. For each found skill, parses the `skill.md` via `parseSkillFile()`
3. Computes an MD5 content hash of the raw file content
4. Inserts new skills into the `skills` database table (or updates if hash changed)

The 5 new article writer skills will be automatically synced on the next server restart. No manual database insertion is needed.

**Important:** After creating the files, restarting the web service (`sudo systemctl restart smartspec-web.service`) will trigger the auto-sync. The skills will then appear in `skillRegistry.getSkillByIdAsync("general-article-writer")` etc.

## Implementation Checklist

1. Create directory `/home/dev/projects/SmartSpecPro/apps/web/skills/general-article-writer/`
2. Create `/home/dev/projects/SmartSpecPro/apps/web/skills/general-article-writer/skill.md` with YAML frontmatter and system prompt body
3. Create directory `/home/dev/projects/SmartSpecPro/apps/web/skills/business-article-writer/`
4. Create `/home/dev/projects/SmartSpecPro/apps/web/skills/business-article-writer/skill.md`
5. Create directory `/home/dev/projects/SmartSpecPro/apps/web/skills/education-article-writer/`
6. Create `/home/dev/projects/SmartSpecPro/apps/web/skills/education-article-writer/skill.md`
7. Create directory `/home/dev/projects/SmartSpecPro/apps/web/skills/marketing-article-writer/`
8. Create `/home/dev/projects/SmartSpecPro/apps/web/skills/marketing-article-writer/skill.md`
9. Create directory `/home/dev/projects/SmartSpecPro/apps/web/skills/lifestyle-article-writer/`
10. Create `/home/dev/projects/SmartSpecPro/apps/web/skills/lifestyle-article-writer/skill.md`
11. Create test file `/home/dev/projects/SmartSpecPro/apps/web/skills/__tests__/articleWriterSkills.test.ts`
12. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run skills/__tests__/articleWriterSkills.test.ts`
13. Verify all 5 skills parse correctly and pass all assertions

## Reference: Existing Skill Pattern

For reference, here is a simplified example of an existing skill that follows the same pattern (`/home/dev/projects/SmartSpecPro/apps/web/skills/translation/skill.md`):

```yaml
---
name: Translation
description: Translate text between English and your preferred language...
category: translation
icon: Languages
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 50
creditMultiplier: 1.0
---
```

The article writer skills follow the same structure with these differences:
- `category: chat_assistant` instead of domain-specific categories
- `execution_mode: llm-only` explicitly stated (Translation omits it, defaults to `llm-only`)
- No `triggerPatterns` (these are explicitly selected, never auto-detected)
- No `config` block needed

## Reference: How the Orchestrator Uses These Skills

In Section 06 (the orchestrator, `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts`), Phase 1 works as follows:

1. `const skill = await getSkillByIdAsync(input.articleSkillId)` -- loads the skill definition from the registry by slug
2. The orchestrator accesses `skill.skillContent` or `skill.systemPrompt` to get the system prompt text (the markdown body from `skill.md`)
3. It builds a messages array: `[{ role: "system", content: skillSystemPrompt }, { role: "user", content: buildArticlePrompt(topic, language, numSlides) }]`
4. It calls `invokeLLM()` with these messages -- NOT `executeSkill()`

This means the system prompt in each skill's markdown body is the primary deliverable. It must be a well-crafted LLM instruction that produces structured articles suitable for slide splitting.