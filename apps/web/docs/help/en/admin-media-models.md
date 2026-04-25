---
slug: admin-media-models
title: Media AI Models
description: Manage available media generation models
icon: Sparkles
section: admin
order: 92
pages: ["/admin/media-models"]
tags:
  - "admin"
  - "media"
  - "models"
  - "image"
  - "video"
  - "audio"
  - "generation"
  - "catalog"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-media-models"
aliases:
  - "admin-media-models"
  - "Media AI Models"
  - "Media AI Models help"
---

# Media AI Models

## Overview

The Media AI Models page lets administrators manage the catalog of available media generation models for image, video, and audio creation. Enable or disable models, configure settings, and control which models users can access.

## Model catalog

The main table displays all registered media models with:

- **Name** — model identifier (e.g., `flux-pro`, `stable-diffusion-xl`).
- **Provider** — which service hosts the model (FAL.ai, Kie.ai, Stable Diffusion, etc.).
- **Type** — image, video, or audio.
- **Status** — enabled (green) or disabled (gray).
- **Cost** — credits per generation.

## Filtering and search

- **Search** by model name or provider.
- **Filter** by type (image/video/audio) or by provider.
- **Filter** by status (enabled/disabled).

## Enabling and disabling models

Toggle the switch next to a model to enable or disable it:

- **Enabled** — users can select this model in Media Studio.
- **Disabled** — model is hidden from users but its configuration is preserved.

## Model settings

Click a model row to configure:

- **Default parameters** — resolution, quality, steps, etc.
- **Credit cost** — how many credits each generation consumes.
- **Rate limits** — maximum generations per user per hour.
- **Priority** — display order in the model selector.

## Tips

- Disable models that have high error rates until the provider stabilizes.
- Set higher credit costs for expensive models to manage usage.
- Keep at least one image and one video model enabled at all times.

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
