import { z } from "zod";
import {
  VD_SERIES_FORMAT_KINDS,
  createSeriesFormatConfig,
  type VdSeriesFormatKind,
} from "./seriesFormat";
import type { VdLookLockGenre } from "./seriesLookLock";
import {
  verticalDramaVisualGroundingContractSchema,
  type VdVisualGroundingContract,
} from "./visualGrounding";

export const VD_SERIES_PROFILE_IDS = [
  "drama_romance",
  "horror_thriller",
  "sci_fi_cyberpunk",
  "action_epic",
  "fantasy_fairytale_xianxia",
  "animation_cartoon",
  "documentary",
  "news_report",
  "location_review",
  "restaurant_review",
  "product_review",
  "software_review",
  "hybrid_docu_drama",
] as const;
export type VdSeriesProfileId = (typeof VD_SERIES_PROFILE_IDS)[number];

export const VD_PROFILE_CONTENT_KINDS = [
  "fiction",
  "documentary",
  "review",
  "hybrid",
] as const;
export type VdProfileContentKind = (typeof VD_PROFILE_CONTENT_KINDS)[number];

export const VD_PROFILE_GATE_POLICIES = ["optional", "required"] as const;
export type VdProfileGatePolicy = (typeof VD_PROFILE_GATE_POLICIES)[number];

export const VD_PROFILE_BROLL_POLICIES = [
  "reference_only",
  "approved_source_media",
  "evidence_and_broll",
] as const;
export type VdProfileBrollPolicy = (typeof VD_PROFILE_BROLL_POLICIES)[number];

const profileSlotSchema = z.object({
  key: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500),
  required: z.boolean(),
  acceptedKinds: z.array(z.enum(["image", "video", "text", "metadata"])).min(1),
});

export const verticalDramaSeriesProfileSchema = z.object({
  version: z.literal(1),
  profileId: z.enum(VD_SERIES_PROFILE_IDS),
  title: z.string().trim().min(1).max(120),
  titleEn: z.string().trim().min(1).max(120),
  contentKind: z.enum(VD_PROFILE_CONTENT_KINDS),
  seriesFormatKind: z.enum(VD_SERIES_FORMAT_KINDS),
  visualGenreKey: z.string().trim().min(1).max(80),
  episodeEngine: z.array(z.string().trim().min(1).max(180)).min(3).max(10),
  factPolicy: z.enum(["required_sources", "mixed", "fictional_ok"]),
  commercialDisclosure: z.enum([
    "none",
    "sponsored",
    "affiliate",
    "product_tie_in",
  ]),
  sourceGatePolicy: z.enum(VD_PROFILE_GATE_POLICIES),
  bRollPolicy: z.enum(VD_PROFILE_BROLL_POLICIES),
  defaultSlots: z.array(profileSlotSchema).max(32),
  grounding: verticalDramaVisualGroundingContractSchema,
  visualVersion: z.number().int().positive(),
});
export type VdSeriesProfile = z.infer<typeof verticalDramaSeriesProfileSchema>;

type GroundingInput = Omit<VdVisualGroundingContract, "version" | "mode">;

const fictionGrounding = (
  genreKey: string,
  requiredObservableCues: string[],
  cuePatterns: string[],
  forbiddenDrift: string[],
  requiredWorldMechanic = false
): VdVisualGroundingContract =>
  verticalDramaVisualGroundingContractSchema.parse({
    version: 1,
    mode: "strict_genre",
    genreKey,
    requiredObservableCues,
    cuePatterns,
    forbiddenDrift,
    minimumEpisodeCueCoverage: 1,
    requiredWorldMechanic,
  });

const reviewGrounding = (
  genreKey: string,
  cues: string[],
  patterns: string[]
): VdVisualGroundingContract =>
  fictionGrounding(
    genreKey,
    cues,
    [...patterns, "observation", "evidence", "ข้อจำกัด", "หลักฐาน"],
    ["invented factual claims presented as verified"]
  );

const slot = (
  key: string,
  title: string,
  description: string,
  required: boolean,
  ...acceptedKinds: Array<"image" | "video" | "text" | "metadata">
) => ({ key, title, description, required, acceptedKinds });

const profile = (
  input: Omit<VdSeriesProfile, "version" | "visualVersion"> &
    Partial<Pick<VdSeriesProfile, "visualVersion">>
): VdSeriesProfile =>
  verticalDramaSeriesProfileSchema.parse({
    version: 1,
    visualVersion: 1,
    ...input,
  });

