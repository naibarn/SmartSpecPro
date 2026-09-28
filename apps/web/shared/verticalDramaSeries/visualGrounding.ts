import { z } from "zod";
import type { VdLookLockGenre } from "./seriesLookLock";
import type { VdSeriesFormatKind } from "./seriesFormat";

export const VD_VISUAL_GROUNDING_MODES = [
  "legacy_soft",
  "strict_genre",
] as const;
export type VdVisualGroundingMode = (typeof VD_VISUAL_GROUNDING_MODES)[number];

export const verticalDramaVisualGroundingContractSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(VD_VISUAL_GROUNDING_MODES),
    genreKey: z.string().trim().min(1).max(80),
    requiredObservableCues: z
      .array(z.string().trim().min(1).max(180))
      .min(1)
      .max(8),
    cuePatterns: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
    forbiddenDrift: z.array(z.string().trim().min(1).max(180)).max(8),
    minimumEpisodeCueCoverage: z.number().int().min(0).max(8).default(1),
    requiredWorldMechanic: z.boolean().default(false),
  })
  .passthrough();

export type VdVisualGroundingContract = z.infer<
  typeof verticalDramaVisualGroundingContractSchema
>;

const PRESETS: Record<
  string,
  Omit<VdVisualGroundingContract, "version" | "mode">
> = {
  sci_fi_cyberpunk: {
    genreKey: "sci_fi_cyberpunk",
    requiredObservableCues: [
      "functional future technology",
      "data/interface or engineered infrastructure",
      "technology constraint or cost",
    ],
    cuePatterns: [
      "technology",
      "interface",
      "data",
      "drone",
      "AI",
      "implant",
      "reactor",
      "sensor",
      "hologram",
      "network",
      "ระบบ",
      "เทคโนโลยี",
      "ข้อมูล",
      "ปัญญาประดิษฐ์",
    ],
    forbiddenDrift: ["generic contemporary drama with decorative neon only"],
    minimumEpisodeCueCoverage: 1,
    requiredWorldMechanic: true,
  },
  fantasy_fairytale: {
    genreKey: "fantasy_fairytale",
    requiredObservableCues: [
      "magic, myth, or supernatural action",
      "artifact/realm/creature evidence",
      "rule, cost, or consequence of the power",
    ],
    cuePatterns: [
      "magic",
      "spell",
      "curse",
      "artifact",
      "realm",
      "dragon",
      "cultivation",
      "flight",
      "เวท",
      "มนตร์",
      "คาถา",
      "เหาะ",
      "อาคม",
      "แดนเซียน",
    ],
    forbiddenDrift: [
      "ordinary contemporary realism with fantasy adjectives only",
    ],
    minimumEpisodeCueCoverage: 1,
    requiredWorldMechanic: true,
  },
  animation_cartoon: {
    genreKey: "animation_cartoon",
    requiredObservableCues: [
      "expressive animated visual language",
      "stylized world or character design evidence",
      "imaginative visual action or impossible detail",
    ],
    cuePatterns: [
      "animated",
      "cartoon",
      "stylized",
      "exaggerated",
      "impossible",
      "animation",
      "แอนิเมชัน",
      "การ์ตูน",
      "เหนือจริง",
      "เว่อร์วัง",
    ],
    forbiddenDrift: [
      "generic live-action realism with only a saturated color grade",
    ],
    minimumEpisodeCueCoverage: 1,
    requiredWorldMechanic: false,
  },
  action_epic: {
    genreKey: "action_epic",
    requiredObservableCues: [
      "physical objective or threat",
      "readable action consequence",
    ],
    cuePatterns: [
      "fight",
      "chase",
      "impact",
      "weapon",
      "ต่อสู้",
      "ไล่ล่า",
      "โจมตี",
      "บาดเจ็บ",
    ],
    forbiddenDrift: [],
    minimumEpisodeCueCoverage: 1,
    requiredWorldMechanic: false,
  },
  horror_thriller: {
    genreKey: "horror_thriller",
    requiredObservableCues: [
      "specific threat evidence",
      "atmospheric or sensory consequence",
    ],
    cuePatterns: [
      "ghost",
      "entity",
      "curse",
      "eerie",
      "shadow",
      "ผี",
      "คำสาป",
      "วิญญาณ",
      "เงา",
      "หลอน",
    ],
    forbiddenDrift: [],
    minimumEpisodeCueCoverage: 1,
    requiredWorldMechanic: false,
  },
  documentary: {
    genreKey: "documentary",
    requiredObservableCues: [
      "observable real subject",
      "source/interview/context evidence",
    ],
    cuePatterns: [
      "observation",
      "interview",
      "source",
      "evidence",
      "สถานที่",
      "สัมภาษณ์",
      "หลักฐาน",
      "รีวิว",
    ],
    forbiddenDrift: ["invented factual claims presented as verified"],
    minimumEpisodeCueCoverage: 1,
    requiredWorldMechanic: false,
  },
};

