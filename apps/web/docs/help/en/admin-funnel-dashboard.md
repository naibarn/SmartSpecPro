---
slug: admin-funnel-dashboard
title: Funnel Dashboard
description: Visualize user engagement and conversion funnels to identify drop-off points and improve adoption.
icon: BarChart3
section: admin
order: 270
pages: ["/admin/funnel"]
tags:
  - "admin"
  - "funnel"
  - "analytics"
  - "conversion"
  - "user journey"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-funnel-dashboard"
aliases:
  - "admin-funnel-dashboard"
  - "Funnel Dashboard"
  - "Funnel Dashboard help"
---

# Funnel Dashboard

## Overview
The Funnel Dashboard provides a step-by-step view of how users move through key journeys in the platform, from initial signup through core feature adoption. Each stage of a funnel shows the number of users who reached that stage and the percentage who continued to the next one. Use this data to spot where users are dropping off and to prioritize experience improvements.

## Getting there
Log in as an administrator and navigate to **Admin > Funnel** from the left sidebar.

## Key capabilities
- View pre-built funnels for common journeys such as signup, first skill use, and subscription upgrade
- See absolute user counts and conversion rates at each funnel stage
- Compare funnel performance across different time periods
- Segment funnel data by user cohort, plan type, or signup date
- Identify the stages with the highest drop-off rates at a glance
- Export funnel data for use in external analytics tools

## Workflow / How to use
1. Open **Admin > Funnel**. The page loads with the default funnel (typically the signup-to-activation funnel).
2. Use the **Funnel** selector at the top to switch between available funnel definitions.
3. Set the **Date range** to analyze a specific period. Use the comparison toggle to overlay a previous period for trend analysis.
4. Read the funnel chart from top to bottom. Each bar represents one stage; its width reflects the proportion of users who reached it relative to the first stage.
5. Hover over a stage bar to see the exact user count, percentage from the previous stage, and percentage from the top of the funnel.
6. Apply a **Segment** filter (e.g., plan type = Free) to narrow the analysis to a specific user group.
7. Click **Export** to download the current funnel data as a CSV file.

## Tips
- A drop-off of more than 50 percent at a single stage usually indicates a usability barrier or a missing onboarding prompt at that step.
- Compare funnel performance before and after a product change to measure its impact on conversion.
- Segmenting by plan type often reveals that free-tier users drop off at different stages than paid users, which can guide upsell messaging.
- Funnel data is computed from event logs and typically has a processing delay of up to 2 hours. Very recent activity may not yet be reflected.
- If a funnel stage shows zero users, check that the corresponding event is still being tracked correctly in the analytics pipeline.

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
