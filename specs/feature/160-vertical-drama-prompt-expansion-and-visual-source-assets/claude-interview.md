# Feature 160 Deep-Plan Interview Transcript

This transcript records the approved domain decisions from the prior design conversation. No new stakeholder question was required because the user explicitly approved the amended spec and requested autonomous planning and implementation.

## Q1. Should prompt expansion replace the original prompt or remain optional?

**Answer:** It is optional. The system shows an AI interpretation in a dialog first, lets the user edit it, and applies it only after confirmation. Cancel or rejection must preserve the original prompt and return to the existing flow.

## Q2. How much information must the preview provide before the user decides?

**Answer:** The preview must be complete enough to decide: expanded brief, editorial direction, intended visual slots, source/research findings, uncertainties, and warnings. The user must be able to edit before applying.

## Q3. When should the system use web search versus imagination?

**Answer:** Identifiable places, software, systems, and current events should use web research when enabled. Broad non-specific topics may be interpreted creatively, but the UI must label them as imagined/illustrative rather than researched fact. A known place such as the Eiffel Tower should be recognized and researched; a generic topic such as shallow-coral conservation may be planned without inventing factual claims.

## Q4. How should images and footage interact with scenes, references, and B-roll?

**Answer:** The system must understand semantic use. A place/store/environment image can serve as a scene/environment anchor. A product/object image that is not a full scene is a reference. Still photos and video footage can be B-roll. Video footage requires exact segment binding and must not be collapsed into the image-reference table.

## Q5. Should news be a separate flow?

**Answer:** Yes. News/reporting should be a separate editorial profile for clarity, while sharing the same source-pack, managed media, evidence, snapshot, and assembly infrastructure. It needs stricter claim verification, current-time/as-of display, attribution, correction handling, and archive/file-footage disclosure.

## Q6. What is the success criterion for story generation?

**Answer:** User-approved and uploaded/generated visual sources must remain aligned with draft story, full story, deep story, start-frame decisions, references, B-roll, and final assembly. If a source changes, dependent generated work must become stale rather than silently using mixed versions.

## Auto-decisions

- Reuse existing `vertical_drama_source_packs`, `vertical_drama_source_assets`, `vertical_drama_source_slots`, `media_assets`, and existing story-generation run fencing.
- Add normalized metadata/segment/snapshot/claim/B-roll contracts only where existing tables cannot represent the new behavior safely.
- Use server-side Zod validation, owner/tenant scoping, idempotency, and transaction boundaries matching existing Vertical Drama routers/services.
- Use Vitest for focused proof and Playwright for browser evidence.
- Do not add a new media provider or replace managed storage; reuse current media admission and storage proxy paths.
- Use feature flags and preserve flag-off behavior for existing fiction/source-pack/shot-reference workflows.