const FICTION_ENGINE = [
  "hook",
  "inciting_event",
  "escalation",
  "choice",
  "payoff",
  "cliffhanger",
];

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

const profiles: VdSeriesProfile[] = [
  profile({
    profileId: "drama_romance",
    title: "ดราม่า / โรแมนติก",
    titleEn: "Drama / Romance",
    contentKind: "fiction",
    seriesFormatKind: "fiction_drama",
    visualGenreKey: "drama_romance",
    episodeEngine: FICTION_ENGINE,
    factPolicy: "fictional_ok",
    commercialDisclosure: "none",
    sourceGatePolicy: "optional",
    bRollPolicy: "reference_only",
    defaultSlots: [],
    grounding: fictionGrounding(
      "drama_romance",
      ["emotionally motivated setting and wardrobe"],
      ["relationship", "intimacy", "choice", "ความสัมพันธ์", "ความรัก"],
      ["random fantasy or sci-fi mechanics"]
    ),
  }),
  profile({
    profileId: "horror_thriller",
    title: "สยองขวัญ / ระทึกขวัญ",
    titleEn: "Horror / Thriller",
    contentKind: "fiction",
    seriesFormatKind: "fiction_drama",
    visualGenreKey: "horror_thriller",
    episodeEngine: FICTION_ENGINE,
    factPolicy: "fictional_ok",
    commercialDisclosure: "none",
    sourceGatePolicy: "optional",
    bRollPolicy: "reference_only",
    defaultSlots: [],
    grounding: fictionGrounding(
      "horror_thriller",
      ["specific threat evidence", "atmospheric consequence"],
      ["ghost", "entity", "curse", "shadow", "ผี", "คำสาป", "หลอน"],
      ["unmotivated comedy tone"]
    ),
  }),
  profile({
    profileId: "sci_fi_cyberpunk",
    title: "ไซไฟ / ไซเบอร์พังก์",
    titleEn: "Sci-fi / Cyberpunk",
    contentKind: "fiction",
    seriesFormatKind: "fiction_drama",
    visualGenreKey: "sci_fi_cyberpunk",
    episodeEngine: FICTION_ENGINE,
    factPolicy: "fictional_ok",
    commercialDisclosure: "none",
    sourceGatePolicy: "optional",
    bRollPolicy: "reference_only",
    defaultSlots: [],
    grounding: fictionGrounding(
      "sci_fi_cyberpunk",
      ["functional future technology", "technology constraint or cost"],
      ["technology", "interface", "data", "AI", "drone", "เทคโนโลยี", "ข้อมูล"],
      ["decorative neon without technology consequence"],
      true
    ),
  }),
  profile({
    profileId: "action_epic",
    title: "แอ็กชัน / มหากาพย์",
    titleEn: "Action / Epic",
    contentKind: "fiction",
    seriesFormatKind: "fiction_drama",
    visualGenreKey: "action_epic",
    episodeEngine: FICTION_ENGINE,
    factPolicy: "fictional_ok",
    commercialDisclosure: "none",
    sourceGatePolicy: "optional",
    bRollPolicy: "reference_only",
    defaultSlots: [],
    grounding: fictionGrounding(
      "action_epic",
      ["physical objective or threat", "readable action consequence"],
      ["fight", "chase", "impact", "weapon", "ต่อสู้", "ไล่ล่า"],
      ["unreadable weightless action"]
    ),
  }),
  profile({
    profileId: "fantasy_fairytale_xianxia",
    title: "แฟนตาซี / เทพนิยาย / เทพเซียน",
    titleEn: "Fantasy / Fairytale / Xianxia",
    contentKind: "fiction",
    seriesFormatKind: "fiction_drama",
    visualGenreKey: "fantasy_fairytale_xianxia",
    episodeEngine: FICTION_ENGINE,
    factPolicy: "fictional_ok",
    commercialDisclosure: "none",
    sourceGatePolicy: "optional",
    bRollPolicy: "reference_only",
    defaultSlots: [],
    grounding: fictionGrounding(
      "fantasy_fairytale_xianxia",
      [
        "magic or supernatural action",
        "artifact/realm evidence",
        "rule or cost",
      ],
      [
        "magic",
        "spell",
        "artifact",
        "realm",
        "cultivation",
        "เหาะ",
        "เวท",
        "อาคม",
      ],
      ["ordinary realism with fantasy adjectives only"],
      true
    ),
  }),
  profile({
    profileId: "animation_cartoon",
    title: "แอนิเมชัน / การ์ตูน",
    titleEn: "Animation / Cartoon",
    contentKind: "fiction",
    seriesFormatKind: "fiction_drama",
    visualGenreKey: "animation_cartoon",
    episodeEngine: FICTION_ENGINE,
    factPolicy: "fictional_ok",
    commercialDisclosure: "none",
    sourceGatePolicy: "optional",
    bRollPolicy: "reference_only",
    defaultSlots: [],
    grounding: fictionGrounding(
      "animation_cartoon",
      ["stylized world evidence", "imaginative visual action"],
      ["animated", "cartoon", "stylized", "impossible", "แอนิเมชัน", "การ์ตูน"],
      ["live-action realism with saturation only"]
    ),
  }),
  profile({
    profileId: "documentary",
    title: "สารคดี",
    titleEn: "Documentary",
    contentKind: "documentary",
    seriesFormatKind: "documentary",
    visualGenreKey: "documentary",
    episodeEngine: DOCUMENTARY_ENGINE,
    factPolicy: "required_sources",
    commercialDisclosure: "none",
    sourceGatePolicy: "required",
    bRollPolicy: "evidence_and_broll",
    defaultSlots: [
      slot(
        "subject_reference",
        "ตัวตนของเรื่อง",
        "ภาพหรือข้อมูลที่ระบุหัวข้อสารคดี",
        true,
        "image",
        "video",
        "text",
        "metadata"
      ),
      slot(
        "context_evidence",
        "บริบทและหลักฐาน",
        "สิ่งที่ช่วยอธิบายที่มาและบริบท",
        true,
        "image",
        "video",
        "text"
      ),
      slot(
        "interview_archive",
        "สัมภาษณ์หรือเอกสาร",
        "เสียง ภาพ หรือเอกสารจากแหล่งที่มา",
        false,
        "image",
        "video",
        "text"
      ),
    ],
    grounding: reviewGrounding(
      "documentary",
      [
        "observable real subject",
        "source/interview context",
        "counterpoint or limitation",
      ],
      ["subject", "interview", "archive", "สถานที่", "สัมภาษณ์"]
    ),
  }),
  profile({
    profileId: "news_report",
    title: "ข่าวเชิงสารคดี",
    titleEn: "News Report",
    contentKind: "documentary",
    seriesFormatKind: "news_report",
    visualGenreKey: "news_report",
    episodeEngine: DOCUMENTARY_ENGINE,
    factPolicy: "required_sources",
    commercialDisclosure: "none",
    sourceGatePolicy: "required",
    bRollPolicy: "evidence_and_broll",
    defaultSlots: [
      slot("news_scene", "ภาพสถานการณ์", "ภาพสถานที่หรือเหตุการณ์จริงที่กำลังรายงาน", true, "image", "video", "metadata"),
      slot("news_evidence", "หลักฐานและตัวเลข", "ภาพเอกสาร แผนที่ จุดวัด หรือข้อมูลที่ตรวจสอบได้", true, "image", "video", "text", "metadata"),
      slot("news_impact", "ผลกระทบต่อประชาชน", "ภาพพื้นที่และผู้ได้รับผลกระทบ โดยคำนึงถึงความเป็นส่วนตัว", true, "image", "video"),
      slot("news_archive", "ภาพเก็บ/ภาพประกอบ AI", "ภาพเก็บหรือภาพ AI ที่ติดป้ายชัดเจนและไม่ใช้ยืนยันข้อเท็จจริง", false, "image", "video"),
    ],
    grounding: reviewGrounding(
      "news_report",
      ["current event evidence", "as-of time", "affected people", "source attribution", "visual disclosure"],
      ["ข่าว", "สถานการณ์", "ล่าสุด", "วันนี้", "น้ำท่วม", "ดินสไลด์", "รายงาน"]
    ),
  }),
  profile({
    profileId: "location_review",
    title: "รีวิวสถานที่",
    titleEn: "Location Review",
    contentKind: "review",
    seriesFormatKind: "location_review",
    visualGenreKey: "location_review",
    episodeEngine: REVIEW_ENGINE,
    factPolicy: "required_sources",
    commercialDisclosure: "none",
    sourceGatePolicy: "required",
    bRollPolicy: "evidence_and_broll",
    defaultSlots: [
      slot(
        "location_identity",
        "ภาพยืนยันสถานที่",
        "ภายนอก ป้าย หรือจุดสังเกตของสถานที่",
        true,
        "image",
        "video",
        "metadata"
      ),
      slot(
        "location_space",
        "บรรยากาศและพื้นที่",
        "ภาพภายใน เส้นทาง หรือจุดใช้งานจริง",
        true,
        "image",
        "video"
      ),
      slot(
        "location_access",
        "การเดินทางและข้อจำกัด",
        "พิกัด ทางเข้า เวลาเปิด หรือข้อจำกัด",
        true,
        "text",
        "metadata",
        "image"
      ),
    ],
    grounding: reviewGrounding(
      "location_review",
      [
        "exterior identity",
        "interior or spatial detail",
        "route/accessibility",
        "limitation",
      ],
      ["place", "route", "address", "location", "พิกัด", "สถานที่"]
    ),
  }),
  profile({
    profileId: "restaurant_review",
    title: "รีวิวร้านอาหาร",
    titleEn: "Restaurant Review",
    contentKind: "review",
    seriesFormatKind: "restaurant_review",
    visualGenreKey: "restaurant_review",
    episodeEngine: REVIEW_ENGINE,
    factPolicy: "required_sources",
    commercialDisclosure: "none",
    sourceGatePolicy: "required",
    bRollPolicy: "evidence_and_broll",
    defaultSlots: [
      slot(
        "venue_exterior",
        "หน้าร้าน",
        "ภาพภายนอก ป้าย และบรรยากาศก่อนเข้าร้าน",
        true,
        "image",
        "video"
      ),
      slot(
        "venue_interior",
        "บรรยากาศภายใน",
        "โต๊ะ เคาน์เตอร์ การบริการ และพื้นที่จริง",
        true,
        "image",
        "video"
      ),
      slot(
        "kitchen_counter",
        "เคาน์เตอร์หรือครัว",
        "ภาพขั้นตอนหรือพื้นที่เตรียมอาหารที่เปิดเผยได้",
        false,
        "image",
        "video"
      ),
      slot(
        "menu_dish",
        "เมนูและจานอาหาร",
        "ราคา รายการอาหาร และภาพจานที่รีวิว",
        true,
        "image",
        "video",
        "text"
      ),
    ],
    grounding: reviewGrounding(
      "restaurant_review",
      [
        "venue identity",
        "service flow",
        "menu/price evidence",
        "dish detail",
        "limitation",
      ],
      ["restaurant", "menu", "dish", "service", "ร้าน", "เมนู", "อาหาร"]
    ),
  }),
  profile({
    profileId: "product_review",
    title: "รีวิวสินค้า",
    titleEn: "Product Review",
    contentKind: "review",
    seriesFormatKind: "product_review",
    visualGenreKey: "product_review",
    episodeEngine: REVIEW_ENGINE,
    factPolicy: "required_sources",
    commercialDisclosure: "product_tie_in",
    sourceGatePolicy: "required",
    bRollPolicy: "evidence_and_broll",
    defaultSlots: [
      slot(
        "product_identity",
        "ตัวสินค้า",
        "ภาพสินค้ารุ่นและบรรจุภัณฑ์ที่รีวิว",
        true,
        "image",
        "video",
        "metadata"
      ),
      slot(
        "product_detail",
        "รายละเอียดสำคัญ",
        "วัสดุ ปุ่ม พอร์ต หรือส่วนที่ต้องการชี้ให้เห็น",
        true,
        "image",
        "video"
      ),
      slot(
        "product_use",
        "การใช้งานจริง",
        "ภาพหรือวิดีโอขณะทดลองใช้",
        true,
        "image",
        "video"
      ),
      slot(
        "product_limit",
        "ข้อจำกัดหรือการเปรียบเทียบ",
        "หลักฐานของข้อจำกัด ราคา หรือทางเลือก",
        true,
        "image",
        "video",
        "text"
      ),
    ],
    grounding: reviewGrounding(
      "product_review",
      [
        "product identity",
        "material/control detail",
        "in-use demonstration",
        "result",
        "limitation/comparison",
      ],
      ["product", "specification", "use", "ราคา", "สินค้า", "ทดลอง"]
    ),
  }),
  profile({
    profileId: "software_review",
    title: "รีวิวซอฟต์แวร์",
    titleEn: "Software Review",
    contentKind: "review",
    seriesFormatKind: "software_review",
    visualGenreKey: "software_review",
    episodeEngine: REVIEW_ENGINE,
    factPolicy: "required_sources",
    commercialDisclosure: "product_tie_in",
    sourceGatePolicy: "required",
    bRollPolicy: "evidence_and_broll",
    defaultSlots: [
      slot(
        "software_identity",
        "ชื่อและหน้าตาระบบ",
        "หน้าจอหรือภาพที่ยืนยันซอฟต์แวร์",
        true,
        "image",
        "video",
        "metadata"
      ),
      slot(
        "software_workflow",
        "ขั้นตอนใช้งาน",
        "screen recording ของ workflow ที่รีวิว",
        true,
        "image",
        "video"
      ),
      slot(
        "software_result",
        "ผลลัพธ์",
        "สิ่งที่ระบบทำได้จริงจากการทดลอง",
        true,
        "image",
        "video",
        "text"
      ),
      slot(
        "software_limit",
        "ข้อจำกัดและแผนราคา",
        "ข้อจำกัด ความเข้ากันได้ หรือข้อมูล plan",
        true,
        "image",
        "video",
        "text"
      ),
    ],
    grounding: reviewGrounding(
      "software_review",
      [
        "software/UI identity",
        "setup/workflow",
        "feature result",
        "platform/responsiveness",
        "limitation/plan",
      ],
      ["software", "app", "workflow", "interface", "ระบบ", "โปรแกรม"]
    ),
  }),
  profile({
    profileId: "hybrid_docu_drama",
    title: "สารคดีผสมดราม่า",
    titleEn: "Hybrid Documentary-Drama",
    contentKind: "hybrid",
    seriesFormatKind: "hybrid_docu_drama",
    visualGenreKey: "hybrid_docu_drama",
    episodeEngine: DOCUMENTARY_ENGINE,
    factPolicy: "mixed",
    commercialDisclosure: "none",
    sourceGatePolicy: "required",
    bRollPolicy: "evidence_and_broll",
    defaultSlots: [
      slot(
        "documentary_evidence",
        "หลักฐานสารคดี",
        "แหล่งข้อมูล ภาพจริง หรือเสียงสัมภาษณ์",
        true,
        "image",
        "video",
        "text"
      ),
      slot(
        "reenactment_reference",
        "ฉากจำลองที่ติดป้ายชัดเจน",
        "สิ่งที่ใช้เป็นแนวทางสำหรับ reenactment/POV",
        false,
        "image",
        "video",
        "text"
      ),
    ],
    grounding: reviewGrounding(
      "hybrid_docu_drama",
      [
        "documentary evidence",
        "labelled reenactment",
        "separation of fact and drama",
      ],
      ["documentary", "reenactment", "dramatized", "สารคดี", "จำลอง"]
    ),
  }),
];

