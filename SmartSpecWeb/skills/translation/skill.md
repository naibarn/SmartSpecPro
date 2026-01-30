---
name: Translation
description: Translate text between English and your preferred language using a dedicated LLM model. Supports bidirectional translation with automatic language detection.
category: translation
icon: Languages
version: "1.0.0"
author: SmartSpec
isAutoTrigger: false
enabledByDefault: true
priority: 50
creditMultiplier: 1.0
triggerPatterns:
  - "translate|translation"
  - "translate this|translate to English|translate to Thai"
config:
  requiresExplicit: true
---

# Translation Skill

## Purpose
Translate text between English and the user's preferred language using a dedicated LLM model configured in Settings > Preferences.

## How It Works
1. User sets their preferred translation language and dedicated LLM model in **Settings > Preferences > Translation**
2. Translation detects if the input is English or another language
3. English text is translated to the user's preferred language
4. Non-English text is translated to English
5. Credits are deducted based on actual token usage

## Available In
- **Media Studio**: Click the "Translate" button next to the prompt textarea to translate the current prompt
- **Chat**: Right-click on any assistant message and select "Translate" to see an inline translation

## Language Detection
The system uses a heuristic based on ASCII character ratio to determine if text is English:
- If >70% of characters are ASCII letters/digits/spaces, it's treated as English
- Otherwise, it's treated as the user's target language

## Supported Languages
Thai, Chinese (Simplified & Traditional), Japanese, Korean, French, Spanish, German, Portuguese, Arabic, Russian, Hindi, Vietnamese, Indonesian, Italian, Dutch, Polish, Turkish, Swedish

## Credit Cost
Credits are calculated based on actual LLM token usage (input + output tokens) using the standard `calculateCreditsForLLM()` formula.
