/**
 * Regression coverage for `skills/vertical-drama-character-visual-bible/skill.md`
 * itself (the real on-disk file, NOT mocked) — vertical-drama-skill-first-
 * architecture plan, Phase 2. Mirrors this session's established "skill
 * example completeness" regression-test style (see
 * `verticalDramaScriptGeneration.repairQueueTolerance.test.ts`'s doc comment
 * for the `repair_queue`/`storyboard_handoff_json` incidents this pattern
 * guards against): the root cause of both incidents was the skill's own
 * worked example never showing the field populated, so the model never
 * reliably produced it. This file proves the same class of regression can't
 * silently reappear for `turnaround_prompt`/`full_body_prompt`/
 * `expression_sheet_prompt`/`outfit_sheet_prompt` (Phase 2, item 3), and that
 * the content moved out of `verticalDramaCharacterImageGeneration.ts`'s
 * TypeScript constants (Phase 2, items 1-2 — role-tier archetypes,
 * solo-portrait rule, cinematic-language guidance) actually landed in
 * skill.md rather than being silently dropped.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function resolveSkillMdPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "skills/vertical-drama-character-visual-bible/skill.md"),
    path.resolve(process.cwd(), "apps/web/skills/vertical-drama-character-visual-bible/skill.md"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`vertical-drama-character-visual-bible/skill.md not found (checked: ${candidates.join(", ")})`);
  }
  return found;
}

function readSkillMdBody(): string {
  const raw = fs.readFileSync(resolveSkillMdPath(), "utf-8");
  // Strip YAML frontmatter (between the first pair of `---` lines) the same
  // way `parseSkillFile` does — the frontmatter itself is not prose content
  // we need to assert against here, and stripping it avoids false-positive
  // matches against frontmatter keys.
  return raw.replace(/^---\n[\s\S]*?\n---\n/, "");
}

function extractOutputSkeletonCharacter(body: string): Record<string, unknown> {
  // Anchored specifically to the "Output skeleton:" heading's own ```json
  // block — NOT just the first ```json block in the file. The "Face
  // reference locking" section (planning/vertical-drama-character-variants/
  // plan.md Phase C) added earlier ```json worked-example blocks ahead of
  // the Output skeleton, so a naive first-match regex would grab the wrong
  // block.
  const skeletonSectionMatch = body.match(/Output skeleton:\n\n```json\n([\s\S]*?)\n```/);
  if (!skeletonSectionMatch) {
    throw new Error("skill.md's Output skeleton ```json block was not found");
  }
  const parsed = JSON.parse(skeletonSectionMatch[1]) as { characters: Array<Record<string, unknown>> };
  expect(Array.isArray(parsed.characters)).toBe(true);
  expect(parsed.characters.length).toBeGreaterThan(0);
  return parsed.characters[0];
}

describe("vertical-drama-character-visual-bible/skill.md — Output skeleton example completeness", () => {
  const body = readSkillMdBody();
  const character = extractOutputSkeletonCharacter(body);

  it.each([
    "primary_portrait_prompt",
    "turnaround_prompt",
    "full_body_prompt",
    "expression_sheet_prompt",
    "outfit_sheet_prompt",
  ])("the worked example's %s is present and non-empty (never an empty/omitted placeholder)", (field) => {
    const value = character[field];
    expect(typeof value).toBe("string");
    expect((value as string).trim().length).toBeGreaterThan(0);
  });

  it("the four derived-prompt fields are genuinely distinct authored prompts, not the primary prompt with a generic suffix appended", () => {
    // Regression guard for the exact anti-pattern the code fallback used to
    // produce (`${primary_portrait_prompt}, 360 degree turnaround, ...` etc.)
    // — the example must demonstrate real, standalone authored content.
    const primary = character.primary_portrait_prompt as string;
    for (const field of ["turnaround_prompt", "full_body_prompt", "expression_sheet_prompt", "outfit_sheet_prompt"]) {
      const value = character[field] as string;
      expect(value).not.toBe(primary);
      expect(value.startsWith(primary)).toBe(false);
    }
  });

  it("negative_prompt in the worked example includes the solo-portrait negative terms", () => {
    expect(character.negative_prompt).toMatch(/no other people/i);
    expect(character.negative_prompt).toMatch(/no second person/i);
  });
});

describe("vertical-drama-character-visual-bible/skill.md — standing MANDATORY sections (Phase 2 content relocation)", () => {
  const body = readSkillMdBody();

  it("contains a 'Required prompt fields' section requiring all four derived prompts to never be omitted", () => {
    expect(body).toMatch(/Required prompt fields.*MANDATORY, never omit/i);
    expect(body).toMatch(/turnaround_prompt.*full_body_prompt.*expression_sheet_prompt.*outfit_sheet_prompt/s);
  });

  it("contains the 'Solo-portrait identity reference' section (relocated from VD_SOLO_PORTRAIT_INSTRUCTION)", () => {
    expect(body).toMatch(/Solo-portrait identity reference.*MANDATORY/i);
    expect(body).toMatch(/EXACTLY ONE person/i);
    expect(body).toMatch(
      /no other people, no second\s+person, no children, no extra person, no crowd, no background figures, no hands of\s+others/i,
    );
  });

  it("contains the 'Cinematic photographic language' section (relocated from VD_CINEMATIC_LANGUAGE_INSTRUCTION)", () => {
    expect(body).toMatch(/Cinematic photographic language.*MANDATORY/i);
    expect(body).toMatch(/85mm/i);
    expect(body).toMatch(/color grade/i);
    expect(body).toMatch(/bokeh/i);
  });

  it("contains the 'Preset visual identity' section teaching the skill to weave preset_visual_identity facts into prose", () => {
    expect(body).toMatch(/Preset visual identity.*MANDATORY when provided/i);
    expect(body).toMatch(/preset_visual_identity/);
    expect(body).toMatch(/style_name/);
    expect(body).toMatch(/wardrobe_grammar/);
    expect(body).toMatch(/matched_archetype_look/);
    expect(body).toMatch(/never append a boilerplate sentence verbatim/i);
  });

  it("the child-safety subsection requires the exact CHILD_SAFETY_DIRECTIVE_MARKER phrase to be embedded verbatim in generated prompts", () => {
    // Must match `CHILD_SAFETY_DIRECTIVE_MARKER` in
    // `shared/verticalDramaSeries/characterLock.ts` exactly — this is the
    // literal phrase downstream repair/soften safety nets scan for.
    const CHILD_SAFETY_DIRECTIVE_MARKER = /depicted\s+strictly\s+age-appropriately/i;
    expect(body).toMatch(CHILD_SAFETY_DIRECTIVE_MARKER);
    expect(body).toMatch(/hard safety marker/i);
  });

  it("the role-tier archetype table still contains the child-precedence rule (always wins over lead\\/villain labels)", () => {
    expect(body).toMatch(/Always wins, even over an explicit lead\/villain role label/i);
  });
});

/**
 * Face reference locking (planning/vertical-drama-character-variants/plan.md
 * Phase C) — mirrors the "Soften levels" structural template from
 * `vertical-drama-shot-image-action/skill.md`: one section, level-gated
 * instructions (here: `lock_strength: "hard"` vs `"loose"`), and worked
 * examples for each. Guards against the same class of regression the
 * Output-skeleton tests above guard against — an example that never shows
 * the field populated/used correctly is worse than no example at all.
 */
