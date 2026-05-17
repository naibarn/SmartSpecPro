# ElevenLabs Beauty & Personal Care Dialogue Skill v22

Plain-text ElevenLabs-style dialogue generator for beauty, cosmetic, personal care, hygiene, oral-care, feminine-care, hair-care, sunscreen, grooming tools, adjacent wellness accessories, and selected medical-adjacent personal-use products.

## Output

Final output is a customer-facing dialogue string, not JSON, and not wrapped in Markdown code fences.

Use one spoken turn per line with no blank lines between turns. Start every line with `Speaker 1:` or `Speaker 2:`. Use ElevenLabs Eleven v3 bracket audio tags only where they help delivery, not on every line.

Preferred shape:
Speaker 1: [curious] ...
Speaker 2: ...
Speaker 1: ...
Speaker 2: [cheerful] ...

## v17 focus

- Medical-device scar gel and self-sampling diagnostic kit guard
- Hair-loss set guard, including supplement warning and promo removal
- Scalp acne/dandruff/seborrheic-style claim softening
- Intimate cleanser claim softening
- Whitening body lotion and brightening mist softening
- UV apparel/textile and sunscreen-adjacent wording
- Strict no-meta-compliance dialogue in final output

See `rules/category-guard-matrix-v17.md` and `tests/batch-v17-automated-test-report.md`.


## v17 update

Adds stronger SET/bundle orchestration, effervescent dietary supplement handling, underarm brightening set guard, HPV/STI self-sampling safe narration, UV apparel guard, and medical-adjacent support product guard.


## v18 Image Upload Option

This version adds optional image upload support. `product_images` accepts up to 5 uploaded image files through a drag-and-drop/file-upload UI. The field is optional and does not replace `product_details`. Uploaded images are used to confirm visible product details, detect mismatched listings, and improve script accuracy while avoiding invented or exaggerated claims.

## v20 Final Quality Review

Before returning the final dialogue, the skill now performs a silent internal review for stop-scroll hook strength, sales energy, sparse but useful ElevenLabs audio tags, natural spoken wording, speaker-role clarity, claim safety, and strict plain-text formatting. If the draft fails, it rewrites internally and returns only the repaired dialogue.

## v21 Facial Cleanser Hard Claim Block

Facial cleanser outputs now hard-reject treatment and absolute safety phrases such as bacteria-killing, inflammation reduction, acne drying, skin-barrier repair/strengthening, no-irritant guarantees, and similar Thai/English meanings. The skill must rewrite these into safe rinse-off routine language before returning the final dialogue.

## v22 Eleven v3 Audio Tag Direction

Adds a fuller ElevenLabs Eleven v3 audio-tag guide for more emotional voice prompts while keeping tags sparse. The skill now treats bracket tags as natural-language instructions inside text, maps speech/persuasion styles to tag palettes, supports emotional arcs, non-verbal reactions, pause/whisper/breath cues, and rejects visual-only tags such as `[standing]`, `[grinning]`, `[pacing]`, or `[smiling]`.