export const SERIES_PROFILE_REGISTRY: readonly VdSeriesProfile[] = profiles;

const byId = new Map(profiles.map(item => [item.profileId, item]));

export function getSeriesProfile(profileId: string): VdSeriesProfile {
  const value = byId.get(profileId as VdSeriesProfileId);
  if (!value)
    throw new Error(`Unsupported vertical drama series profile: ${profileId}`);
  return structuredClone(value);
}

export function listSeriesProfiles(): VdSeriesProfile[] {
  return profiles.map(item => structuredClone(item));
}

export type SeriesProfileResolution = {
  profile: VdSeriesProfile;
  source: "series_profile" | "series_format" | "look_lock" | "default";
  warnings: string[];
};

function profileFromFormat(kind: VdSeriesFormatKind): VdSeriesProfileId {
  if (kind === "documentary") return "documentary";
  if (kind === "news_report") return "news_report";
  if (kind === "location_review") return "location_review";
  if (kind === "restaurant_review") return "restaurant_review";
  if (kind === "product_review") return "product_review";
  if (kind === "software_review") return "software_review";
  if (kind === "hybrid_docu_drama") return "hybrid_docu_drama";
  return "drama_romance";
}

function profileFromLook(genreKey: string): VdSeriesProfileId | undefined {
  return VD_LOOK_PROFILE_MAP[genreKey as keyof typeof VD_LOOK_PROFILE_MAP];
}

