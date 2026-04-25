---
slug: admin-llm-models
title: LLM Model Mappings
description: Manage LLM model catalog and provider assignments
icon: Brain
section: admin
order: 89
pages: ["/admin/llm-models"]
tags:
  - "admin"
  - "llm"
  - "models"
  - "mapping"
  - "providers"
  - "enable"
  - "disable"
  - "default"
  - "catalog"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-llm-models"
aliases:
  - "admin-llm-models"
  - "LLM Model Mappings"
  - "LLM Model Mappings help"
---

# LLM Model Mappings

## Overview

LLM Model Mappings lets administrators manage the catalog of language models available on the platform. Configure which models are enabled, assign models to providers, and set defaults for each capability.

## Model catalog

The page shows all registered LLM models grouped by provider:

- **Model name** — identifier (e.g., `gpt-4o`, `claude-sonnet-4-20250514`, `gemini-pro`).
- **Provider** — OpenAI, Anthropic, Google, Groq, local, etc.
- **Capabilities** — chat, completion, vision, function calling.
- **Status** — enabled or disabled.
- **Cost** — input/output token pricing.

## Enabling and disabling

Toggle the switch next to a model to control availability:

- **Enabled** — model appears in the chat model selector and can be used by skills.
- **Disabled** — hidden from users, no requests routed to it.

## Default model settings

Set the default model for each capability:

- **Chat default** — the model pre-selected when users open a new chat.
- **Skill execution** — the model used when a skill doesn't specify one.
- **Vision** — default model for image understanding tasks.

Configure defaults in the **Defaults** section at the top of the page.

## Model groups

Models are organized into groups for the model selector UI:

- **Premium** — highest quality, higher cost (GPT-4, Claude Opus).
- **Standard** — balanced quality and cost (GPT-4o-mini, Claude Sonnet).
- **Fast** — lowest latency, lowest cost (Groq, local models).

## Cost configuration

Each model has configurable pricing:

- **Input cost** — cost per 1K input tokens.
- **Output cost** — cost per 1K output tokens.
- **Credit multiplier** — how many user credits equal one unit of cost.

## Tips

- Keep at least one model enabled per capability category.
- Set cost-effective models as defaults to manage credit consumption.
- Disable models that are temporarily unavailable from their provider.

<!-- knowledge-graph:related:start -->
## Related Help

- [[admin-advanced|Advanced Administration]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[admin-agencies|Agency Management]]
- [[admin-alert-rules|Alert Rules & Escalation]]
- [[admin-approvals|Approvals]]
- [[admin-audit|Audit Logs]]
<!-- knowledge-graph:related:end -->
