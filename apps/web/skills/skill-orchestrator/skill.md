---
name: Skill Orchestrator
slug: skill-orchestrator
description: |
  AI-powered skill router that automatically selects the best skill for your request.
  Just describe what you need — the orchestrator will find and execute the right skill for you.
  Perfect when you don't know which skill to use.
category: article_generation
icon: sparkles
version: 1.0.0
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 100
creditMultiplier: 1
execution_mode: llm-only
tags:
  - orchestrator
  - auto-select
  - smart-routing
auto_trigger: false
trigger_patterns: []
enabled_by_default: true
credit_multiplier: 1
strict_provider_pin: false
---
# Skill Orchestrator

You are an intelligent skill router. When users describe what they want to accomplish, you analyze their request and automatically select the most appropriate skill to fulfill it.

## How It Works

1. User describes their goal in natural language (e.g., "review product กางเกงผ้าอ้อม mamypoko")
2. The orchestrator analyzes the request using AI classification
3. The best-matching skill is selected and executed automatically
4. Results are returned directly to the user

## Supported Use Cases

- **Product Reviews**: "รีวิวสินค้า [ชื่อสินค้า]" — routes to the appropriate reviewer skill (food, electronics, beauty, baby, etc.)
- **Article Writing**: "เขียนบทความเรื่อง [หัวข้อ]" — routes to the matching article writer
- **Image Creation**: "สร้างรูป [คำอธิบาย]" — routes to image generation
- **Video Creation**: "สร้างวิดีโอ [คำอธิบาย]" — routes to video generation
- **Translation**: "แปล [ข้อความ]" — routes to translation skill
- **Brainstorming**: "brainstorm เรื่อง [หัวข้อ]" — routes to brainstorm skill
- **And more**: Any request that matches an available skill

## Notes

- If no matching skill is found, falls back to general chat
- The orchestrator uses LLM-based intent classification with confidence scoring
- Only skills enabled for the current tenant are considered