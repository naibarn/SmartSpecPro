---
slug: content-quality-dashboard
title: Content Quality
description: Monitor AI-generated content quality scores, track trends, and identify low-quality outputs.
icon: Award
section: admin
order: 280
pages: ["/admin/content-quality"]
tags:
  - "admin"
  - "content quality"
  - "metrics"
  - "AI output"
  - "scoring"
  - "help"
  - "help/en"
  - "help/core"
  - "core"
  - "content-quality-dashboard"
aliases:
  - "content-quality-dashboard"
  - "Content Quality"
  - "Content Quality help"
---

# Content Quality

## Overview
The Content Quality dashboard provides visibility into how well the platform's AI-generated outputs are performing against quality benchmarks. Each piece of generated content receives an automated quality score based on criteria such as coherence, relevance, and format compliance. This page surfaces scoring distributions, flags outputs that fall below acceptable thresholds, and tracks quality trends over time so you can detect regressions introduced by model changes or prompt updates.

## Getting there
Log in as an administrator and navigate to **Admin > Content Quality** from the left sidebar.

## Key capabilities
- View a score distribution histogram across all generated content
- Filter by skill type, LLM provider, model, or date range
- Identify individual outputs that scored below a configurable threshold
- Track the average quality score trend over days or weeks
- Compare quality scores across different models or provider configurations
- Export flagged low-quality records for manual review

## Workflow / How to use
1. Open **Admin > Content Quality**. The summary panel at the top shows the overall average score and the percentage of outputs that fell below the quality threshold for the selected period.
2. Use the **Date range** picker to set the analysis window.
3. Use the **Skill** and **Provider / Model** filters to narrow the view to a specific generation pipeline.
4. Review the **Score distribution** chart to understand the spread. A healthy distribution is concentrated in the upper range with few low-scoring outliers.
5. Scroll to the **Low-quality items** table to see individual outputs that scored below the threshold. Click a row to preview the generated content and its scoring breakdown.
6. To investigate a specific low-quality output further, copy its **Run ID** and look it up in Orchestration Logs or the audit log.
7. Click **Export flagged items** to download the low-quality list as CSV for manual review or stakeholder reporting.

## Tips
- The quality threshold is configurable in platform settings. Start with a threshold that flags the bottom 10 percent and adjust based on your review workload.
- A sudden drop in average score following a model update is a reliable signal that the new model requires prompt tuning.
- Score breakdowns per criterion (coherence, relevance, format) are visible in the item detail panel. Use these to diagnose whether a problem is structural (format) or semantic (coherence/relevance).
- Quality scoring runs asynchronously after generation and may appear with a short delay for very recent outputs.
- If a skill consistently produces low-quality scores, review its skill.md prompt for ambiguous instructions or missing output format guidance.

<!-- knowledge-graph:related:start -->
## Related Help

- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[task-queue-monitor|Task Queue Monitor]]
<!-- knowledge-graph:related:end -->
