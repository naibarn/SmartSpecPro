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

describe("vertical-drama-character-visual-bible/skill.md — Feature 144 Human Realism contract", () => {
  it("keeps SKILL.md and skill.md byte-for-byte synchronized", () => {
    const realFs = fs;
    const rootPath = [
      path.resolve(process.cwd(), "skills/vertical-drama-character-visual-bible"),
      path.resolve(process.cwd(), "apps/web/skills/vertical-drama-character-visual-bible"),
    ].find((candidate) => fs.existsSync(candidate));
    if (!rootPath) throw new Error("skill directory not found");
    expect(realFs.readFileSync(path.join(rootPath, "SKILL.md"), "utf8")).toBe(
      realFs.readFileSync(path.join(rootPath, "skill.md"), "utf8"),
    );
  });

  it("contains natural-human, role, anatomy, shot-aware, and inline avoidance guidance", () => {
    const body = readSkillMdBody();
    for (const phrase of [
      "Natural human realism",
      "macro, meso, and micro skin variation",
      "sclera, catchlights, lips",
      "candid expression",
      "hands, joints, feet, weight distribution",
      "fashion-model",
      "Supporting characters and",
      "shot-aware camera",
      "plastic",
      "beauty-filtered",
      "Rich and compact profiles",
      "hard-truncating",
    ]) {
      expect(body).toContain(phrase);
    }
    expect(body).toMatch(/Do not force one 85mm recipe on every\s+shot/i);
    expect(body).toMatch(/contextual inline prose/i);
  });
});

describe("vertical-drama-character-visual-bible — casting preferences contract", () => {
  const body = readSkillMdBody();

  it("documents Auto as reasoned story-market casting rather than random selection", () => {
    expect(body).toMatch(/Casting preferences and story-market fit/i);
    expect(body).toMatch(/Auto is NOT random/i);
    expect(body).toMatch(/story setting\/world as the strongest market signal/i);
  });

  it("documents additional details as the highest-priority casting preference", () => {
    expect(body).toMatch(/additional_details.*highest\s+priority among the casting controls/is);
    expect(body).toMatch(/Korean-drama casting but an American character/i);
    expect(body).toMatch(/casting style is not the same as nationality/i);
  });
});

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

  it("the worked example includes a complete character_design_dna result", () => {
    const dna = character.character_design_dna as Record<string, unknown>;
    expect(dna).toMatchObject({
      version: 1,
      design_intent: expect.any(String),
      role_tier: expect.any(String),
      beauty_archetype: expect.any(String),
      age_range: expect.any(String),
      face_identity: expect.any(Object),
      body_language: expect.any(Object),
      recall_stack: expect.any(Object),
      anti_clone_checks: expect.any(Object),
      scores: expect.any(Object),
      comparison_evidence: expect.any(Object),
    });
  });
});

