# Section 01: Skill, Context, and Contracts

## Objective

Create the structured Character DNA and comparison-context boundary, teach the runtime
skill the approved guide, and make the prompt-generation service validate/map it.

## Ownership

Primary files:

- `apps/web/shared/verticalDramaSeries/characterProfile.ts`
- `apps/web/shared/verticalDramaSeries/characterProfile.test.ts`
- `apps/web/skills/vertical-drama-character-visual-bible/skill.md`
- `apps/web/skills/vertical-drama-character-visual-bible/schemas/input.schema.json`
- `apps/web/skills/vertical-drama-character-visual-bible/schemas/output.schema.json`
- `apps/web/server/services/verticalDramaCharacterDesignContext.ts` (new)
- `apps/web/server/services/__tests__/verticalDramaCharacterDesignContext.test.ts` (new)
- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
- `apps/web/server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts`
- `apps/web/server/services/__tests__/verticalDramaCharacterVisualBible.skillContent.test.ts`

Do not edit router or client files in this section.

## Implementation contract

1. Add typed DNA/comparison/score objects to the shared visual-bible schema.
   Shared code remains field-only (Zod/types, no DB/server imports), and both server services
   import these shared contracts rather than importing each other.
2. Build compact snapshot projectors and a bounded owner-scoped context loader.
3. Allowlist and truncate series/character strings; never serialize arbitrary raw JSONB.
   Keep at most 30 current-cast rows while always retaining the target. Scan at most fifteen
   prior series and retain the five most recent that contain usable lead evidence, with at
   most two leads per retained series.
4. Represent archive status and source quality truthfully.
5. Extend skill input/output schemas additively.
6. Add a mandatory guide section before prompt construction covering series DNA, role/age
   design, candidate generation, scoring, anti-clone, family resemblance, recall stack,
   archive truthfulness, and canonical-DNA reuse.
7. Preserve exact existing mandatory sections and worked examples.
8. Serialize design context and existing DNA into the user prompt as facts.
9. Strictly validate new runtime LLM output and map it to a persistable visual-bible snapshot.
10. Keep one LLM call and reduce temperature moderately.
11. Increase the completion-token ceiling only as much as required for the added structured
    DNA plus the existing five prompts, and preserve the existing retry boundary.

## TDD expectations

Start with schema, snapshot, prompt-serialization, output-validation, and skill-content tests.
The first failing run must reach assertions rather than fail from missing module imports; a
minimal exported skeleton is allowed before the red run.

## Acceptance checks

- Complete DNA parses; out-of-range scores fail.
- Transport-facing DNA strings/arrays are capped and unknown browser-supplied keys are not
  persisted.
- Context has no sensitive or unbounded fields.
- Target is excluded from self-contrast; variants and twins are labeled correctly.
- Partial legacy history cannot claim full validation.
- Empty draft series do not displace older series that contain usable lead evidence within
  the bounded fifteen-series candidate window.
- Skill contains every approved design layer and retains all old safety/reference markers.
- Existing output fields and correlation key remain unchanged.
- Focused section tests pass.

## Risks

- The skill file already contains uncommitted custom-instruction changes; patch only around
  stable headings and re-check that diff separately.
- Existing output fixtures are numerous; update the central fixture/helper rather than
  mechanically duplicating DNA everywhere when possible.
- Avoid a context-service ↔ prompt-service circular dependency. Shared schemas/types are the
  interface; lead filtering may reuse a dependency-safe pure helper or a local callback, but
  the prompt service must not import the DB context loader.

## Implementation result

Status: complete.

- Added bounded shared DNA/context/approved-snapshot contracts.
- Added an owner-scoped current-cast and recent-series context loader (30 current entries,
  15 series scanned, 5 usable series retained, 2 leads per series).
- Added explicit `archiveStatus`; archive-query failure degrades to `unavailable` while a
  current-cast query failure still blocks generation.
- Integrated the supplied guide into the lowercase runtime `skill.md` actually loaded by
  the Characters-tab service, preserving all prior safety/reference/custom-instruction
  sections.
- Runtime now requires full DNA, exact target correlation, authoritative role tier,
  server-derived comparison counts, provisional incomplete history, unique anti-clone
  dimensions, approved-identity immutability, and adult-lead score gates.
- Prompt generation remains one paid LLM call at temperature 0.55 with a 5,500-token cap.
