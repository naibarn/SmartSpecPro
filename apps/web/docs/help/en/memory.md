---
slug: memory
title: Memory System
description: AI memory for preferences and context
icon: Brain
section: features
order: 60
pages: ["/chat", "/settings"]
tags: [memory, preferences, context, project, remember]
---

# Memory System

## What memory does

Memory allows the AI to remember your preferences, project context, decisions, and important facts across all conversations. Instead of re-explaining your setup every time, memory carries that context forward automatically.

## Memory modes

| Mode | Description |
|---|---|
| **Auto** | The AI decides what is worth saving based on importance signals in the conversation |
| **Always ask** | The AI prompts you before saving anything to memory |
| **Off** | Nothing is saved to memory automatically (you can still save manually) |

Change your memory mode in **Settings → Memory**.

## Memory types

The system organizes saved information into nine categories:

| Type | What it stores |
|---|---|
| **Preferences** | Your style, tone, format, and output preferences |
| **Facts** | Explicit statements you want the AI to always know |
| **Decisions** | Choices you made that affect future work |
| **Project context** | Goals, constraints, stakeholders, and background for active projects |
| **Instructions** | Recurring instructions you give the AI regularly |
| **Summaries** | Condensed records of past conversations |
| **Entities** | People, companies, products, or concepts you reference often |
| **Workflows** | Processes or templates you use repeatedly |
| **Feedback** | Corrections and calibration notes from previous sessions |

## Automatic memory

When auto mode is on, the AI monitors conversations for:

- Explicit statements of preference or fact ("I prefer short bullet lists")
- Repeated patterns that suggest a workflow ("I always start reports with an executive summary")
- Important decisions that affect upcoming work
- Project-specific context that should persist

## Auto-summarization

Long conversations are automatically summarized and stored as memory when they end. This keeps context fresh without filling the context window with old messages.

## Projects

You can associate memories with a specific **project**. Project-scoped memories are only loaded when you are working in that project context, keeping your workspace clean.

To create a project:
1. Go to **Settings → Memory → Projects**.
2. Create a new project and give it a name and description.
3. When you start a Chat session and select that project, its memories are automatically included.

## Managing your memories

- Go to **Settings → Memory** to view all saved memories.
- Click any memory to edit or delete it.
- Use the search bar to find specific memories by keyword.
- Group memories by type or project using the filter options.

## Tips for effective memory use

- **Be explicit** — Statements like "I always want formal English output" are easier for the AI to detect and save.
- **Correct mistakes** — If the AI does something wrong, say so explicitly ("Don't do X in the future") so it can save that as a calibration.
- **Use projects** — Separate memories for different clients or domains to avoid context bleed.
- **Review periodically** — Old memories can become outdated. Review and clean them up in Settings.
- **Save manually** — Click **Save to Memory** on any message that contains something important to preserve.
