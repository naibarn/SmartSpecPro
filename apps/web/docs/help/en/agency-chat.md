---
slug: agency-chat
title: Agency Chat — Running & Testing Agencies
description: How to run agencies, read results, and use run options
icon: MessageSquare
section: advanced
order: 72
pages: ["/agencies", "/chat"]
tags:
  - "agency"
  - "chat"
  - "test"
  - "run"
  - "streaming"
  - "preview"
  - "model"
  - "target agent"
  - "instructions"
  - "cancel"
  - "retry"
  - "tool calls"
  - "guardrails"
  - "approval"
  - "browser session"
  - "help"
  - "help/en"
  - "help/teams"
  - "teams"
  - "agency-chat"
aliases:
  - "agency-chat"
  - "Agency Chat — Running & Testing Agencies"
  - "Agency Chat — Running & Testing Agencies help"
---

# Agency Chat

## Overview

Agency Chat is the conversation interface where you run an agency and see its results in real time. You type a request, and the agents work together automatically — you can watch each agent's output stream in, see tool calls as they happen, and receive a Preview Card when the work is complete.

There are **two ways** to run an agency:

| Method | Where | How it works |
|---|---|---|
| **Dedicated Agency Chat** | `/agencies/:id` page | Full-screen agency interface with Activity Panel |
| **Inline from AI Chat** | The normal `/chat` page | Run an agency without leaving your conversation |

## Running from the Dedicated Agency Chat Page

1. Go to **Agencies** from the sidebar.
2. Click any agency card to open it.
3. You land on the Agency Chat page for that agency, with the URL `/agencies/:id`.
4. Type your message and press Enter — the agency runs immediately.

## Running from AI Chat (Inline)

You can run agencies directly from the normal AI Chat page without navigating away. There are three ways to trigger it:

### Method 1: Run Agency Button

Click the **Run Agency** button in the Chat header bar. A picker dialog opens with a searchable list of your agencies. Select one, type your message, and press Enter — the agency runs inline below the chat.

### Method 2: Slash Command `/run-agency`

Type `/run-agency` in the chat input. It appears in the slash command autocomplete list. Select it to open the agency picker.

### Method 3: Auto-Detection

When you send a message in Chat that matches an agency's trigger phrases (generated automatically from the agency's name, description, and agent names), a **suggestion card** appears:

- Shows the detected agency name
- **Use Agency** button — sets that agency as the target so you can run it inline
- **Dismiss** button — ignores the suggestion

### Inline Run Experience

After selecting an agency (by any method above), a **purple panel** appears below the chat area:

1. The panel shows the agency name with a close button.
2. Type your message in the dedicated input field.
3. Press **Enter** or click **Send** — the agency runs immediately.
4. Results stream inline: you see agent responses, agent switches, tool calls, and guardrail events — all within the Chat page.
5. When done, close the panel with the **X** button or select a different agency.

## Screen Layout

The Agency Chat screen has three sections:

| Section | Location | Purpose |
|---|---|---|
| **Header bar** | Top | Agency name, agent count, active agent indicator, action buttons |
| **Conversation area** | Center | Messages, tool calls, previews, and status indicators |
| **Input bar** | Bottom | Text input, run options, send button |

On wide screens (≥ 1024 px) an **Activity Panel** opens on the right showing a timeline of agent activity.

## What to Type — Your Message Is the Task

The message you type is the **task** you are giving the agency. It is the single input that drives the entire run — the entry-point agent reads your message, interprets what you want, and coordinates the other agents to produce the result.

Think of it this way: your message answers the question **"What do you want this team to produce?"**

### If you have used ChatGPT Custom GPTs — it works the same way

Each agent in an agency works exactly like a Custom GPT:

| | ChatGPT Custom GPT | SmartSpecPro Agency Agent |
|---|---|---|
| **System prompt** | "Instructions" in GPT Builder | **Instructions** field on the Agent node |
| **User message** | Text you type in the chat | Text you type in Agency Chat |
| **Tools** | Actions, Code Interpreter, DALL-E | Web Search, Code Interpreter, API Caller, etc. |
| **Knowledge files** | Files uploaded in GPT Builder | Knowledge Base node |

The only difference is that an agency has **multiple agents working together** — like multiple Custom GPTs passing work to each other in a chain. The entry-point agent is the "first GPT" that receives your message, and it delegates subtasks to other agents based on its Instructions.

### How your message flows through the agency

Your message becomes the **User Input** that the agency processes. There is no separate input field on the nodes in the Builder — the chat message **is** the input.

Here is what happens step by step:

