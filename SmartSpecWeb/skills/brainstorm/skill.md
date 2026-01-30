---
name: Brainstorm
slug: brainstorm
description: Multi-model collaborative brainstorming with debate rounds and synthesis. Two LLM models take turns analyzing a topic from different perspectives, then produce a unified summary.
category: chat_assistant
icon: Lightbulb
version: "1.0.0"
author: SmartSpec
isAutoTrigger: false
enabledByDefault: true
priority: 40
creditMultiplier: 1.0
triggerPatterns:
  - "brainstorm|brainstorming"
  - "debate this|discuss this|analyze from multiple angles"
config:
  requiresExplicit: true
  maxRounds: 3
---

# Brainstorm Skill

## Purpose
Enable collaborative brainstorming between two LLM models to explore topics from multiple perspectives and produce a synthesized best answer.

## How It Works
1. User toggles **Brainstorm Mode** in the Chat header
2. User selects a **Model B** (brainstorm partner) alongside their primary Model A
3. User sends a question or topic
4. **Model A** provides initial analysis (Round 1)
5. **Model B** offers alternative perspectives, challenges weak points (Round 1)
6. Models continue debating for N rounds (default 3, max 6)
7. **Model A** produces a final **Brainstorm Summary** synthesizing all insights

## Skill-Aware Context
When the user's question matches another skill (e.g., image prompt engineering, code documentation), the brainstorm system automatically injects that skill's knowledge base into the context for both models.

## Visual Indicators
- **Model A** messages: Blue left border + badge
- **Model B** messages: Purple left border + badge
- **Summary**: Green left border + badge
- Each message shows the model name and round number

## Credit Cost
Credits are deducted for every model call:
- 3 rounds = 6 debate calls + 1 summary = 7 total LLM calls
- Each call uses standard `calculateCreditsForLLM()` based on actual token usage