function presetKey(
  genreKey: string | undefined,
  formatKind?: VdSeriesFormatKind
): string {
  if (formatKind && formatKind !== "fiction_drama") return "documentary";
  return genreKey && PRESETS[genreKey] ? genreKey : "drama_romance";
}

export function resolveVisualGroundingContract(params: {
  genreKey?: VdLookLockGenre | string;
  formatKind?: VdSeriesFormatKind;
  mode?: VdVisualGroundingMode;
}): VdVisualGroundingContract {
  const key = presetKey(params.genreKey, params.formatKind);
  const preset = PRESETS[key] ?? {
    genreKey: key,
    requiredObservableCues: ["episode-specific visual evidence"],
    cuePatterns: ["scene", "object", "action", "ฉาก", "วัตถุ", "การกระทำ"],
    forbiddenDrift: [],
    minimumEpisodeCueCoverage: 1,
    requiredWorldMechanic: false,
  };
  return verticalDramaVisualGroundingContractSchema.parse({
    version: 1,
    mode: params.mode ?? "legacy_soft",
    ...preset,
  });
}

export function renderVisualGroundingPromptBlock(
  contract: VdVisualGroundingContract | null | undefined
): string | null {
  if (!contract || contract.mode !== "strict_genre") return null;
  return [
    "STRICT VISUAL GENRE GROUNDING (OBSERVABLE EVIDENCE CONTRACT):",
    JSON.stringify(contract),
    "Every episode must include the required observable genre cues in its story beats or shot summaries. Palette, lighting, costume, or a genre adjective alone is not evidence.",
    contract.requiredWorldMechanic
      ? "State the concrete world mechanic and its limit/cost when the power or technology affects a choice."
      : "Make the genre evidence causally relevant to the episode's objective or consequence.",
    "Canon, user premise, continuity, relationship graph, and factual evidence have precedence. Never invent a plot or character merely to add a cue.",
  ].join("\n");
}

export type VdVisualGroundingEpisode = {
  episodeNumber: number;
  logline?: string;
  keyBeats?: string[];
  shotDrafts?: Array<{
    summary?: string;
    dialogue_lines?: Array<{ line?: string }>;
  }>;
  world_rules?: Array<{ rule?: string; limit_or_cost?: string }>;
  genre_evidence?: {
    observed_cues?: string[];
    world_mechanic?: string;
    causal_cost?: string;
  };
};

export function evaluateVisualGenreGrounding(
  episodes: VdVisualGroundingEpisode[],
  contract: VdVisualGroundingContract
) {
  return episodes.map(episode => {
    const text = [
      episode.logline,
      ...(episode.keyBeats ?? []),
      ...(episode.shotDrafts ?? []).flatMap(shot => [
        shot.summary,
        ...(shot.dialogue_lines ?? []).map(line => line.line),
      ]),
      ...(episode.world_rules ?? []).flatMap(rule => [
        rule.rule,
        rule.limit_or_cost,
      ]),
      ...(episode.genre_evidence?.observed_cues ?? []),
      episode.genre_evidence?.world_mechanic,
      episode.genre_evidence?.causal_cost,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLowerCase();
    const matched = contract.cuePatterns.filter(pattern =>
      text.includes(pattern.toLowerCase())
    );
    const hasMechanic = Boolean(
      episode.genre_evidence?.world_mechanic ||
      (episode.world_rules ?? []).some(rule => rule.rule && rule.limit_or_cost)
    );
    const missing = contract.requiredObservableCues.filter((_, index) => {
      if (
        index === contract.requiredObservableCues.length - 1 &&
        contract.requiredWorldMechanic
      )
        return !hasMechanic;
      return matched.length === 0;
    });
    return {
      episodeNumber: episode.episodeNumber,
      passed:
        matched.length >= contract.minimumEpisodeCueCoverage &&
        missing.length === 0,
      matchedCues: matched,
      missingCues: missing,
      severity:
        matched.length === 0
          ? contract.mode === "strict_genre"
            ? "blocking"
            : "warning"
          : "info",
    } as const;
  });
}