const VD_LOOK_PROFILE_MAP: Record<VdLookLockGenre, VdSeriesProfileId> = {
  drama_romance: "drama_romance",
  horror_thriller: "horror_thriller",
  sci_fi_cyberpunk: "sci_fi_cyberpunk",
  action_epic: "action_epic",
  fantasy_fairytale: "fantasy_fairytale_xianxia",
  animation_cartoon: "animation_cartoon",
};

export function resolveSeriesProfile(value: unknown): SeriesProfileResolution {
  const bible =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const explicit = bible.seriesProfile;
  if (explicit && typeof explicit === "object") {
    const compactProfileId = (explicit as { profileId?: unknown }).profileId;
    if (
      typeof compactProfileId === "string" &&
      byId.has(compactProfileId as VdSeriesProfileId)
    ) {
      return {
        profile: getSeriesProfile(compactProfileId),
        source: "series_profile",
        warnings: [],
      };
    }
    const parsed = verticalDramaSeriesProfileSchema.safeParse(explicit);
    if (parsed.success && byId.has(parsed.data.profileId)) {
      const warnings: string[] = [];
      if (bible.seriesFormat && typeof bible.seriesFormat === "object") {
        const kind = (bible.seriesFormat as { kind?: unknown }).kind;
        if (
          typeof kind === "string" &&
          profileFromFormat(kind as VdSeriesFormatKind) !==
            parsed.data.profileId
        ) {
          warnings.push(
            "seriesFormat conflicts with seriesProfile; profile wins"
          );
        }
      }
      return {
        profile: structuredClone(parsed.data),
        source: "series_profile",
        warnings,
      };
    }
  }

  const format = bible.seriesFormat;
  if (format && typeof format === "object") {
    const kind = (format as { kind?: unknown }).kind;
    if (
      typeof kind === "string" &&
      VD_SERIES_FORMAT_KINDS.includes(kind as VdSeriesFormatKind)
    ) {
      return {
        profile: getSeriesProfile(
          profileFromFormat(kind as VdSeriesFormatKind)
        ),
        source: "series_format",
        warnings: [],
      };
    }
  }

  const lookLock = bible.lookLockControl;
  if (lookLock && typeof lookLock === "object") {
    const genreKey = (lookLock as { genreKey?: unknown }).genreKey;
    if (typeof genreKey === "string") {
      const profileId = profileFromLook(genreKey);
      if (profileId)
        return {
          profile: getSeriesProfile(profileId),
          source: "look_lock",
          warnings: [],
        };
    }
  }
  return {
    profile: getSeriesProfile("drama_romance"),
    source: "default",
    warnings: [],
  };
}

