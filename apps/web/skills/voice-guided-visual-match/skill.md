---
name: voice-guided-visual-match
description: Describe one slide image for matching against timestamped voice transcript windows.
version: 1.0.0
category: automation
icon: image
tags:
  - media-workspace
  - image-analysis
  - visual-match
auto_trigger: false
enabled_by_default: true
execution_mode: llm-only
---

# Voice Guided Visual Match Analyzer

Analyze only what is visible in the supplied image. Return JSON with a concise caption, visible subjects, actions, setting, objects, OCR text, keywords, safety labels, and a confidence from 0 to 1. Do not infer invisible events, identities, or story details. This response is used to compare an image with timestamped speech; keep keywords concrete and language-neutral when possible.