describe("vertical-drama-character-visual-bible/skill.md — story-grounded Character DNA", () => {
  const body = readSkillMdBody();

  it("requires Series Character DNA and the four attraction layers before face design", () => {
    expect(body).toMatch(/Series Character DNA.*MANDATORY/i);
    expect(body).toMatch(/visual appeal/i);
    expect(body).toMatch(/emotional readability/i);
    expect(body).toMatch(/narrative promise/i);
    expect(body).toMatch(/memorable identity/i);
  });

  it("requires three internal directions, score-based selection, and one redesign on threshold failure", () => {
    expect(body).toMatch(/three\*{0,2}\s+materially distinct\s+directions/i);
    expect(body).toMatch(/story_fit/i);
    expect(body).toMatch(/screen_presence/i);
    expect(body).toMatch(/emotional_readability/i);
    expect(body).toMatch(/ensemble_contrast/i);
    expect(body).toMatch(/cross_series_uniqueness/i);
    expect(body).toMatch(/redesign exactly once/i);
  });

  it("enforces anti-clone dimensions, recall stack, body language, and family resemblance without cloning", () => {
    expect(body).toMatch(/3\*{0,2}\s+of 5 facial\s+dimensions/i);
    expect(body).toMatch(/2\*{0,2}\s+of 4 hair\s+dimensions/i);
    expect(body).toMatch(/2\*{0,2}\s+of 4 body-language\s+dimensions/i);
    expect(body).toMatch(/Recall Stack/i);
    expect(body).toMatch(/Body Language Profile/i);
    expect(body).toMatch(/25.?40%/i);
  });

  it("compares only distinct people for ensemble contrast while treating variants as identity evidence and twins as face-linked", () => {
    expect(body).toMatch(/same_person_variant/);
    expect(body).toMatch(/face_linked_twin/);
    expect(body).toMatch(/exclude the target character[\s\S]{0,120}from self-contrast/i);
  });

  it("treats an unavailable archive as unprovable history rather than evidence of no prior designs", () => {
    expect(body).toMatch(/archiveStatus/);
    expect(body).toMatch(/unavailable[\s\S]{0,180}cross-series uniqueness[\s\S]{0,80}could not be proven/i);
    expect(body).toMatch(/never treat an `?unavailable`? archive as evidence that no prior designs\s+exist/i);
  });

  it("returns concise decision evidence, never private chain-of-thought", () => {
    expect(body).toMatch(/Do not\s+reveal.*chain-of-thought/is);
    expect(body).toMatch(/concise.*rationale/is);
  });
});

