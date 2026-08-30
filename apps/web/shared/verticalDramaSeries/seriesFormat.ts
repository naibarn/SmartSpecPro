import { z } from "zod";

export const VD_SERIES_FORMAT_KINDS = [
  "fiction_drama",
  "documentary",
  "news_report",
  "location_review",
  "restaurant_review",
  "product_review",
  "software_review",
  "hybrid_docu_drama",
] as const;
export type VdSeriesFormatKind = (typeof VD_SERIES_FORMAT_KINDS)[number];

export const VD_FACT_POLICIES = [
  "required_sources",
  "mixed",
  "fictional_ok",
] as const;
export const VD_COMMERCIAL_DISCLOSURES = [
  "none",
  "sponsored",
  "affiliate",
  "product_tie_in",
] as const;

const evidenceRequirementSchema = z.object({
  subject: z.string().trim().min(1).max(180),
  sourceRefs: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
  requireObservation: z.boolean().default(true),
  requireOpinionLabel: z.boolean().default(true),
});

export const verticalDramaSeriesFormatConfigSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(VD_SERIES_FORMAT_KINDS),
    titleLabel: z.string().trim().min(1).max(120),
    episodeEngine: z.array(z.string().trim().min(1).max(180)).min(3).max(8),
    factPolicy: z.enum(VD_FACT_POLICIES),
    commercialDisclosure: z.enum(VD_COMMERCIAL_DISCLOSURES),
    requiredEvidence: evidenceRequirementSchema.optional(),
    ctaPolicy: z.enum([
      "none",
      "soft_next_episode",
      "visit_or_try",
      "learn_more",
    ]),
    visualTreatment: z.string().trim().min(1).max(360),
  })
  .passthrough();

export type VdSeriesFormatConfig = z.infer<
  typeof verticalDramaSeriesFormatConfigSchema
>;

const REVIEW_ENGINE = [
  "hook",
  "context",
  "direct_observation_or_demo",
  "verifiable_claims_and_source_labels",
  "strengths_and_limitations",
  "verdict_or_next_question",
  "next_episode_tease",
];
const DOCUMENTARY_ENGINE = [
  "hook",
  "subject_context",
  "observational_scene",
  "interview_or_source_evidence",
  "counterpoint",
  "episode_takeaway",
  "next_question",
];

export function createSeriesFormatConfig(
  kind: VdSeriesFormatKind,
  overrides: Partial<VdSeriesFormatConfig> = {}
): VdSeriesFormatConfig {
  const isReview = kind.endsWith("_review");
  const base: VdSeriesFormatConfig = {
    version: 1,
    kind,
    titleLabel:
      kind === "fiction_drama"
        ? "ซีรีส์เรื่องแต่ง"
        : kind === "documentary"
          ? "สารคดีแบบซีรีส์"
          : kind === "news_report"
            ? "ข่าวเชิงสารคดีแบบซีรีส์"
          : kind === "hybrid_docu_drama"
            ? "สารคดีผสมดราม่า"
            : `ซีรีส์${kind.replace("_review", "")}รีวิว`,
    episodeEngine:
      kind === "documentary" || kind === "news_report" || kind === "hybrid_docu_drama"
        ? DOCUMENTARY_ENGINE
        : isReview
          ? REVIEW_ENGINE
          : [
              "hook",
              "inciting_event",
              "escalation",
              "choice",
              "payoff",
              "cliffhanger",
            ],
    factPolicy: kind === "fiction_drama" ? "fictional_ok" : "required_sources",
    commercialDisclosure: "none",
    requiredEvidence:
      kind === "fiction_drama"
        ? undefined
        : {
            subject: "series subject",
            sourceRefs: [],
            requireObservation: true,
            requireOpinionLabel: true,
          },
    ctaPolicy: kind === "fiction_drama" ? "soft_next_episode" : "learn_more",
    visualTreatment:
      kind === "fiction_drama"
        ? "story-first cinematic coverage"
        : "observable subject, evidence details, and clearly separated opinion",
  };
  return verticalDramaSeriesFormatConfigSchema.parse({ ...base, ...overrides });
}

export function resolveSeriesFormatConfig(
  value: unknown
): VdSeriesFormatConfig {
  const parsed = verticalDramaSeriesFormatConfigSchema.safeParse(value);
  return parsed.success
    ? parsed.data
    : createSeriesFormatConfig("fiction_drama");
}

export function renderSeriesFormatPromptBlock(
  config: VdSeriesFormatConfig | null | undefined
): string | null {
  if (!config || config.kind === "fiction_drama") return null;
  return [
    "SERIES FORMAT CONTRACT (HARD CONTENT CONTRACT):",
    JSON.stringify(config),
    "Follow the episode engine in order. Separate verified claims, direct observations, and opinions in the output.",
    config.factPolicy === "required_sources"
      ? "Never invent a price, specification, address, rating, quote, feature, or outcome. If no source is supplied, label the item as observation/opinion or NEEDS_VERIFICATION."
      : "Do not present uncertain claims as verified facts.",
    config.commercialDisclosure !== "none"
      ? `Include a natural disclosure for ${config.commercialDisclosure} and a non-deceptive CTA.`
      : "Do not add sponsorship or sales claims that were not supplied by the creator.",
    "The format enriches the approved premise and cannot rewrite canon, characters, relationships, or continuity.",
  ].join("\n");
}
