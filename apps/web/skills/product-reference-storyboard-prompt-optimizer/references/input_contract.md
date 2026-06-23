# Input Contract

Expected input:

- `source_prompt`: required prompt text to optimize.
- `target_max_chars`: hard maximum output length. Default 3800.
- `preferred_target_chars`: preferred output length. Default 3600.
- `preserve_storyboard_contract`: default true. Preserve critical storyboard structure.
- `optimization_strength`: optional aggressiveness hint.

The source prompt remains the source of truth. The optimizer may shorten, merge, reorder global sections, and remove duplicated instructions, but must not invent new storyboard beats, product facts, people, claims, visible text, or product substitutions.
