---
slug: skills
title: Skills and Slash Commands
description: Using specialized AI workflows
icon: Zap
section: features
order: 20
pages: ["/chat"]
tags: [skills, slash commands, workflow, automation, detection]
---

# Skills and Slash Commands

## What are skills?

Skills are specialized AI workflows that go beyond a plain chat response. Each skill has a defined purpose, structured inputs, and a predictable output format — making them ideal for repeated, domain-specific tasks.

## Skill basics

- Type `/` in the message box to open the slash-command skill menu.
- Open the **Skills panel** (via the toolbar) to control which skills are enabled for the current conversation.
- Use skills when you want the assistant to follow a specialized workflow instead of giving a plain answer.
- If the task is repetitive or domain-specific, prefer a skill over repeating the same prompt instructions manually every time.

## Auto skill detection

SmartAI Hub can automatically detect when your message matches a skill — you don't always have to type `/` manually.

### Tips and examples

| What you type | Skill likely detected |
|---|---|
| `create image: a cat wearing a hat` | Image generation |
| `create video: product launch reveal` | Video generation |
| `enhance this prompt: ...` | Prompt enhancement |
| `write a research report on...` | Research / document skill |

### How auto-detection works

1. Your message is analyzed for intent signals (keywords, patterns, context).
2. The skill detector scores candidate skills by confidence.
3. If a skill scores above the detection threshold, it is automatically selected.
4. A skill badge appears in the UI to show which skill is active.
5. You can dismiss the auto-detected skill and continue with plain chat at any time.

## Managing skills

- Skills can be enabled or disabled per-conversation from the **Skills panel**.
- Admins can add custom skills or adjust skill priority from the **Admin → Skills** section.
- Skills are versioned — updates to a skill are reflected in new conversations.

## Skill output formats

Each skill defines its own output structure. Common output types include:

- **Markdown text** — Formatted content, reports, articles.
- **Media generation trigger** — Automatically submits an image, video, or audio generation request.
- **Structured data** — Tables, JSON, comparison outputs.
- **Prompt** — An enhanced or structured prompt ready for the next step.
