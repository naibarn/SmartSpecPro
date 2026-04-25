---
slug: personas
title: AI Personas
description: Create and manage custom AI personalities
icon: UserCircle
section: features
order: 66
pages: ["/settings/personas", "/settings"]
tags:
  - "personas"
  - "personality"
  - "custom ai"
  - "style"
  - "tone"
  - "character"
  - "nickname"
  - "default persona"
  - "working hours"
  - "memory"
  - "help"
  - "help/en"
  - "help/knowledge"
  - "knowledge"
aliases:
  - "personas"
  - "AI Personas"
  - "AI Personas help"
---

# AI Personas

## What are personas

A persona is a named AI personality you configure once and reuse across conversations. Each persona carries its own system prompt, tone, knowledge focus, and communication style. When you activate a persona in chat, every response that session will follow the persona's defined behavior instead of the default assistant.

Common uses include a formal business writing assistant, a casual brainstorming partner, a domain expert in a specific field, or a character persona for creative writing.

## Creating a persona

1. Go to **Settings → Personas** and click **New Persona**.
2. Fill in the **Name** — keep it short and memorable (e.g., "Legal Reviewer", "Creative Writer").
3. Add a **Description** — a brief note to help you remember what this persona is for.
4. Optionally set a **Nickname** if you want to call this persona quickly from Chat, such as `@jane` or `@writer`.
5. Write the **System Prompt** — this is the core instruction given to the model. Be specific about tone, expertise, and constraints. For example:
   > "You are a concise legal editor. Review text for clarity and flag ambiguous clauses. Use formal language. Do not give legal advice."
6. Optionally configure **Working Hours** if this persona should expose a day-by-day availability window for future automation.
7. Optionally upload an **Avatar** image to visually identify the persona in the chat toolbar.
8. Click **Save**.

## Using personas in chat

- The **Persona Selector** appears in the chat toolbar (the icon shows the active persona's avatar or a default user icon).
- Click it to open the persona picker and choose any of your saved personas.
- The selected persona is active for the current conversation only.
- You can switch personas mid-conversation; the new persona applies from the next message forward.

## Setting a default persona

- In the Personas list, click **Set as default** to make new conversations start with that persona automatically.
- If you do not choose your own default, your workspace may still apply an organization-level default persona.
- You can still change the current conversation's persona at any time from the Persona Selector.

## Nicknames and calling personas from Chat

- If a persona has a **Nickname**, you can switch to it more quickly from Chat.
- Both `@nickname` mentions and natural nickname mentions are supported when the match is unambiguous.
- When a nickname match is detected, the conversation switches to that persona for the next message.
- If you have several similar persona names, prefer `@nickname` for the clearest match.

Examples:

- `@jane summarize today's news for me`
- `writer draft a product launch post`

## Day-by-day working hours

- Turn on **Use working hours** when you want to define the persona's availability window.
- Set one **Timezone**, then configure separate hours for Monday through Sunday.
- Any day with no time range is treated as **off**.
- Example:
  - Monday-Friday `09:00-18:00`
  - Saturday `08:00-12:00`
  - Sunday left blank = off
- Working Hours act as availability metadata for automation and planning. They do not automatically block chat replies by themselves.

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
- **Change nickname / working hours** — refine how the persona is called and when it is considered available.
- **Set default** — choose which persona should start your new chats.
- **Duplicate** — copy an existing persona as a starting point for a variation.
- **Delete** — permanently removes the persona. Active conversations using it continue unaffected until you switch away.
- **Reorder** — drag personas in the list to set the order they appear in the picker.

## Tips for effective personas

- Be explicit in the system prompt about what the persona should **not** do — constraints are as important as capabilities.
- Test a new persona with a few representative messages before relying on it for important work.
- Keep the system prompt under 500 words — longer prompts increase token usage per message.
- Use the Description field to document when and why you created the persona, not just what it does.
- When Memory is enabled, the system loads **long-term memory for the active persona**, so each persona can build its own reusable context.
- Conversation summaries and the current session history still belong to the chat itself, even if you switch personas mid-thread.

<!-- knowledge-graph:related:start -->
## Related Help

- [[document-management|Document Management]]
- [[getting-started|Getting Started]]
- [[chat|Chat Guide]]
- [[mcp-servers|MCP Server Integration]]
- [[memory|Memory System]]
<!-- knowledge-graph:related:end -->
