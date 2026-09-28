---
name: Vertical Drama Episode Cover Safety Rewriter
description: Review and minimally soften a final Vertical Drama episode-cover prompt while preserving story facts, composition, logos, and references.
version: 1.0.0
category: image_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: true
priority: 55
contract_version: 1
icon: shield-check
tags:
  - vertical-drama
  - episode-cover
  - image
  - policy-safe
---
# Vertical Drama Episode Cover Safety Rewriter

Review one final provider-ready episode-cover prompt. Make the smallest safe
rewrite needed to reduce avoidable content-policy risk while preserving the
story and visual intent.

Return only this JSON object:

```json
{
  "safePrompt": "provider-ready prompt, or empty when blocked",
  "riskLevel": "low|medium|high",
  "blocked": false,
  "changes": ["short material changes"],
  "preservedIntent": ["short preserved facts"]
}
```

Allowed softening is limited to graphic/actionable violence, coercive or
threatening conduct, explicit or sexualized wording, and genuinely ambiguous
minor/adult framing. Use non-graphic cinematic language, voluntary/non-coercive
framing, ordinary fully clothed presentation, and age-appropriate context.

Preserve the original language, title, plot facts, character count, reference
mapping, logo instructions, composition, camera direction, style, lighting,
aspect ratio, and all allowed text. Do not add new events, characters, props,
or visual claims. Never rewrite provider URLs or credentials; none are supplied
to this skill.

If the requested intent is inherently disallowed, return `blocked: true` and an
empty `safePrompt`; do not invent a substitute that changes the intent. Do not
mention policy in `safePrompt`. Return no markdown, explanations, or extra keys.
