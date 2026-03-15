## Task Summary

Create a tighter follow-up spec and plan after the design-system upgrade so Draft with AI can handle long-form markdown, smarter block selection, LLM-assisted compaction, constrained layout generation, and full-slide infographic/poster generation.

## User Requirements

1. Support block families designed for long text, not only compact blocks.
2. Use markdown structure such as headings, paragraphs, and paragraph lengths to decide layout strategy.
3. Send an explicit layout spec to the LLM instead of relying only on local slicing/truncation rules.
4. Consider a constrained LLM design path that can describe a slide layout from available element primitives.
5. Support media-generation-based infographic or full-slide visual output when it produces higher quality.
6. The overall solution must stay flexible and produce high-quality output.

## Relationship To Earlier Work

This task continues [010-presentation-design-system-upgrade](/home/dev/projects/SmartSpecPro/specs/quick/010-presentation-design-system-upgrade/implementation-plan.md).

010 solved:
- component-first slide authoring
- reusable blocks
- custom block previews
- AI recipe expansion

014 must solve:
- content-density-aware routing
- long-form layout families
- layout-intelligent compaction
- mode switching and overflow fallback
- optional DSL and full-slide media modes

## Constraints

- Keep structured/component mode as the default editable path.
- Do not let unconstrained LLM layout replace all deterministic validation.
- Thai-language slides must be handled intentionally.
- The plan should improve quality rather than only increase variety.

## Non-Goals

- This artifact does not implement the feature yet.
- This artifact is not a generic “AI design everything” proposal without validation.