1. Your text is sent to the **entry-point agent** — the node marked with the green **entry** badge in the Builder. This is the only node that receives your message directly.
2. That agent reads your message **as the user message** in its LLM conversation. The agent's **Instructions** (configured in the Builder) become the system prompt. So the LLM sees: system prompt = Instructions, user message = your chat message.
3. The entry-point agent decides what to do based on its Instructions. For example, if its Instructions say *"Receive topics from the user and assign keyword research to the Researcher"*, it will read your topic from the chat message and delegate accordingly.
4. When the entry-point agent delegates to downstream agents, those agents receive **your original message + the results from previous agents** as combined context.
5. If the agency has a **Knowledge Base** node, relevant documents are automatically retrieved and attached alongside your message.

**Concrete example — an "SEO Content Team" agency:**

```
Your message: "Write an SEO article about cloud kitchen trends in Bangkok"
                │
                ▼
   ┌─────────────────────────┐
   │  SEO Manager (entry)    │  ← Receives your message as User Input
   │                         │  ← Instructions: "Receive topics from the
   │                         │     user and assign keyword research to
   │                         │     the Researcher, then assign writing
   │                         │     to the Writer."
   └──────┬────────┬─────────┘
          │        │
          ▼        ▼
   ┌────────────┐ ┌──────────────┐
   │ Keyword    │ │ SEO Writer   │  ← Receives your original message
   │ Researcher │ │              │     + Researcher's keyword results
   └────────────┘ └──────────────┘
```

Notice: the **Instructions** on the SEO Manager tell it *what to do with your message*. Your chat message provides *what topic to work on*. Together they drive the entire flow.

**Key insight:** You do not need to configure anything in the Builder to accept user input. The entry-point agent always receives the chat message automatically. The Instructions field tells the agent **how to use** that input — not what the input is.

### What makes a good message

Because your message is the only input the agents receive, **specificity matters**. A vague message produces vague results; a detailed message produces focused results.

| Quality | Bad Example | Good Example |
|---|---|---|
| **Be specific about the topic** | "Do some research" | "Research AI marketing trends in Southeast Asia for 2026" |
| **State the desired output** | "Make something about hotels" | "Compare 5 hotels in Chiang Mai under 3,000 THB/night with pool and breakfast" |
| **Define scope and constraints** | "Write a presentation" | "Build an 8-slide Q4 earnings deck focusing on revenue growth and new customers" |
| **Mention audience or tone** | "Summarize this" | "Write a non-technical executive summary for the board of directors" |
| **Set boundaries** | "Tell me about competitors" | "Compare only the top 3 direct competitors in the Thai market, ignore international players" |

### Example messages by agency type

| Agency Type | Example Messages |
|---|---|
| **Deep Research** | "Research the pros and cons of electric vehicles for fleet management in Thailand, including total cost of ownership and charging infrastructure" |
| **Storyboard Planner** | "Create a 60-second product launch video storyboard for a meal delivery app targeting young professionals in Bangkok" |
| **Deck Builder** | "Build a 10-slide investor pitch deck for a B2B SaaS platform that automates HR onboarding, emphasize market size and traction" |
| **Comparison Agent** | "Compare Notion, Coda, and Confluence for a 50-person team — focus on pricing, Thai language support, and real-time collaboration features" |
| **Custom Agency** | Describe the end result you want. Look at the agency's description and team members on the empty state screen — they tell you what the agency is designed to do. |

### Follow-up messages

After the first run completes, you can send another message to:

- **Refine the result**: "Add a section about regulatory risks"
- **Ask for a different format**: "Rewrite the comparison as a pros/cons table instead"
- **Drill deeper**: "Expand on finding #3 with more data sources"
- **Change scope**: "Redo this but focus only on Bangkok, not all of Thailand"

Each follow-up starts a new run. The agents do not automatically remember previous runs unless the agency is configured with conversation history.

## Sending a Message

1. Type your request in the text area at the bottom.
2. Press **Enter** to send (or click the **Send** button).
3. Use **Shift + Enter** to insert a new line without sending.
4. While agents are working, the input is disabled and a spinner shows on the Send button.

## What Happens During a Run

After you send a message, the system streams the agency run in real time:

1. **Agent activation** — The entry-point agent receives your message and starts processing.
2. **Streaming response** — The active agent's text appears word-by-word with a blinking cursor.
3. **Agent switches** — When one agent hands off to another, a centered badge like _"Analyst took over"_ appears in the conversation.
4. **Tool calls** — If an agent uses a tool (Web Search, Code Interpreter, etc.), a status indicator appears showing the tool name and a spinner while running, then a check or X when complete.
5. **Guardrail alerts** — If a guardrail triggers, a colored banner appears:
   - **Yellow (warned)** — The guardrail flagged something but the run continues.
   - **Red (blocked)** — The guardrail stopped the action.
6. **Human Approval** — If the workflow includes a Human Approval node, a blue card appears with **Approve** and **Reject** buttons. Click **Reject** to optionally provide feedback.
7. **Preview Card** — When the run produces a structured deliverable (report, storyboard, deck, comparison), a Preview Card appears for your review.

### Header Indicators

