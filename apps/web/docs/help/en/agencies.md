---
slug: agencies
title: Agencies - Multi-Agent Teams
description: Multi-agent collaboration for complex tasks
icon: Users
section: advanced
order: 70
pages: ["/chat", "/agency"]
tags: [agency, agents, multi-agent, team, collaboration, research, storyboard]
---

# Agencies — Multi-Agent Teams

## What are agencies?

Agencies are multi-agent teams that work together to complete complex, structured tasks. Each agency has specialized agents (researcher, writer, planner, and others) that collaborate automatically, producing a deliverable that would take significant manual effort to create alone.

- Agencies are best for tasks that require **structured output** — reports, storyboards, decks, comparison tables.
- They run autonomously after you provide the initial request.
- Results are shown in a **Preview Card** for your review before you commit them.

## How to get started

1. Click **Agencies** in the Chat toolbar (or **Explore Agencies** on the welcome screen).
2. Browse available agency templates or create a custom one.
3. Run the agency using one of these methods:
   - **Open the agency** and type your request in the dedicated Agency Chat page.
   - **From AI Chat**: click **Run Agency** in the header, select an agency, type your message, and press Enter — the agency runs inline without leaving the chat.
   - **From AI Chat**: type `/run-agency` in the chat input and select from the list.
4. The agents work together automatically. When finished, a **Preview Card** appears.
5. Review the preview and click **Save** to commit it to your Library or Presentation Editor.

## Available agency templates

### Deep Research
- **Output**: Research Report
- **Description**: Multi-source research with executive summary, key findings, sections, and recommendations.
- **Example**: "Research AI marketing trends in Southeast Asia 2026"

### Storyboard Planner
- **Output**: Video Storyboard
- **Description**: Scene-by-scene video plan with dialogue, camera angles, lighting, and audio/video prompts.
- **Example**: "Create a 60-second product launch storyboard for a fitness app"

### Deck Builder
- **Output**: Presentation Deck
- **Description**: Full slide deck with titles, bullet points, speaker notes, and graphic suggestions. Saves directly to the Presentation Editor.
- **Example**: "Build a Q4 earnings presentation with 8 slides"

### Comparison Agent
- **Output**: Comparison Table
- **Description**: Side-by-side options with pricing, availability, evidence links, and recommendations.
- **Example**: "Compare 5 hotels in Chiang Mai under 3000 THB/night"

## Preview card states

| State | Meaning |
|---|---|
| **Preview Ready** | The agents finished. Review the preview and decide whether to save. |
| **Saving...** | Commit is in progress. |
| **Committed** | Saved successfully. For decks you are redirected to the Presentation Editor. For other types, a View in Library link appears in the toast. |
| **Save Failed** | Something went wrong. A Retry Save button appears so you can try again. |
| **Expired** | The preview timed out before you saved it. Run the agency again to get a fresh preview. |

## Save actions by output type

| Preview Type | Button | Where it goes |
|---|---|---|
| Research / Storyboard / Comparison | Save to Library | Library (toast shows View in Library link) |
| Presentation Deck | Save as Presentation | Redirects to Presentation Editor automatically |

## Other actions

- Click the **X** button on a Preview Card to dismiss it without saving.
- If the preview fails to load, a red error toast appears. Send the same message again to retry.
- If the save fails, the button changes to **Retry Save**. Click it to try again.

## Agency Templates

Browse pre-built agency templates at **Agencies → Templates**:

- **Deep Research** — Multi-source research with executive summary, key findings, sections, and recommendations. Best for competitive analysis, market research, and technical due diligence.
- **Storyboard Planner** — Scene-by-scene video planning with dialogue, camera angles, lighting, and audio/video prompts. Best for video production pre-production and pitch decks.
- **Deck Builder** — Full presentation deck generation with slide titles, bullet points, speaker notes, and graphic suggestions. Saves directly to the Presentation Editor.
- **Comparison Agent** — Side-by-side option comparison with pricing, availability, evidence links, and recommendations. Best for vendor evaluation, product selection, and feature comparisons.

Click any template to preview the agent configuration, then click **Use Template** to create a new agency pre-configured with the right agents and workflow. Give your agency a name and adjust any agent instructions before the first run.

## Agency Marketplace

Visit **Agencies → Marketplace** to discover community-created agencies:

- Browse by category: research, content creation, data analysis, video production, and productivity.
- Each listing shows the agents involved, typical output type, average run time, and user rating.
- Preview the agent configuration before installing — understanding the structure helps you write better prompts.
- One-click **Install Agency** adds it to your Agencies list immediately.

For building entirely custom agencies from scratch, see the [Agency Builder](/help/agency-builder) guide.

## AI Agency Creator

The **AI Agency Creator** lets you describe what you want in plain language and AI will design and build the entire agency for you automatically.

### How to use

1. Open the **Agency Builder** and click the **AI Agency Creator** button (sparkle icon).
2. Describe what you want the agency to do. Be as specific as possible — mention the agents you need, what they should do, and what output you expect.
3. Optionally attach a **spec file** (PDF, DOCX, TXT, or MD, up to 7.5 MB) with detailed requirements.
4. Click **Create Agency** — the AI processes your request through multiple phases.

### Creation phases

The AI Creator follows a multi-phase pipeline:

| Phase | What happens |
|-------|-------------|
| **Discover** | Analyzes your requirement, determines complexity, and recommends capabilities |
| **Plan** | Creates an architecture plan informed by past agency designs and learnings |
| **Review Plan** | Self-reviews the plan for completeness, fixing issues automatically |
| **Design** | Produces the full agency specification with agents, tools, and workflows |
| **Review Design** | Self-reviews the design for production readiness |
| **Validate** | Checks structural correctness (connectivity, entry points, edge types) |
| **Implement** | Creates the agency in the database with all agents and flows |
| **Suggest** | Generates optional improvement recommendations |
| **Document** | Writes a brief usage guide for the new agency |

### Improvement suggestions

After creation, you may see **Recommended Improvements** — these are optional suggestions from the AI about how to make your agency better. Each suggestion has:

- **Impact** (high / medium / low) — how much the change would improve the agency
- **Category** — what type of change (add capability, upgrade mode, add tool, etc.)
- **Description** — what the improvement would do

Review these suggestions and apply them manually in the Agency Builder if desired.

### Save as Template

After creating an agency, you can save it as a **reusable template**:

1. Click **Save as Template** at the bottom of the completion panel.
2. Enter a name and optional description.
3. Click **Save** — the template appears in your Templates library.

Templates preserve the agent definitions, node configurations, model requirements, and communication flows — but strip unique IDs so each new instance gets fresh ones.

### Tips for better results

- **Be specific**: "Create a research team with a web researcher, data analyst, and report writer" works better than "Make something for research".
- **Mention capabilities**: If you need web search, vision, or code execution, say so explicitly.
- **Describe the output**: "The final agent should produce a structured markdown report with sections" helps the AI design the right workflow.
- **Attach specs**: For complex requirements, attach a document with detailed specifications.