describe("vertical-drama-character-visual-bible/skill.md — Face reference locking section", () => {
  const body = readSkillMdBody();

  it("contains a 'Face reference locking' MANDATORY section gated on face_source_reference", () => {
    expect(body).toMatch(/Face reference locking.*MANDATORY when `face_source_reference` is provided/i);
    expect(body).toMatch(/lock_strength/);
    expect(body).toMatch(/relationship_note/);
  });

  it("documents both lock_strength levels: 'hard' (twin + outfit variant) and 'loose' (age-stage variant)", () => {
    expect(body).toMatch(/lock_strength:\s*"hard"/);
    expect(body).toMatch(/lock_strength:\s*"loose"/);
    expect(body).toMatch(/twin/i);
    expect(body).toMatch(/outfit.variant/i);
    expect(body).toMatch(/age-stage variant/i);
  });

  it("the hard-lock twin instruction requires CLEARLY, VISIBLY distinct styling so viewers can tell twins apart", () => {
    expect(body).toMatch(/CLEARLY, VISIBLY\s+distinct/);
    expect(body).toMatch(/tell the two\s+characters apart at a glance/i);
  });

  it("the hard-lock outfit-variant instruction does NOT carry the twin distinctness requirement", () => {
    expect(body).toMatch(/do NOT add a\s+distinctness requirement/i);
  });

  it("the loose-lock age-stage instruction explicitly forbids forcing identical facial proportions", () => {
    expect(body).toMatch(/do\s+\*\*not\*\*\s+force identical facial proportions/i);
    expect(body).toMatch(/family-resemblance|family\s+resemblance/i);
  });

  it("contains a worked example for the twin (hard-lock) case with a face_source_reference input and a styling-distinctness output", () => {
    expect(body).toMatch(/Worked example — twin, `lock_strength: "hard"`/);
    const twinExampleMatch = body.match(
      /Worked example — twin, `lock_strength: "hard"`[\s\S]*?```json\n([\s\S]*?)\n```[\s\S]*?```json\n([\s\S]*?)\n```/,
    );
    expect(twinExampleMatch).not.toBeNull();
    const [, inputJson, outputJson] = twinExampleMatch!;
    const input = JSON.parse(inputJson) as { face_source_reference: { lock_strength: string; relationship_note: string } };
    expect(input.face_source_reference.lock_strength).toBe("hard");
    expect(input.face_source_reference.relationship_note).toMatch(/twin/i);
    const output = JSON.parse(outputJson) as { characters: Array<Record<string, unknown>> };
    const primaryPrompt = output.characters[0].primary_portrait_prompt as string;
    expect(primaryPrompt).toMatch(/match(es)? the attached reference image precisely|match.*reference.*precisely/i);
    expect(primaryPrompt.toLowerCase()).toMatch(/distinct/);
  });

  it("contains a worked example for the age-stage (loose-lock) case referencing a child version of an adult portrait", () => {
    expect(body).toMatch(/Worked example — age-stage variant, `lock_strength: "loose"`/);
    const ageStageExampleMatch = body.match(
      /Worked example — age-stage variant, `lock_strength: "loose"`[\s\S]*?```json\n([\s\S]*?)\n```[\s\S]*?```json\n([\s\S]*?)\n```/,
    );
    expect(ageStageExampleMatch).not.toBeNull();
    const [, inputJson, outputJson] = ageStageExampleMatch!;
    const input = JSON.parse(inputJson) as { face_source_reference: { lock_strength: string; relationship_note: string } };
    expect(input.face_source_reference.lock_strength).toBe("loose");
    expect(input.face_source_reference.relationship_note).toMatch(/age-stage/i);
    const output = JSON.parse(outputJson) as { characters: Array<Record<string, unknown>> };
    const primaryPrompt = output.characters[0].primary_portrait_prompt as string;
    // Must still carry the verbatim child-safety marker (child tier applies —
    // an 8-year-old — even though the face-lock is loose).
    expect(primaryPrompt).toMatch(/depicted\s+strictly\s+age-appropriately/i);
  });
});