export function projectProfileToLegacy(profileId: VdSeriesProfileId) {
  const profile = getSeriesProfile(profileId);
  const seriesFormat = createSeriesFormatConfig(profile.seriesFormatKind, {
    factPolicy: profile.factPolicy,
    commercialDisclosure: profile.commercialDisclosure,
    episodeEngine: profile.episodeEngine,
    visualTreatment: profile.grounding.requiredObservableCues.join(", "),
  });
  const legacyLook =
    profile.contentKind === "fiction" &&
    profile.profileId !== "fantasy_fairytale_xianxia"
      ? (profile.profileId as VdLookLockGenre)
      : profile.profileId === "fantasy_fairytale_xianxia"
        ? "fantasy_fairytale"
        : undefined;
  return {
    profile: structuredClone(profile),
    seriesFormat,
    legacyLookLockGenreKey: legacyLook,
  };
}

export function buildSeriesProfileInvalidation(
  previous: VdSeriesProfile,
  next: VdSeriesProfile
) {
  return {
    changed:
      previous.profileId !== next.profileId ||
      previous.visualVersion !== next.visualVersion,
    previousProfileId: previous.profileId,
    nextProfileId: next.profileId,
    previousVisualVersion: previous.visualVersion,
    nextVisualVersion: next.visualVersion,
    invalidateSourceAnalysis: previous.profileId !== next.profileId,
    invalidateDigest:
      previous.profileId !== next.profileId ||
      previous.visualVersion !== next.visualVersion,
    requiresSourceGate: next.sourceGatePolicy === "required",
  };
}

export function renderSeriesProfilePromptBlock(
  profile: VdSeriesProfile
): string {
  return [
    "CANONICAL SERIES PROFILE (HARD CONTRACT):",
    JSON.stringify({
      profileId: profile.profileId,
      contentKind: profile.contentKind,
      format: profile.seriesFormatKind,
      engine: profile.episodeEngine,
      grounding: profile.grounding,
      evidence: profile.defaultSlots.map(item => ({
        key: item.key,
        required: item.required,
      })),
    }),
    "The profile is authoritative. Do not replace its world/content behavior with a generic drama or documentary treatment.",
  ].join("\n");
}