During a run the header shows:

- **Active agent badge** — which agent is currently working (color-coded).
- **Credits used** — running total of credits consumed so far.

## Run Options

Click the **⚙ gear icon** to the left of the input box to open Run Options:

### Target Agent

By default, your message goes to the agency's **entry point** (marked "(entry)" in the team list). If the agency has multiple agents, you can choose a specific agent from the dropdown to send your message directly to it — bypassing the normal routing.

- **Auto (entry point)** — default behavior.
- Select any other agent by name to target it directly.

### Additional Instructions

A free-text field for per-run instruction overrides. These instructions are appended to the agent's system prompt for this run only. Useful for:

- Specifying output format: _"Reply in Thai"_, _"Use bullet points only"_
- Adding constraints: _"Focus only on pricing, ignore reviews"_
- Adjusting tone: _"Write for a technical audience"_

Click the **X** on the Run Options panel to clear both settings and close it.

## Model Override

Click the **Model** button in the header bar to override which LLM model the agents use:

1. A popover opens with a model picker.
2. Select a model to apply it to **all agents** in this conversation.
3. A blue banner appears above the input: _"Using model override: gpt-4o"_ with a **Clear** link.
4. Click **Reset to agent defaults** to remove the override (each agent will use its own configured model).

This is useful for testing how an agency performs with different models without editing the agency configuration.

## Cancelling a Run

While agents are working, a **Cancel** button appears at the bottom of the conversation. Click it to see two options:

| Option | Behavior |
|---|---|
| **Cancel Now** | Stops the run immediately, mid-sentence. |
| **Cancel After Turn** | Lets the current agent finish its turn, then stops. |

## Retry on Error

If a run fails, a red error card appears with the error message and a **Retry** button. Clicking Retry re-sends your last message to start a fresh run.

## Preview Cards

When an agency finishes and produces a structured output, a **Preview Card** appears in the conversation:

| Preview State | What to Do |
|---|---|
| **Preview Ready** | Review the content, then click **Save to Library** or **Save as Presentation**. |
| **Saving...** | Wait for the commit to finish. |
| **Committed** | Done. For decks, you are redirected to the Presentation Editor. For others, a toast with "View in Library" appears. |
| **Save Failed** | Click **Retry Save** to try again. |
| **Expired** | The preview timed out. Send your request again for a fresh run. |

Click the **X** on the Preview Card to dismiss it without saving.

## Activity Panel

On desktop, click the **panel toggle** button (right side of header) to open or close the Activity Panel. It shows:

- **Active agent** — which agent is currently working.
- **Event timeline** — a chronological list of agent switches, tool calls, and milestones.
- A spinner while the run is in progress.

## Browser Session Integration

If your tenant has Browser Session enabled, Agency Chat adds extra capabilities:

### Open Browser Session

Click **Open Browser Session** in the header to launch a live browser the agents can use. If a session already exists, the button text changes to the session's status and clicking it reopens the session.

### Quick Browser Instruction

When a browser session is active, a card appears at the top of the conversation with:

1. A **skill selector** dropdown — choose what the browser should do (navigate, extract, compare, etc.).
2. A **text area** — describe the goal or next step.
3. A **Send Browser Instruction** button — queues the instruction for the browser session without leaving Agency Chat.

### Suggested Browser Launch

If you send a message that looks like it would benefit from a live browser (e.g., _"Find the best hotel deals in Bangkok"_), a suggestion card appears offering to launch a browser session. Click **Confirm** to launch or **Dismiss** to ignore.

## Creator Fee

Some community-created agencies charge a **creator fee** in credits per successful run. If applicable, an amber banner appears above the input showing the fee amount.

## Empty State

When you first open an agency (no messages yet), the conversation area shows:

- The agency name and description.
- **Team Members** — a list of all agents with their roles, color-coded. Supervisors show a crown icon, regular agents show a bot icon. The entry point agent is labeled "(entry)".
- A prompt: _"Send a message to start the conversation"_.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| **Enter** | Send message |
| **Shift + Enter** | New line |

## Tips

- **Start simple** — test with a short, specific request before attempting complex tasks, so you can verify the agency routing works.
- **Use Run Options for experimentation** — target specific agents or add temporary instructions without editing the agency.
- **Watch the Activity Panel** — it helps you understand how agents collaborate and identify bottlenecks.
- **Try model overrides** — a faster model may be fine for drafts, while a more capable model produces better final output.
- **Cancel gracefully** — use "Cancel After Turn" when possible to get partial results rather than nothing.

<!-- knowledge-graph:related:start -->
## Related Help

- [[teams|AI Teams]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[agencies|Agencies - Multi-Agent Teams]]
- [[agency-builder|Agency Builder]]
- [[groups|Groups]]
- [[team-monitoring|Team Monitoring & Scoped Memory]]
<!-- knowledge-graph:related:end -->
