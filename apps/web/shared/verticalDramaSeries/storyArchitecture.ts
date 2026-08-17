import { z } from "zod";

export const VERTICAL_DRAMA_STORY_ARCHITECTURE_CONTRACT_VERSION = 1 as const;

export const VD_STORY_ARC_TYPES = [
  "romance",
  "academic",
  "professional_innovation",
  "underdog_identity",
  "mystery",
  "family",
  "survival",
  "revenge",
  "comedy",
  "other",
] as const;
export type VerticalDramaStoryArcType = (typeof VD_STORY_ARC_TYPES)[number];

const episodeWindowSchema = z
  .object({
    startEpisode: z.number().int().positive(),
    endEpisode: z.number().int().positive(),
  })
  .passthrough()
  .refine(value => value.endEpisode >= value.startEpisode, {
    message: "endEpisode must be greater than or equal to startEpisode",
  });

const transformationStageSchema = z
  .object({
    phase: z.string().trim().min(1).max(120),
    beliefBefore: z.string().trim().min(1).max(500),
    change: z.string().trim().min(1).max(500),
    evidence: z.string().trim().min(1).max(500),
    episodeWindow: episodeWindowSchema.optional(),
  })
  .passthrough();

const escalationStepSchema = z
  .object({
    phase: z.string().trim().min(1).max(120),
    pressure: z.string().trim().min(1).max(500),
    cost: z.string().trim().min(1).max(500),
    turningPoint: z.string().trim().min(1).max(500),
    episodeWindow: episodeWindowSchema.optional(),
  })
  .passthrough();

const storyArcBundleSchema = z
  .object({
    id: z.enum(VD_STORY_ARC_TYPES),
    label: z.string().trim().min(1).max(160),
    required: z.boolean(),
    startingState: z.string().trim().min(1).max(600),
    turningPoints: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
    failureOrCost: z.string().trim().min(1).max(600),
    payoff: z.string().trim().min(1).max(600),
    endState: z.string().trim().min(1).max(600),
    episodeWindow: episodeWindowSchema.optional(),
  })
  .passthrough();

export const verticalDramaStoryArchitectureContractSchema = z
  .object({
    contractVersion: z.literal(
      VERTICAL_DRAMA_STORY_ARCHITECTURE_CONTRACT_VERSION
    ),
    premiseAnchor: z.string().trim().min(1).max(1600),
    requiredArcTypes: z.array(z.enum(VD_STORY_ARC_TYPES)).min(1).max(8),
    audiencePromise: z
      .object({
        genrePromise: z.string().trim().min(1).max(500),
        emotionalPromise: z.string().trim().min(1).max(500),
        coreQuestion: z.string().trim().min(1).max(500),
      })
      .passthrough(),
    protagonistArc: z
      .object({
        startingState: z.string().trim().min(1).max(600),
        shortTermGoal: z.string().trim().min(1).max(600),
        internalNeed: z.string().trim().min(1).max(600),
        longTermDestination: z.string().trim().min(1).max(800),
        transformationStages: z.array(transformationStageSchema).min(3).max(6),
        endState: z.string().trim().min(1).max(800),
      })
      .passthrough(),
    primaryEngine: z
      .object({
        statement: z.string().trim().min(1).max(700),
        repeatableEpisodeMechanism: z.string().trim().min(1).max(700),
        escalationLadder: z.array(escalationStepSchema).min(3).max(8),
      })
      .passthrough(),
    arcBundles: z.array(storyArcBundleSchema).min(1).max(8),
    realityFailureModel: z
      .object({
        realWorldConstraints: z
          .array(z.string().trim().min(1).max(500))
          .min(1)
          .max(8),
        failedAttempts: z
          .array(z.string().trim().min(1).max(500))
          .min(1)
          .max(6),
        lessonsLearned: z
          .array(z.string().trim().min(1).max(500))
          .min(1)
          .max(6),
      })
      .passthrough(),
    destination: z
      .object({
        seasonEndpoint: z.string().trim().min(1).max(800),
        longTermEndpoint: z.string().trim().min(1).max(1000),
        horizon: z.enum(["season", "series", "epilogue"]),
        finalImage: z.string().trim().min(1).max(800),
        meaning: z.string().trim().min(1).max(800),
      })
      .passthrough(),
    promisePayoffMap: z
      .array(
        z
          .object({
            promiseId: z.string().trim().min(1).max(100),
            setup: z.string().trim().min(1).max(500),
            payoff: z.string().trim().min(1).max(600),
            payoffWindow: episodeWindowSchema.optional(),
          })
          .passthrough()
      )
      .min(1)
      .max(8),
    storyGuardrails: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  })
  .passthrough();

export type VerticalDramaStoryArchitectureContract = z.infer<
  typeof verticalDramaStoryArchitectureContractSchema
>;

