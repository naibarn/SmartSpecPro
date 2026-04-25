---
slug: chat
title: Chat Guide
description: How to use the AI chat interface
icon: MessageSquare
section: features
order: 10
pages: ["/chat"]
tags:
  - "chat"
  - "conversation"
  - "model"
  - "message"
  - "teams"
  - "persona"
  - "nickname"
  - "approval"
  - "workflow board"
  - "team room"
  - "artifact"
  - "help"
  - "help/en"
  - "help/knowledge"
  - "knowledge"
aliases:
  - "chat"
  - "Chat Guide"
  - "Chat Guide help"
---

# Chat Guide

## What Chat is best for

Chat is the fastest place to ask for answers, drafts, brainstorming, prompt building, analysis, and follow-up work. Start here when you want direct interaction with an AI model and only move into Browser Session or Agencies when the task needs a different execution surface.

## Chat basics

1. **Type a normal message** to chat with the selected model.
2. **Use the model picker** at the top of the conversation to switch the active LLM at any time.
3. **Use the Persona Selector** in the toolbar to choose which persona is speaking in this conversation.
4. **Use AI Teams** when you want multiple models to collaborate — go to the Teams page to start a team discussion.
5. **Attach files or images** when the task depends on source material (documents, screenshots, reference photos).

## Personas in Chat

- The active persona is shown in the conversation toolbar.
- Switching from the Persona Selector takes effect on the next message immediately.
- If you set a **default persona**, new conversations start with that persona automatically.
- If a persona has a **nickname**, you can call it with `@nickname` or a clear natural-language nickname mention to switch personas.
- Work status, prepared drafts, and long-term memory retrieval in Chat follow the **currently active persona**.

## Skills and slash commands

- Type `/` in the message box to open the slash-command skill menu and browse available workflows.
- Open the **Skills panel** to control which skills are enabled for the current conversation.
- Use skills when you want the assistant to follow a specialized workflow instead of giving a plain answer.
- If the task is repetitive or domain-specific, prefer a skill over repeating the same instructions manually every time.
- Skills are executed through a **unified execution system** — the same skill produces the same result whether called from Chat, a Team Room, or an Agency workflow.

## Image, video, and audio generation

- **Generate Image**: seed the prompt with `create image:` and describe the visual outcome you want.
- **Generate Video**: seed the prompt with `create video:` for motion-focused outputs.
- **Generate Audio**: use this when you want voice, music, or sound generation.
- **Prompt enhancement**: type a rough image idea and use the prompt-enhance action to have the system refine it before generating.
- You can **attach a reference image** and ask the model to edit or extend it.
- Media generation requests are **rate-limited** — up to 15 executions per minute per user to ensure fair usage across the platform.

## Memory

- Open **Memory** to review saved facts, preferences, summaries, and project-linked context.
- Use **Save to Memory** when a message contains something worth reusing in future conversations.
- Memory is conversation-aware and can carry project context across follow-up chats.
- Use Memory when you want the assistant to remember stable preferences instead of repeating them every time.
- **Long-term memory** is loaded for the active persona, so each persona can keep its own reusable memory context.
- **Conversation summaries** still stay with the current chat session even if you switch personas mid-thread.

## Persona work status, drafts, and artifacts

- If the active persona is also working inside a team, Chat can use that persona's work context to answer operational questions more accurately.
- You can ask things like:
  - `what is Jane working on right now`
  - `show me the latest draft`
  - `is the next post ready`
  - `what assets are already prepared`
- The assistant will try to summarize open tasks, the latest prepared draft, related artifact references, and recent room updates for that persona.
- This work-aware context is scoped to the **current persona only**. It does not mix in tasks from other personas.

## Approvals and workflow navigation from Chat

- If the persona's work is waiting for human approval or feedback, Chat can explain the status and next step.
- Chat may show **action cards / links** that open the related **Team Room** or **Workflow Board**.
- Use these links to:
  - open the exact room for the task
  - jump to the thread that needs a reply
  - open the room's Workflow Board directly
- **Approve / reject / send back** actions should still be completed inside Team Room rather than directly inside Chat.

## Starting tracked work from Chat

- Use the **Start tracked work** card when a conversation should become a real request instead of staying as an untracked chat thread.
- Open the **Work Request** page when you want to create the request yourself.
- Open the **Work OS Guide** if you want a step-by-step explanation of how work enters the system.
- Open **Work OS Console** when you are an admin and need to route requests, attach legacy work, or review the full lifecycle.
- If work comes from another system, use webhook or API intake so the request appears in Work OS without manual copy-paste.

## Browser Session from Chat

- Use **Browser Session** when the task requires live websites, comparison across pages, or a real browser workflow.
- Start Browser Session from Chat, then continue in the live workspace or keep sending quick browser instructions from Chat.
- Browser Session is best for finding websites, navigating pages, comparing options, and pausing for approval-sensitive steps.

## Common use-case patterns

| Goal | What to do |
|---|---|
| Quick answer + save the decision | Chat → Save to Memory |
| Switch to a specific persona | Persona Selector or type `@nickname` |
| Specialized document or research workflow | Type `/` and pick a skill |
| Image concept with refined prompt | Type rough idea → prompt-enhance → Generate Image |
| Live website data needed | Switch to Browser Session |
| Compare two approaches | Use AI Teams |
| Research report or slide deck | Click **Run Agency** in the header or type `/run-agency` — runs inline without leaving Chat |
| Check a persona's work status or draft | Ask in Chat, then use the action card to open Team Room / Workflow Board |

<!-- knowledge-graph:related:start -->
## Related Help

- [[document-management|Document Management]]
- [[getting-started|Getting Started]]
- [[mcp-servers|MCP Server Integration]]
- [[memory|Memory System]]
- [[personas|AI Personas]]
<!-- knowledge-graph:related:end -->
