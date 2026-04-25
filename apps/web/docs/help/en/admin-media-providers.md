---
slug: admin-media-providers
title: Media Providers
description: Configure external media generation providers
icon: Layers
section: admin
order: 91
pages: ["/admin/media-providers"]
tags:
  - "admin"
  - "media"
  - "providers"
  - "api-key"
  - "health"
  - "quota"
  - "cost"
  - "stable-diffusion"
  - "fal"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-media-providers"
aliases:
  - "admin-media-providers"
  - "Media Providers"
  - "Media Providers help"
---

# Media Providers

## Overview

Media Providers management configures the external services that power image, video, and audio generation. Set up API keys, monitor health, manage quotas, and track costs per provider.

## Adding a provider

1. Click **Add Provider**.
2. Select the provider type (FAL.ai, Kie.ai, Stable Diffusion, Replicate, etc.).
3. Enter the **API key** — it is encrypted before storage.
4. Configure optional settings:
   - **Base URL** — override for self-hosted instances.
   - **Timeout** — maximum wait time for generation requests.
   - **Concurrent limit** — max parallel requests to this provider.
5. Click **Save**.

## Provider health

Each provider card shows:

- **Status** — healthy (green), degraded (yellow), down (red).
- **Latency** — average response time for the last 100 requests.
- **Error rate** — percentage of failed requests.
- **Circuit breaker** — if errors exceed the threshold, the provider is temporarily disabled.

The health check runs automatically every 60 seconds.

## Quota management

Set spending limits per provider:

- **Daily limit** — maximum USD spend per day.
- **Monthly limit** — maximum USD spend per month.
- When a limit is reached, the system routes requests to alternative providers.

## Cost tracking

The cost panel shows:

- **Total spend** this month per provider.
- **Cost per generation** breakdown by model.
- **Trend chart** showing daily spend over the last 30 days.

## Tips

- Configure at least two providers for redundancy — if one goes down, the other takes over.
- Set conservative daily limits initially, then increase based on actual usage.
- Check error rates weekly to identify providers that need API key rotation.

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