describe("vertical-drama-character-visual-bible/skill.md — first-portrait candidate casting", () => {
  const body = readSkillMdBody();

  it("defines portrait_candidate_count 1-5 as a visible candidate-batch mode without changing normal output", () => {
    expect(body).toMatch(/portrait_candidate_count/);
    expect(body).toMatch(/1.?5/);
    expect(body).toMatch(/portrait_candidate_batch/);
    expect(body).toMatch(/normal.*output.*unchanged/is);
  });

  it("keeps plain_text_summary optional only for the lean candidate contract", () => {
    const schema = JSON.parse(
      fs.readFileSync(path.join(path.dirname(resolveSkillMdPath()), "schemas/output.schema.json"), "utf8"),
    ) as { oneOf: Array<{ required: string[] }> };
    expect(schema.oneOf[0]?.required).toContain("plain_text_summary");
    expect(schema.oneOf[1]?.required).not.toContain("plain_text_summary");
    expect(body).toMatch(/plain_text_summary.*optional/is);
  });

  it("forbids an empty candidate DNA placeholder and names the previously omitted required keys", () => {
    const candidateSection = body.match(
      /### First-portrait candidate casting[\s\S]*?## Lead-role screen presence/i,
    )?.[0];
    expect(candidateSection).toBeTruthy();
    expect(candidateSection).not.toMatch(/"character_design_dna"\s*:\s*\{\s*\}/);
    for (const key of [
      "series_dna_alignment",
      "costume_grammar",
      "public_mask",
      "hidden_truth",
      "narrative_promise",
      "attractive_contradiction",
      "forbidden_drift",
      "anti_clone_checks",
    ]) {
      expect(candidateSection).toContain(key);
    }
  });

  it("requires different people while preserving one premium dramatic visual language and equal casting quality", () => {
    expect(body).toMatch(/different people|different faces/i);
    expect(body).toMatch(/same premium visual language/i);
    expect(body).toMatch(/equally compelling|same casting floor/i);
    expect(body).toMatch(/3.*of 5 facial dimensions/i);
    expect(body).toMatch(/hair.*different/is);
    expect(body).toMatch(/signature|silhouette/i);
  });

  it("rejects model-advertising language in favor of story-character magnetism", () => {
    expect(body).toMatch(/catalog|advertising model|influencer/i);
    expect(body).toMatch(/story character|dramatic character/i);
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

  it("requires an explicit lead beauty floor and keeps occupation/genre secondary", () => {
    expect(body).toMatch(/Role Beauty Spec.*MANDATORY before prompt writing/i);
    expect(body).toMatch(/beauty_priority/);
    expect(body).toMatch(/lead_attractiveness_level/);
    expect(body).toMatch(/screen_magnetism_level/);
    expect(body).toMatch(/must_not_undershoot_beauty/);
    expect(body).toMatch(/occupation.*secondary/i);
    expect(body).toMatch(/HARD PRIORITY over genre/i);
    expect(body).toMatch(/exceptionally|strikingly.*handsome/i);
    expect(body).toMatch(/exceptionally|strikingly.*beautiful/i);
  });

  it("does not let noir/thriller grammar override a lead's open romantic visual read", () => {
    expect(body).toMatch(/thriller tension.*MUST NOT turn a lead's face/is);
    expect(body).toMatch(/predatory gaze.*elegant menace.*quiet calculation/is);
    expect(body).toMatch(/Move danger into the\s+story environment/i);
    expect(body).toMatch(/high-contrast thriller color grade/i);
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

/**
 * Own reference image locking (vertical-drama-reference-picker-outfit-lock
 * plan, Phase D2 — section B): fixes the diagnosed bug where a hardcoded
 * router sentence locked identity to an attached reference image but never
 * mentioned outfit/clothing/accessories, so image models felt free to invent
 * a new outfit even with a reference photo attached. Mirrors the "example
 * completeness" regression-test style used throughout this file.
 */
describe("vertical-drama-character-visual-bible/skill.md — Own reference image locking section", () => {
  const body = readSkillMdBody();

  it("contains an 'Own reference image locking' MANDATORY section gated on has_own_reference_image", () => {
    expect(body).toMatch(/Own reference image locking.*MANDATORY when `has_own_reference_image` is true/i);
    expect(body).toMatch(/has_own_reference_image/);
  });

  it("requires the identity lock to always cover face shape, skin tone, hairstyle, outfit, clothing, accessories, and shoes", () => {
    const section = body.split("## Own reference image locking")[1]?.split("## Character Design Bible sheet types")[0] ?? "";
    expect(section).toMatch(/face shape/i);
    expect(section).toMatch(/skin tone/i);
    expect(section).toMatch(/hairstyle/i);
    expect(section).toMatch(/outfit/i);
    expect(section).toMatch(/clothing/i);
    expect(section).toMatch(/accessories/i);
    expect(section).toMatch(/shoes/i);
  });

  it("explains this is stricter than the hard-lock face_source_reference case (which deliberately does NOT lock wardrobe)", () => {
    const section = body.split("## Own reference image locking")[1]?.split("## Character Design Bible sheet types")[0] ?? "";
    expect(section).toMatch(/does NOT lock clothing/i);
    expect(section).toMatch(/stricter/i);
  });

  it("instructs weaving has_own_reference_image and face_source_reference together when both are present (not mutually exclusive)", () => {
    const section = body.split("## Own reference image locking")[1]?.split("## Character Design Bible sheet types")[0] ?? "";
    expect(section).toMatch(/BOTH.*has_own_reference_image.*face_source_reference/is);
    expect(section).toMatch(/mutually exclusive/i);
  });

  it("never append a boilerplate sentence verbatim — same facts-in, natural-prose-out convention", () => {
    const section = body.split("## Own reference image locking")[1]?.split("## Character Design Bible sheet types")[0] ?? "";
    expect(section).toMatch(/never append a boilerplate sentence\s+verbatim/i);
  });

  it("contains a worked example demonstrating has_own_reference_image: true with outfit explicitly locked in every prompt field", () => {
    const match = body.match(
      /Worked example — own reference image lock, `has_own_reference_image: true`[\s\S]*?```json\n([\s\S]*?)\n```[\s\S]*?```json\n([\s\S]*?)\n```/,
    );
    expect(match).not.toBeNull();
    const [, inputJson, outputJson] = match!;
    const input = JSON.parse(inputJson) as { has_own_reference_image: boolean };
    expect(input.has_own_reference_image).toBe(true);

    const output = JSON.parse(outputJson) as { characters: Array<Record<string, unknown>> };
    const character = output.characters[0];
    for (const field of [
      "primary_portrait_prompt",
      "turnaround_prompt",
      "full_body_prompt",
      "expression_sheet_prompt",
      "outfit_sheet_prompt",
    ]) {
      const value = character[field] as string;
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
      // The exact fix: every one of these fields must explicitly lock outfit
      // (or a synonym: clothing/accessories/shoes/wardrobe), not just
      // face/skin/hair, whenever has_own_reference_image is true.
      expect(value).toMatch(/outfit|clothing|accessories|shoes|wardrobe/i);
    }
  });
});

/**
 * Custom instruction (vertical-drama-character-custom-instruction plan): lets
 * a user-typed free-text framing/pose hint (e.g. "front-facing", "half-body
 * shot", "full-body") get woven into the generated portrait prompt, so
 * repeated clicks of "generate character image" produce genuinely varied
 * images instead of near-identical ones. Skill-first: this section is the
 * SOLE author of how the raw `custom_instruction` fact is used — the backend
 * code only threads the string through, never templates or interprets it.
 * Mirrors the "example completeness" regression-test style used throughout
 * this file.
 */
describe("vertical-drama-character-visual-bible/skill.md — Custom instruction section", () => {
  const body = readSkillMdBody();

  it("contains a 'Custom instruction' section gated on custom_instruction", () => {
    expect(body).toMatch(/Custom instruction.*WHEN custom_instruction is provided/i);
    expect(body).toMatch(/custom_instruction/);
  });

  it("describes it as a raw framing\\/pose hint for this generation only, never a command that can rewrite identity, wardrobe-lock, role-tier, or safety rules", () => {
    const section = body.split("## Custom instruction")[1]?.split("## Character Design Bible sheet types")[0] ?? "";
    expect(section).toMatch(/framing/i);
    expect(section).toMatch(/pose/i);
    expect(section).toMatch(/never.*rewrite.*identity/is);
  });

  it("accepts wardrobe, color, prop, setting, and lighting details as real visual intent when no higher-priority rule conflicts", () => {
    const section = body.split("## Custom instruction")[1]?.split("## Character Design Bible sheet types")[0] ?? "";
    expect(section).toMatch(/outfit/i);
    expect(section).toMatch(/colors?/i);
    expect(section).toMatch(/props?/i);
    expect(section).toMatch(/setting/i);
    expect(section).toMatch(/lighting/i);
    expect(section).toMatch(/must replace the corresponding default detail/i);
  });

  it("instructs weaving the hint naturally into primary_portrait_prompt and other genuinely relevant fields, never mechanically appending it to every field", () => {
    const section = body.split("## Custom instruction")[1]?.split("## Character Design Bible sheet types")[0] ?? "";
    expect(section).toMatch(/primary_portrait_prompt/);
    expect(section).toMatch(/full_body_prompt/);
    expect(section).toMatch(/never append the literal string verbatim|never mechanically append/i);
  });

  it("explicitly subordinates this section to Own reference image locking, Face reference locking, the role-tier table, and the child-safety subsection", () => {
    const section = body.split("## Custom instruction")[1]?.split("## Character Design Bible sheet types")[0] ?? "";
    expect(section).toMatch(/ALWAYS subordinate to/i);
    expect(section).toMatch(/Own reference image locking/);
    expect(section).toMatch(/Face reference locking/);
    expect(section).toMatch(/role-tier/i);
    expect(section).toMatch(/child-safety/i);
  });

  it("grants the LLM latitude to vary phrasing across repeated calls with the same hint (the actual fix for near-identical repeated generations), not verbatim-append language", () => {
    const section = body.split("## Custom instruction")[1]?.split("## Character Design Bible sheet types")[0] ?? "";
    expect(section).toMatch(/latitude/i);
    expect(section).toMatch(/vary|different each time|interpret.*differently/i);
    expect(section).toMatch(/near-identical/i);
  });

  it("states absent/empty custom_instruction means legacy/default behavior, unchanged", () => {
    const section = body.split("## Custom instruction")[1]?.split("## Character Design Bible sheet types")[0] ?? "";
    expect(section).toMatch(/absent or empty/i);
    expect(section).toMatch(/legacy\/default\s+behavior, unchanged/i);
  });

  it("contains a worked example demonstrating custom_instruction: \"half-body shot, front-facing\" with the resulting primary_portrait_prompt reflecting that framing", () => {
    const match = body.match(
      /Worked example \(`custom_instruction: "half-body shot, front-facing"`[\s\S]*?```json\n([\s\S]*?)\n```[\s\S]*?> "([\s\S]*?)"/,
    );
    expect(match).not.toBeNull();
    const [, inputJson, promptText] = match!;
    const input = JSON.parse(inputJson) as { custom_instruction: string };
    expect(input.custom_instruction).toBe("half-body shot, front-facing");
    expect(promptText).toMatch(/half-body/i);
    expect(promptText).toMatch(/front-facing/i);
  });

  it("contains a Thai worked example proving a full-body pajama brief is honored instead of the default look", () => {
    expect(body).toMatch(/\"custom_instruction\": \"ภาพเต็มตัว ในชุดนอนแบบสบาย\"/);
    const section = body.split("Worked example (the same contract also accepts a Thai visual brief):")[1]?.split("## Character Design Bible sheet types")[0] ?? "";
    expect(section).toMatch(/full-body|full-length/i);
    expect(section).toMatch(/comfortable sleepwear|comfortable pajamas/i);
    expect(section).toMatch(/must not silently return the default outfit/i);
  });
});

/**
 * Character Design Bible sheet types (planning/vertical-drama-character-sheet-
 * consolidation/plan.md Phase A) — `requested_sheet_type` selects one
 * additional `sheet_prompt`/`sheet_type` pair on top of the 5 always-required
 * prompt fields. Mirrors the same "example completeness" regression-test
 * style as the sections above: an instructed-but-never-demonstrated field
 * reliably comes out empty/wrong in practice, so every new format this
 * section teaches must be backed by a real worked example that parses and
 * shows the field populated correctly.
 */
describe("vertical-drama-character-visual-bible/skill.md — Character Design Bible sheet types section", () => {
  const body = readSkillMdBody();

  it("contains the 'Character Design Bible sheet types' section gated on requested_sheet_type", () => {
    expect(body).toMatch(/Character Design Bible sheet types.*used only when requested_sheet_type is present/i);
    expect(body).toMatch(/requested_sheet_type/);
  });

  it("states sheet_prompt/sheet_type are additive to, never a replacement for, the 5 required fields", () => {
    expect(body).toMatch(/sheet_prompt/);
    expect(body).toMatch(/sheet_type/);
    expect(body).toMatch(/never (skip|replace)|never a replacement for/i);
  });

  it("states 'auto' and 'turnaround' require no extra sheet_prompt field", () => {
    expect(body).toMatch(/absent, `"auto"`, or `"turnaround"`/);
    expect(body).toMatch(/no additional field is needed/i);
  });

  it("contains all 11 named sheet-type subsection headers plus the full_combined subsection", () => {
    const expectedHeaders = [
      "### `cover`",
      "### `character_profile`",
      "### `face_detail`",
      "### `expression_12`",
      "### `hair_reference`",
      "### `costume_breakdown`",
      "### `material_fabric`",
      "### `color_palette`",
      "### `pose_library`",
      "### `body_proportion`",
      "### `ai_prompt_lock`",
      "### `full_combined`",
    ];
    for (const header of expectedHeaders) {
      expect(body).toContain(header);
    }
  });

  it("the expression_12 subsection keeps itself distinct from the always-on expression_sheet_prompt field", () => {
    const section = body.split("### `expression_12`")[1]?.split("### `hair_reference`")[0] ?? "";
    expect(section).toMatch(/3×4 grid|3x4 grid/);
    expect(section).toMatch(/Neutral.*Smiling Softly.*Laughing Openly.*Angry.*Cry.*Fear.*Confident.*Thinking.*Wink.*Closed Eyes.*Sad.*Surprised/s);
    expect(section).toMatch(/never\s+replaces[\s\S]*?expression_sheet_prompt/i);
  });

  it("the full_combined subsection explains it replaces the router's former hardcoded string-concatenated layout", () => {
    const section = body.split("### `full_combined`")[1]?.split("### Worked example")[0] ?? "";
    expect(section).toMatch(/turnaround row/i);
    expect(section).toMatch(/expression grid/i);
    expect(section).toMatch(/stats\s+sidebar/i);
    expect(section).toMatch(/verticalDramaCharacters\.ts/);
    expect(section).toMatch(/never\s+literally concatenate/i);
  });

  it("contains a worked example for requested_sheet_type: \"cover\" with sheet_prompt/sheet_type populated and the 5 required fields intact", () => {
    const match = body.match(
      /Worked example — cover sheet, `requested_sheet_type: "cover"`[\s\S]*?```json\n([\s\S]*?)\n```[\s\S]*?```json\n([\s\S]*?)\n```/,
    );
    expect(match).not.toBeNull();
    const [, inputJson, outputJson] = match!;
    const input = JSON.parse(inputJson) as { requested_sheet_type: string };
    expect(input.requested_sheet_type).toBe("cover");
    const output = JSON.parse(outputJson) as { characters: Array<Record<string, unknown>> };
    const character = output.characters[0];
    for (const field of [
      "primary_portrait_prompt",
      "turnaround_prompt",
      "full_body_prompt",
      "expression_sheet_prompt",
      "outfit_sheet_prompt",
    ]) {
      expect(typeof character[field]).toBe("string");
      expect((character[field] as string).trim().length).toBeGreaterThan(0);
    }
    expect(character.sheet_type).toBe("cover");
    expect(typeof character.sheet_prompt).toBe("string");
    expect((character.sheet_prompt as string).trim().length).toBeGreaterThan(0);
    expect(character.sheet_prompt).toMatch(/CHARACTER DESIGN BIBLE/);
  });

  it("contains a worked example for requested_sheet_type: \"expression_12\" with sheet_prompt naming all 12 expressions", () => {
    const match = body.match(
      /Worked example — 12-panel expression grid, `requested_sheet_type: "expression_12"`[\s\S]*?```json\n([\s\S]*?)\n```[\s\S]*?```json\n([\s\S]*?)\n```/,
    );
    expect(match).not.toBeNull();
    const [, inputJson, outputJson] = match!;
    const input = JSON.parse(inputJson) as { requested_sheet_type: string };
    expect(input.requested_sheet_type).toBe("expression_12");
    const output = JSON.parse(outputJson) as { characters: Array<Record<string, unknown>> };
    const character = output.characters[0];
    expect(character.sheet_type).toBe("expression_12");
    const sheetPrompt = character.sheet_prompt as string;
    expect(sheetPrompt).toMatch(/Neutral/);
    expect(sheetPrompt).toMatch(/Surprised/);
    expect(sheetPrompt.trim().length).toBeGreaterThan(0);
  });

  it("contains a worked example for requested_sheet_type: \"full_combined\" whose sheet_prompt coherently references this character's own turnaround/expression/outfit prompts", () => {
    const match = body.match(
      /Worked example — full combined bible, `requested_sheet_type: "full_combined"`[\s\S]*?```json\n([\s\S]*?)\n```[\s\S]*?```json\n([\s\S]*?)\n```/,
    );
    expect(match).not.toBeNull();
    const [, inputJson, outputJson] = match!;
    const input = JSON.parse(inputJson) as { requested_sheet_type: string };
    expect(input.requested_sheet_type).toBe("full_combined");
    const output = JSON.parse(outputJson) as { characters: Array<Record<string, unknown>> };
    const character = output.characters[0];
    expect(character.sheet_type).toBe("full_combined");
    const sheetPrompt = character.sheet_prompt as string;
    expect(sheetPrompt).toMatch(/turnaround/i);
    expect(sheetPrompt).toMatch(/expression/i);
    expect(sheetPrompt).toMatch(/sidebar/i);
    // Must not be a naive literal concatenation of the other fields.
    expect(sheetPrompt).not.toBe(character.turnaround_prompt as string);
    expect(sheetPrompt).not.toBe(character.expression_sheet_prompt as string);
  });
});
