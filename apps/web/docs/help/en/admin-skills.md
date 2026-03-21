---
slug: admin-skills
title: Skill Management
description: Manage AI skills, repositories, and marketplace
icon: Wand2
section: admin
order: 120
pages: ["/admin/skills", "/admin/skill-repositories"]
tags: [admin, skills, manage, repository, marketplace, enable, disable, upload]
---

# Skill Management

## Overview

Skills are specialized AI workflows that extend the default chat experience. Skill Management lets administrators see all installed skills, control which ones are available to users, configure their properties, and add skills from external repositories or the marketplace.

## Skill list

The skills table shows every skill installed on the platform with:

- **Name** and icon
- **Category** — prompt_enhancement, image_generation, video_generation, audio_generation, chat_assistant
- **Status** — enabled or disabled
- **Priority** — determines detection order when multiple skills might match (higher = checked first)
- **Credit multiplier** — usage cost relative to a standard request
- **Auto-trigger** — whether the skill fires automatically based on message content
- **Last synced** — when the skill files were last read from disk

## Enabling and disabling skills

- Toggle the **Active** switch on any skill row to enable or disable it for all users immediately.
- Disabled skills do not appear in the slash-command menu, cannot be auto-detected, and cannot be invoked by the API.
- Disabling a skill does not delete it — re-enabling restores it instantly.
- Individual users cannot override a skill that is disabled at the admin level.

## Skill details

Click a skill name to open its detail panel:

- **Triggers** — the phrases or patterns that cause the skill to auto-detect (read from `skill.md` frontmatter).
- **System prompt preview** — the actual content of `skill.md` that is sent as the system prompt.
- **Input schema** — the fields defined in `schemas/input.schema.json` or `schemas/ui.schema.json`.
- **Execution mode** — `llm-only` (text output) or `media-generate` (auto-execute media generation).
- **Edit settings** — change priority, credit multiplier, or enabled-by-default status directly from the UI.

## Repositories

Skill repositories are external directories or Git sources that the platform syncs skills from.

- **Add repository** — provide a name, source path, and sync interval.
- Repositories are checked on the configured schedule; new or updated skills are synced automatically.
- Each repository entry shows its last successful sync time and the number of skills it contributed.
- **Manual sync** — trigger an immediate sync for a specific repository.
- **Remove repository** — stops future syncs. Skills already installed from that repository remain until manually deleted.

## Auto-sync behavior

Skills stored in the local `apps/web/skills/` folder are synced on server startup and then on a **60-second cache** cycle. When you add or update a skill file on disk:

1. The skill registry detects the change on the next cycle (or immediately after a restart).
2. New skills are inserted into the database; updated skills (detected by content hash) are updated automatically.
3. Deleted skill folders result in the skill being marked as inactive, not deleted from the database.

## Skill file structure

Each skill lives in its own folder under `apps/web/skills/`:

```
skills/
  my-skill/
    skill.md                  # Frontmatter + system prompt content
    schemas/
      input.schema.json       # Standard JSON Schema for inputs
      ui.schema.json          # Optional: custom UI layout with sections and Thai labels
    references/               # Optional: additional context documents
```

See `skill.md` frontmatter fields in the [Skills guide](./skills.md) for full documentation.

## Unified Skill Execution

Skills now run through a **unified execution system** that ensures consistent behavior across all channels (Chat, Team Rooms, Agencies). This system is controlled by the `unifiedSkillExecution` feature flag.

### How it works

When unified execution is enabled for a tenant:

1. **Capability classification** — Each skill is classified by type: text generation, image, video, or audio.
2. **Executor routing** — The system routes the request to the appropriate executor (Text, Image, Video, or Audio).
3. **Context enrichment** — Persona memory, scoped memory, and conversation context are injected automatically.
4. **Model selection** — The best available model is selected based on skill requirements (vision support, web search, thinking mode).
5. **Rate limiting** — Executions are limited to 15 per minute per user.
6. **Credit tracking** — Every execution is logged with an idempotency key to prevent duplicate charges.
7. **Audit logging** — Full execution trace recorded for debugging.

### Feature flag

- **Flag name:** `unifiedSkillExecution`
- **Default:** Off (disabled)
- **Enable per tenant** in Admin Settings to gradually roll out.
- When off, the existing execution paths run unchanged.
- When on, requests are routed through the unified orchestrator. If the orchestrator fails, the system automatically falls back to the previous execution path.

### Execution modes (updated)

| Mode | Unified Executor | Description |
|------|------------------|-------------|
| `llm-only` | TextSkillExecutor | Text generation via LLM with model fallback |
| `media-generate` (image) | ImageGenerationExecutor | Routes to image generation pipeline |
| `media-generate` (video) | VideoGenerationExecutor | Routes to video generation pipeline |
| `media-generate` (audio) | AudioGenerationExecutor | Routes to audio generation pipeline |

### Adding custom executors

Developers can register custom executors for new capability families using `registerExecutor()`. Each executor implements the `CapabilityExecutor` interface with `canHandle()` and `execute()` methods.

## Marketplace

The **Marketplace** tab (when enabled) lists community-contributed skills available for installation:

- Browse by category, rating, and install count.
- Click **Install** to download and add the skill to your platform — it appears in the skill list as disabled until you activate it.
- **Updates** — installed marketplace skills show a badge when a newer version is available.
- Review the skill's system prompt and schemas before enabling it for users.
