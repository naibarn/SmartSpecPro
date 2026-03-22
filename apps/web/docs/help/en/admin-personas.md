---
slug: admin-personas
title: Admin Personas
description: Manage AI assistant personas system-wide
icon: UserCircle
section: admin
order: 95
pages: ["/admin/personas"]
tags: [admin, personas, ai-assistant, tone, personality, system-prompt, customization, nickname]
---

# Admin Personas

## Overview

Admin Personas lets platform administrators create and manage AI assistant personalities that are available system-wide. Each persona defines a unique character with customized tone, behavior, and expertise.

## Creating a persona

1. Click **New Persona**.
2. Fill in the persona details:
   - **Name** — display name (e.g., "Creative Writer", "Code Mentor").
   - **Description** — brief summary of the persona's specialty.
   - **Nickname** — a short call-name for switching to the persona from Chat, such as `@writer`.
   - **Gender** — affects pronoun usage in some languages.
   - **Tone** — formal, casual, playful, professional, etc.
   - **System prompt** — the core instruction that shapes the AI's behavior.
3. Click **Save**.

## Calling platform personas by nickname

- If a platform persona has a nickname, users who can access that persona can switch to it from Chat more quickly with `@nickname`.
- This works well for shared personas that are used often, such as a newsroom assistant, writing assistant, or review assistant.
- Keep nicknames reasonably distinct to avoid ambiguous matches.

## Editing personas

- Click any persona in the list to open the edit form.
- Changes take effect for all new conversations using this persona.
- Existing conversations retain the persona settings they started with.

## Scope levels

| Scope | Who manages | Who can use |
|-------|-------------|------------|
| Platform | System admin | All users across all tenants |
| Tenant | Domain admin | Users within that tenant only |
| Personal | Individual user | Only the user who created it |

Admin Personas manages **platform-level** personas. Tenant-level personas are managed from **Domain Admin > Personas**.

## Token overhead

The token overhead indicator shows how many tokens the persona's system prompt consumes per message. Keep system prompts concise to minimize cost — aim for under 500 tokens.

## Usage statistics

Each persona card shows:

- **Conversations** — total conversations using this persona.
- **Messages** — total messages processed.
- **Last used** — when the persona was last active.

## Tips

- Create specialized personas for different use cases (writing, coding, analysis).
- Keep system prompts focused — a clear 2-3 sentence instruction works better than a page of rules.
- Review usage statistics to identify popular and unused personas.
