---
slug: credits
title: Credits System
description: Understanding and managing your AI credits
icon: Coins
section: getting-started
order: 5
pages: ["/credits", "/dashboard"]
tags:
  - "credits"
  - "pricing"
  - "usage"
  - "cost"
  - "balance"
  - "help"
  - "help/en"
  - "help/account"
  - "account"
aliases:
  - "credits"
  - "Credits System"
  - "Credits System help"
---

# Credits System

Credits are the currency used to pay for AI requests on SmartAI Hub. Every time you send a message, generate media, or run an agency, credits are deducted based on the cost of the underlying AI model call.

## How credits work

- Each LLM request consumes credits proportional to the number of tokens processed (input + output).
- Media generation (images, video, audio) consumes a fixed credit amount per generation based on the provider and quality settings.
- Agencies consume credits for each agent step within the workflow.
- Credit costs are shown in the UI before expensive operations where possible.

## Checking your balance

Your current credit balance is displayed in the top bar. Click **Credits** in the sidebar for a detailed breakdown including:

- Current balance
- Recent transactions with timestamps and amounts
- Per-request cost breakdown by model

## Worker Runtime charges

If a supported task runs through an external Claw worker, the transaction history shows it as **Worker Runtime**.

This is useful when you want to confirm:

- the task really used the external worker path
- credits were consumed by a worker job rather than normal chat
- a team or workflow is pointing to the expected runtime

Important:

- these charges still come from the worker owner's balance
- personal worker budget caps can stop more SmartSpecPro-routed usage in the current hour, 5-hour window, day, week, or month
- if the worker calls an outside service with its own credentials, that outside cost is separate and does not appear as SmartSpecPro worker credit usage

## Topping up

Click the **Top Up** button on the Credits page to purchase additional credits. Credits are non-expiring and tied to your account.

## Model pricing

Different AI models cost different amounts of credits:

- **Economy models** (e.g., Gemini Flash, GPT-4o-mini) — lowest cost, good for simple tasks
- **Standard models** (e.g., GPT-4o, Claude Sonnet) — balanced cost and capability
- **Premium models** (e.g., GPT-o1, Claude Opus) — highest cost, best for complex reasoning
- **Media generation** — fixed cost per generation, varies by provider and quality

The exact cost per request is shown in the message cost badge after each response.

## Usage analytics

Navigate to **Usage** in the sidebar to see:

- Daily/weekly/monthly credit consumption
- Breakdown by model and feature type
- Top cost drivers
- Budget alerts if configured

## Rate limiting

Skill executions (including media generation) are rate-limited to **15 executions per minute** per user. This applies equally across Chat, Team Rooms, and Agency workflows. If the limit is reached, the system returns an error — wait a moment and retry.

## Cost-saving tips

- Use lighter models (e.g., smaller parameter models) for simple tasks like summarization and classification.
- Reserve high-capability models for complex reasoning, code generation, or creative tasks.
- **AI Team runs** use credits from all participating agents — set budget caps in the run stop policy to control costs.
- Use skills to structure prompts efficiently rather than re-typing long instructions manually.
- Check the model picker tooltip to compare costs before switching models.
- The unified execution system deduplicates credit tracking with **idempotency keys** — even if a request is retried, you will not be charged twice for the same execution.

<!-- knowledge-graph:related:start -->
## Related Help

- [[settings|Settings & Preferences]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[api-keys|API Keys]]
- [[notification-settings|Notification Preferences]]
- [[profile|Profile & Account]]
- [[usage-analytics|Usage Analytics & Task Monitor]]
<!-- knowledge-graph:related:end -->
