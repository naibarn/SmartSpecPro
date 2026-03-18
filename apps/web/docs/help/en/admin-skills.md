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

## Marketplace

The **Marketplace** tab (when enabled) lists community-contributed skills available for installation:

- Browse by category, rating, and install count.
- Click **Install** to download and add the skill to your platform — it appears in the skill list as disabled until you activate it.
- **Updates** — installed marketplace skills show a badge when a newer version is available.
- Review the skill's system prompt and schemas before enabling it for users.
