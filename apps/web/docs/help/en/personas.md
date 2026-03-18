---
slug: personas
title: AI Personas
description: Create and manage custom AI personalities
icon: UserCircle
section: features
order: 66
pages: ["/settings/personas", "/settings"]
tags: [personas, personality, custom ai, style, tone, character]
---

# AI Personas

## What are personas

A persona is a named AI personality you configure once and reuse across conversations. Each persona carries its own system prompt, tone, knowledge focus, and communication style. When you activate a persona in chat, every response that session will follow the persona's defined behavior instead of the default assistant.

Common uses include a formal business writing assistant, a casual brainstorming partner, a domain expert in a specific field, or a character persona for creative writing.

## Creating a persona

1. Go to **Settings → Personas** and click **New Persona**.
2. Fill in the **Name** — keep it short and memorable (e.g., "Legal Reviewer", "Creative Writer").
3. Add a **Description** — a brief note to help you remember what this persona is for.
4. Write the **System Prompt** — this is the core instruction given to the model. Be specific about tone, expertise, and constraints. For example:
   > "You are a concise legal editor. Review text for clarity and flag ambiguous clauses. Use formal language. Do not give legal advice."
5. Optionally upload an **Avatar** image to visually identify the persona in the chat toolbar.
6. Click **Save**.

## Using personas in chat

- The **Persona Selector** appears in the chat toolbar (the icon shows the active persona's avatar or a default user icon).
- Click it to open the persona picker and choose any of your saved personas.
- The selected persona is active for the current conversation only — starting a new conversation resets to the default assistant unless you re-select.
- You can switch personas mid-conversation; the new persona applies from the next message forward.

## Persona templates

Pre-built templates give you a starting point for common use cases:

- **Professional Writer** — formal tone, structured output, business context.
- **Creative Collaborator** — imaginative, exploratory, open-ended.
- **Data Analyst** — precise, numerical, structured summaries.
- **Language Tutor** — patient explanations, corrections, examples.
- **Code Reviewer** — technical focus, constructive critique, best practices.

Select a template when creating a new persona, then customize the system prompt to match your exact needs.

## Managing personas

- **Edit** — update name, description, system prompt, or avatar at any time. Changes apply to future conversations.
- **Duplicate** — copy an existing persona as a starting point for a variation.
- **Delete** — permanently removes the persona. Active conversations using it continue unaffected until you switch away.
- **Reorder** — drag personas in the list to set the order they appear in the picker.

## Tips for effective personas

- Be explicit in the system prompt about what the persona should **not** do — constraints are as important as capabilities.
- Test a new persona with a few representative messages before relying on it for important work.
- Keep the system prompt under 500 words — longer prompts increase token usage per message.
- Use the Description field to document when and why you created the persona, not just what it does.
- Personas do not have persistent memory by default — use the Memory feature alongside a persona for context that should carry across sessions.
