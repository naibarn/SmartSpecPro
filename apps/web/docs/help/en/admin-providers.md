---
slug: admin-providers
title: Provider Management
description: Configure AI model providers
icon: Server
section: admin
order: 90
pages: ["/admin/providers", "/admin/multi-provider"]
tags: [admin, providers, models, configuration, api keys]
---

# Provider Management

## Overview

Admins configure which AI providers and models are available to users. The platform supports multiple LLM providers simultaneously and routes requests based on model availability, cost, and health.

## Adding a provider

1. Go to **Admin → Providers**.
2. Click **Add Provider**.
3. Select the provider type (OpenAI, Anthropic, Google, xAI, and others).
4. Enter the API key — it is stored encrypted and never exposed in the UI.
5. Save and the provider health check runs automatically.

## Managing models

Each provider exposes one or more models. After adding a provider:

- Click **Sync Models** to fetch the latest model list from the provider's API.
- Enable or disable individual models for your users.
- Set a **credit multiplier** per model to adjust the cost relative to the base credit rate.

## Multi-provider routing

The **Multi-Provider** admin view shows all active providers and their current health status. The router automatically:

- Avoids providers with circuit-breaker trips (repeated errors).
- Selects the most cost-effective available model that meets the request requirements.
- Falls back to secondary providers when the primary is unavailable.

## Provider health

Each provider shows a health indicator:

| Status | Meaning |
|---|---|
| Healthy | Requests are succeeding normally |
| Degraded | Some errors detected, but provider is still usable |
| Down | Circuit breaker open — provider is temporarily excluded from routing |

Admins can manually reset a circuit breaker from the provider detail page.

## Security notes

- API keys are encrypted at rest using AES-256-GCM.
- Keys are never returned in API responses — the UI shows only "configured" status.
- Rotate keys by entering a new value in the provider edit form.

## Media Providers

Media providers handle image, video, and audio generation:

- Navigate to **Admin → Media Providers** to manage providers.
- Supported providers include fal.ai, Replicate, and others.
- Each provider requires an API key configured in the provider settings.
- Enable/disable media providers independently of LLM providers.
- Each media provider lists the models it supports (image generators, video generators, audio models).

## Model Management

The platform provides dedicated pages to manage the full model catalog across all provider types:

- **LLM Models** (/admin/llm-models) — view, enable, and disable specific language models per provider. Set a credit multiplier to adjust the relative cost of each model.
- **Media Models** (/admin/media-models) — manage image, video, and audio generation models. Enable only the models you want users to access.
- **Model sync** — click **Sync Models** on any provider to fetch the latest model list from the provider's API. New models appear automatically after syncing.
- **Default models** — set the platform-wide default model per category (chat, image, video, audio). New users start with this model unless their domain admin overrides it.
- **Model-specific settings** — configure per-model parameters such as temperature defaults, maximum token limits, and pricing overrides for cost tracking.