export type VerticalDramaStoryArchitectureDiagnostic = {
  code:
    | "story_architecture_missing"
    | "story_destination_missing"
    | "protagonist_transformation_incomplete"
    | "primary_engine_incomplete"
    | "required_arc_missing"
    | "arc_payoff_incomplete"
    | "reality_failure_model_missing"
    | "promise_payoff_missing"
    | "architecture_episode_window_invalid";
  severity: "blocking" | "warning";
  message: string;
  messageEn: string;
  paths: string[];
  repairable: boolean;
};

export function readVerticalDramaStoryArchitecture(
  value: unknown
): VerticalDramaStoryArchitectureContract | null {
  const parsed = verticalDramaStoryArchitectureContractSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalized(value: string | undefined): string {
  return (value ?? "").toLocaleLowerCase();
}

export function inferVerticalDramaRequiredArcTypes(params: {
  genre?: string | null;
  userPremise?: string | null;
}): VerticalDramaStoryArcType[] {
  const text = normalized(`${params.genre ?? ""} ${params.userPremise ?? ""}`);
  const required = new Set<VerticalDramaStoryArcType>();
  if (/(romance|love|รัก|คู่แข่ง|แฟน|จีบ|ความสัมพันธ์)/i.test(text))
    required.add("romance");
  if (
    /(academic|campus|university|college|math|science|engineering|วิศว|คณิต|มหาวิทยาลัย|นักศึกษา|วิจัย)/i.test(
      text
    )
  ) {
    required.add("academic");
  }
  if (
    /(engineering|structure|construction|innovation|research|วิศวกรรม|โครงสร้าง|นวัตกรรม|สิ่งประดิษฐ์)/i.test(
      text
    )
  ) {
    required.add("professional_innovation");
  }
  if (
    /(underdog|outsider|fish.?out|คนนอก|ไม่มีใครเห็นค่า|พิสูจน์ตัวเอง)/i.test(
      text
    )
  ) {
    required.add("underdog_identity");
  }
  if (/(mystery|secret|detective|สืบสวน|ความลับ|ปริศนา|คดี)/i.test(text))
    required.add("mystery");
  if (/(family|ครอบครัว|พ่อแม่|พี่น้อง)/i.test(text)) required.add("family");
  if (/(survival|เอาตัวรอด|หายนะ|อันตราย)/i.test(text))
    required.add("survival");
  if (/(revenge|แก้แค้น|ล้างแค้น)/i.test(text)) required.add("revenge");
  if (/(comedy|ตลก|คอมเมดี้|วุ่นวาย)/i.test(text)) required.add("comedy");
  return [...required];
}

export function evaluateVerticalDramaStoryArchitecture(params: {
  contract: unknown;
  genre?: string | null;
  userPremise?: string | null;
  targetEpisodeCount?: number;
}): {
  ready: boolean;
  contract: VerticalDramaStoryArchitectureContract | null;
  diagnostics: VerticalDramaStoryArchitectureDiagnostic[];
} {
  const contract = readVerticalDramaStoryArchitecture(params.contract);
  const diagnostics: VerticalDramaStoryArchitectureDiagnostic[] = [];
  if (!contract) {
    diagnostics.push({
      code: "story_architecture_missing",
      severity: "blocking",
      message:
        "Draft ยังไม่มี Story Architecture ที่ครบถ้วน ระบบจะยังไม่เริ่ม QC",
      messageEn:
        "The draft has no complete Story Architecture yet, so Draft QC cannot start.",
      paths: ["storyContract"],
      repairable: true,
    });
    return { ready: false, contract: null, diagnostics };
  }

  const add = (
    code: VerticalDramaStoryArchitectureDiagnostic["code"],
    message: string,
    messageEn: string,
    paths: string[],
    severity: VerticalDramaStoryArchitectureDiagnostic["severity"] = "blocking"
  ) =>
    diagnostics.push({
      code,
      severity,
      message,
      messageEn,
      paths,
      repairable: true,
    });

  if (
    !contract.destination.seasonEndpoint ||
    !contract.destination.longTermEndpoint ||
    !contract.destination.finalImage
  ) {
    add(
      "story_destination_missing",
      "ยังไม่มีปลายทางของซีซัน ปลายทางระยะยาว หรือภาพปิดเรื่องที่ชัดเจน",
      "The season endpoint, long-term destination, or final image is missing.",
      ["storyContract.destination"]
    );
  }
  if (
    contract.protagonistArc.transformationStages.length < 3 ||
    !contract.protagonistArc.endState
  ) {
    add(
      "protagonist_transformation_incomplete",
      "เส้นการเปลี่ยนแปลงของตัวเอกยังไม่ครบตั้งแต่จุดเริ่มต้นจนถึงปลายทาง",
      "The protagonist transformation is incomplete from starting state to end state.",
      ["storyContract.protagonistArc"]
    );
  }
  if (
    contract.primaryEngine.escalationLadder.length < 3 ||
    !contract.primaryEngine.statement ||
    !contract.primaryEngine.repeatableEpisodeMechanism
  ) {
    add(
      "primary_engine_incomplete",
      "ยังไม่มีเครื่องยนต์เรื่องที่ทำงานซ้ำได้และบันไดการยกระดับความขัดแย้งที่ชัดเจน",
      "The repeatable story engine or escalation ladder is incomplete.",
      ["storyContract.primaryEngine"]
    );
  }

  const expectedArcs = inferVerticalDramaRequiredArcTypes({
    genre: params.genre,
    userPremise: params.userPremise,
  });
  const declaredArcs = new Set(
    contract.arcBundles.filter(arc => arc.required).map(arc => arc.id)
  );
  for (const arcType of expectedArcs) {
    if (!declaredArcs.has(arcType)) {
      add(
        "required_arc_missing",
        `ยังไม่มี Arc ที่จำเป็นสำหรับแนวเรื่อง: ${arcType}`,
        `The required ${arcType} arc is missing for this premise or genre.`,
        ["storyContract.arcBundles"]
      );
    }
  }
  for (const [index, arc] of contract.arcBundles.entries()) {
    if (!arc.payoff || !arc.endState || arc.turningPoints.length < 2) {
      add(
        "arc_payoff_incomplete",
        `Arc ${arc.label} ยังไม่มีจุดเปลี่ยน จุดจ่ายผลลัพธ์ หรือสถานะปลายทางครบถ้วน`,
        `Arc ${arc.label} lacks turning points, payoff, or an end state.`,
        [`storyContract.arcBundles[${index}]`]
      );
    }
    if (
      params.targetEpisodeCount &&
      arc.episodeWindow &&
      arc.episodeWindow.endEpisode > params.targetEpisodeCount
    ) {
      add(
        "architecture_episode_window_invalid",
        `Arc ${arc.label} กำหนดช่วงตอนเกินจำนวนตอนที่เลือกไว้`,
        `Arc ${arc.label} extends beyond the planned episode count.`,
        [`storyContract.arcBundles[${index}].episodeWindow`],
        "warning"
      );
    }
  }
  if (
    expectedArcs.includes("professional_innovation") &&
    contract.realityFailureModel.failedAttempts.length === 0
  ) {
    add(
      "reality_failure_model_missing",
      "เรื่องแนวนวัตกรรม/วิศวกรรมต้องมีความล้มเหลวจากข้อจำกัดของโลกจริง",
      "Innovation or engineering stories need a real-world failure model.",
      ["storyContract.realityFailureModel"]
    );
  }
  if (contract.promisePayoffMap.length === 0 || !contract.destination.meaning) {
    add(
      "promise_payoff_missing",
      "ยังไม่มีการเชื่อม Promise ตอนต้นกับ Final Payoff อย่างชัดเจน",
      "The opening promise is not mapped to a meaningful final payoff.",
      ["storyContract.promisePayoffMap", "storyContract.destination.meaning"]
    );
  }

  return {
    ready: diagnostics.every(diagnostic => diagnostic.severity !== "blocking"),
    contract,
    diagnostics,
  };
}

export function renderVerticalDramaStoryArchitectureBlock(
  value: unknown
): string | null {
  const contract = readVerticalDramaStoryArchitecture(value);
  if (!contract) return null;
  return [
    "APPROVED STORY ARCHITECTURE (AUTHORITATIVE, DO NOT REINTERPRET)",
    "This contract defines the protagonist destination, transformation, primary engine, required arcs, failure model, and final payoff. Preserve it when expanding the full story. Do not replace its destination with a new subplot.",
    JSON.stringify(contract),
  ].join("\n");
}

export function buildVerticalDramaStoryArchitecturePrompt(): string {
  return [
    "STORY ARCHITECTURE CONTRACT (SKILL-FIRST, REQUIRED)",
    "Create a complete architecture before any readable synopsis is written.",
    "The architecture must include audience promise, protagonist starting state and long-term destination, at least three transformation stages, a repeatable primary engine, at least three escalation steps, required genre arcs, real-world failure/costs, season endpoint, long-term endpoint, final image, and promise-to-payoff mapping.",
    "Separate season endpoint from long-term series endpoint when the premise spans multiple life stages. Do not compress a multi-year destination into an implausible single episode.",
    "Infer required arc types from the premise and genre, but do not force unrelated arcs into a story. Romance must have earned phases when romance is a genre promise. Academic/science/engineering stories must separate learning/status from professional/innovation impact when both are present.",
    "The primary engine must remain dominant. Do not turn a supporting scholarship, credit, mystery, or institutional obstacle into the core plot unless the creator explicitly makes it the premise.",
    "For innovation, science, or engineering stories, include failed attempts caused by real-world constraints. Mathematical/theoretical success must not automatically equal practical success.",
    "Use stable, bounded, creator-readable strings. Do not expose prompt instructions, JSON keys, preset IDs, or private reasoning in story values.",
    "Return JSON only matching the architecture schema.",
  ].join("\n");
}
