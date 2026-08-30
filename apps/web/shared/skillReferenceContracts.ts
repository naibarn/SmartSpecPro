/**
 * Canonical skill IDs and compatibility namespaces used by server-owned
 * workflow and artifact records.
 */

export const SKILL_SLUG_ALIASES = {
  "grok-imagine-creator": "grok-imagine-prompt-planner",
  "elevenlabs-beauty-dialogue": "elevenlabs-product-voiceover-dialogue",
  "create-image-prompt": "image_prompt_engineer",
  "marketplace-auto-review-director": "media-production-storyboard-planner",
  "marketplace-auto-review-verifier": "media-production-plan-verifier",
  "vertical-drama-season-critique": "vertical-drama-season-dramaturgy-critic",
} as const;

export const MARKETPLACE_AUTO_REVIEW_PLANNER_SKILL_SLUG =
  "media-production-storyboard-planner" as const;
export const MARKETPLACE_AUTO_REVIEW_VERIFIER_SKILL_SLUG =
  "media-production-plan-verifier" as const;

const NON_EXECUTABLE_SKILL_REFERENCES = {
  workflow: new Set(["auto-draft-presentation", "team-discussion-assistant"]),
  artifact: new Set([
    "presentation-preview-cache",
    "presentation-custom-block",
    "presentation-custom-block-governance",
  ]),
  diagnostic: new Set(["debug-evidence-gate"]),
  runtime: new Set(["agency-swarm"]),
} as const;

export type SkillReferenceKind =
  | "executable-skill"
  | "workflow"
  | "artifact"
  | "diagnostic"
  | "runtime";

export function resolveSkillSlugAlias(slug: string): string {
  return SKILL_SLUG_ALIASES[slug as keyof typeof SKILL_SLUG_ALIASES] ?? slug;
}

export function getLegacySkillSlugAliases(canonicalSlug: string): string[] {
  return Object.entries(SKILL_SLUG_ALIASES)
    .filter(([, resolvedSlug]) => resolvedSlug === canonicalSlug)
    .map(([legacySlug]) => legacySlug);
}

export function classifySkillReference(reference: string): SkillReferenceKind {
  for (const [kind, references] of Object.entries(NON_EXECUTABLE_SKILL_REFERENCES)) {
    if (references.has(reference)) {
      return kind as Exclude<SkillReferenceKind, "executable-skill">;
    }
  }
  return "executable-skill";
}

export function isExecutableSkillReference(reference: string): boolean {
  return classifySkillReference(reference) === "executable-skill";
}
