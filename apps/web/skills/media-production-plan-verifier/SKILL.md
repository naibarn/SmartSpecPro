---
name: media-production-plan-verifier
description: Verifies a production plan/storyboard package for goal alignment, feasibility, budget risk, product truth, and downstream readiness before approval.
version: 1.0.0
category: automation
icon: shield-check
tags: [media-production, verification, qa]
auto_trigger: false
enabled_by_default: true
credit_multiplier: 0.5
priority: 76
execution_mode: llm-only
---

# Media Production Plan Verifier

Inspect the planner output. Return JSON only. Do not approve plans with hard policy blocks or unsupported product claims.
