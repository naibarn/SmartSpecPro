---
slug: admin-content-quality
title: Content Quality Dashboard
description: Monitor and improve AI-generated content quality metrics
icon: Award
section: admin
order: 63
pages: ["/admin/content-quality"]
tags: [quality, content, metrics, score, improvement, analysis]
---

# Content Quality Dashboard

## Overview

The Content Quality Dashboard tracks how well AI-generated content is performing across the platform. Quality scores are calculated automatically after each generation using a combination of model self-evaluation and configurable rubrics. Use this dashboard to identify underperforming skills or models and guide prompt improvement work.

> **Note:** Quality scores are statistical signals, not guarantees. A low score indicates a pattern worth investigating — not every individual low-scored output is necessarily bad.

## Quality Metrics

Each generated output is scored on three dimensions:

| Metric | What It Measures | Scale |
|--------|----------------|-------|
| **Accuracy** | Factual correctness and absence of hallucinations | 0–100 |
| **Relevance** | How well the output addresses the user's intent | 0–100 |
| **Completeness** | Whether all required components are present | 0–100 |

A **composite score** (weighted average) is shown alongside the individual dimensions. Default weights are equal; adjust them in **Admin → System Settings → Quality**.

### Score Bands

| Band | Range | Interpretation |
|------|-------|----------------|
| Excellent | 85–100 | Output meets or exceeds expectations |
| Good | 70–84 | Minor gaps; generally usable |
| Needs Review | 50–69 | Noticeable issues; review recommended |
| Poor | 0–49 | Output likely unsuitable; investigate |

## Filtering

Narrow the view using the filter bar:

- **Date range** — Analyze a specific period (last 7 days, last 30 days, or custom range).
- **Skill** — Filter to a single skill to measure that skill's output quality in isolation.
- **Model** — Compare output quality across different LLM or media models.
- **Score band** — Show only outputs in a given quality band (e.g., show only Poor outputs for triage).

Filters are combinable. For example: "Poor outputs from the blog-writer skill in the last 7 days using GPT-4o."

## Trends

The **Trends** chart plots composite quality score over time. Use this to:

- Detect regressions after a prompt or model change.
- Confirm improvements after a prompt update.
- Spot time-of-day patterns (e.g., lower quality during high load).

Switch between **daily average**, **7-day rolling average**, and **raw data points** using the chart controls.

> **Tip:** Pin a skill + model combination to the top of the dashboard to monitor it continuously after a prompt change.

## Actions

### Flag Low-Quality Outputs

Click any output row and select **Flag for Review**. Flagged outputs are added to the review queue so you can examine them in detail, mark them as false positives, or use them as training examples for prompt improvement.

### Adjust Prompts

When a skill consistently scores low on a specific dimension:

1. Note which dimension is weakest (Accuracy, Relevance, or Completeness).
2. Open **Admin → Skills** and edit the skill's system prompt.
3. Add explicit instructions that address the weak dimension.
4. Monitor the Trends chart for improvement over the next 24–48 hours.

### Export Data

Click **Export CSV** to download the filtered result set. Exported fields include: timestamp, skill, model, user ID (anonymized), composite score, and individual dimension scores.
