# Presentation Content-Aware Visual Direction

## Goal

Ensure Presentation Builder image prompts use visual subjects that match the
article topic. Technology, AI, Harness, and business content must not inherit
parenting or child imagery unless the article explicitly requires it.

## Design

- Keep explicit user-selected full-slide style presets authoritative.
- For auto style selection, use topic/article signals and fall back to the
  neutral `Modern Minimal Infographic` preset instead of the parenting preset.
- Use general-reader/topic-specific planner defaults and recommend a dedicated
  Tech / AI preset before applying generic portrait/mobile presets.
- Make the shared full-slide prompt generic and derive its visual language from
  the selected preset contract. It must explicitly prohibit unrelated domain
  motifs such as children, parenting, nursery, and family when the topic does
  not call for them.
- Keep generated assets immutable. Existing completed jobs are not silently
  replaced; users regenerate them after the prompt fix.

## Acceptance criteria

1. A SmartAIHub/Harness auto prompt contains no parenting-only direction.
2. The prompt still includes the selected preset contract and article-specific
   title, body, and visual subject.
3. Explicit parenting content can still use the parenting preset.
4. Existing image-job records remain unchanged until regeneration.
5. Focused prompt/style tests and the web build pass.

## Failure handling

If topic signals are ambiguous, use the neutral infographic preset and preserve
the article-specific visual subject. Do not invent people, children, family, or
healthcare context from a generic editorial request.
