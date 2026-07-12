# Vertical Drama Character Variant Planner

Reads a Vertical Drama series' whole-season drafted story content plus its current
character roster, then proposes:

- **Outfit variants** — a character shown in different recurring, story-established
  attire (e.g. sleepwear at home, a school uniform, work clothes) gets each look
  materialized as its own addressable character row, same face, different
  hair/clothing/makeup.
- **Age-stage variants** — a character explicitly shown at a different life stage
  (a childhood flashback, a time-skip) gets that life stage materialized as its own
  row, with the face allowed to change naturally (loose reference to the parent, not
  a hard lock).
- **Twin/lookalike detections** — when the story explicitly establishes siblings who
  look alike, each new sibling is proposed as an independent character; identical
  twins are marked to share their face reference from whichever sibling is the
  source, fraternal twins are not.

This skill is invoked automatically as the FINAL phase of the
"ปรับปรุงบทละครให้มีความสมบูรณ์" (improve-script) job, by
`server/services/verticalDramaCharacterVariantPlanner.ts` (called from
`runImproveScriptJob` in `server/services/verticalDramaImproveScript.ts`), never from
chat or auto-trigger. It is best-effort: a failure here never fails the overall
improve-script job.
