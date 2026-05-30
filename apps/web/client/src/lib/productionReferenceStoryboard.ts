export type ProductionReferenceStoryboardScene = {
  timeRange?: string | null;
  title?: string | null;
  detail?: string | null;
};

export type ProductionReferenceStoryboardVoiceoverBeat = {
  order?: string | number | null;
  startSec?: string | number | null;
  endSec?: string | number | null;
  title?: string | null;
  script?: string | null;
  voiceoverScript?: string | null;
};

export type ProductionReferenceStoryboardConcept = {
  title?: string | null;
  angle?: string | null;
  audience?: string | null;
  painPoint?: string | null;
  hook?: string | null;
  useCase?: string | null;
  conceptDetails?: string | null;
  productFacts?: string | null;
  sellingPoints?: string[] | null;
  objectionsTrust?: string[] | null;
  sceneTimeline?: ProductionReferenceStoryboardScene[] | null;
  voiceoverBeats?: ProductionReferenceStoryboardVoiceoverBeat[] | null;
};

export const PRODUCTION_REFERENCE_STORYBOARD_SKILL_ID = "product-reference-storyboard";
export const PRODUCTION_REFERENCE_STORYBOARD_FALLBACK_SKILL_ID = PRODUCTION_REFERENCE_STORYBOARD_SKILL_ID;
export const PRODUCTION_REFERENCE_STORYBOARD_FALLBACK_PRODUCT_CATEGORY = "auto";

export const PRODUCTION_REFERENCE_STORYBOARD_PRODUCT_CATEGORIES = [
  "auto",
  "household_product",
  "computer_laptop",
  "electrical_appliance",
  "food_beverage",
  "electronics",
  "fashion_clothing",
  "shoes",
  "watch_eyewear",
  "mobile_tablet",
  "jewelry",
  "mother_baby",
  "pet_supplies",
  "sports_equipment",
  "camera_photography",
  "gaming_accessories",
  "automotive",
  "stationery",
  "books",
  "furniture",
  "cosmetics",
] as const;

export type ProductionReferenceStoryboardProductCategory =
  (typeof PRODUCTION_REFERENCE_STORYBOARD_PRODUCT_CATEGORIES)[number];

type ProductionReferenceStoryboardSkillRule = {
  productCategory: Exclude<ProductionReferenceStoryboardProductCategory, "auto">;
  legacySkillId: string;
  signals: string[];
};

const PRODUCTION_REFERENCE_STORYBOARD_SKILL_RULES: ProductionReferenceStoryboardSkillRule[] = [
  {
    productCategory: "mother_baby",
    legacySkillId: "mother-baby-reference-storyboard",
    signals: [
      "แม่และเด็ก", "สินค้าแม่และเด็ก", "เด็กอ่อน", "ทารก", "เด็ก 6 เดือน", "หัดนั่ง",
      "เก้าอี้กินข้าวเด็ก", "เก้าอี้ทานข้าวเด็ก", "เก้าอี้เด็ก", "รถเข็นเด็ก", "ขวดนม",
      "ผ้าอ้อม", "จุกนม", "baby", "infant", "toddler", "stroller", "baby chair",
      "baby seat", "high chair", "feeding chair", "diaper", "pacifier", "baby bottle",
    ],
  },
  {
    productCategory: "mobile_tablet",
    legacySkillId: "mobile-tablet-reference-storyboard",
    signals: [
      "มือถือ", "สมาร์ทโฟน", "โทรศัพท์", "แท็บเล็ต", "เคสมือถือ", "ฟิล์มกันรอย",
      "smartphone", "mobile phone", "tablet", "ipad", "phone case", "screen protector",
      "stylus", "foldable phone",
    ],
  },
  {
    productCategory: "computer_laptop",
    legacySkillId: "computer-laptop-reference-storyboard",
    signals: [
      "คอมพิวเตอร์", "แล็ปท็อป", "โน้ตบุ๊ก", "โน๊ตบุ๊ค", "จอคอม", "คีย์บอร์ด", "เมาส์",
      "laptop", "notebook computer", "desktop computer", "monitor", "keyboard", "mouse",
      "pc case", "mini pc", "docking station",
    ],
  },
  {
    productCategory: "camera_photography",
    legacySkillId: "camera-photography-reference-storyboard",
    signals: [
      "กล้อง", "เลนส์", "ขาตั้งกล้อง", "กิมบอล", "แฟลช", "ไฟถ่ายภาพ", "กระเป๋ากล้อง",
      "camera", "lens", "tripod", "gimbal", "flash", "action camera", "instant camera",
      "camera bag", "photography",
    ],
  },
  {
    productCategory: "gaming_accessories",
    legacySkillId: "gaming-accessories-reference-storyboard",
    signals: [
      "เกม", "เกมส์", "เกมมิ่ง", "จอยเกม", "คอนโทรลเลอร์", "เครื่องเกม", "แผ่นเกม",
      "gaming", "game console", "controller", "gamepad", "gaming headset", "mousepad",
      "charging dock",
    ],
  },
  {
    productCategory: "electrical_appliance",
    legacySkillId: "electrical-appliance-reference-storyboard",
    signals: [
      "เครื่องใช้ไฟฟ้า", "ตู้เย็น", "เครื่องซักผ้า", "ไมโครเวฟ", "หม้อทอด", "เครื่องปั่น",
      "พัดลม", "เครื่องฟอกอากาศ", "กาต้มน้ำ", "หม้อหุงข้าว", "เตารีด", "เครื่องดูดฝุ่น",
      "appliance", "refrigerator", "washing machine", "microwave", "air fryer", "blender",
      "fan", "air purifier", "kettle", "rice cooker", "iron", "vacuum cleaner",
    ],
  },
  {
    productCategory: "electronics",
    legacySkillId: "electronics-reference-storyboard",
    signals: [
      "อุปกรณ์อิเล็กทรอนิกส์", "หูฟัง", "ลำโพง", "เราเตอร์", "สมาร์ทโฮม", "สายชาร์จ",
      "พาวเวอร์แบงค์", "ไมโครโฟน", "รีโมต", "เซนเซอร์", "earbuds", "headphones",
      "speaker", "router", "smart home", "charger", "power bank", "cable", "adapter",
      "hub", "microphone", "remote", "sensor", "gadget",
    ],
  },
  {
    productCategory: "automotive",
    legacySkillId: "automotive-reference-storyboard",
    signals: [
      "ยานยนต์", "รถยนต์", "มอเตอร์ไซค์", "หมวกกันน็อค", "กล้องติดรถ", "ยางรถ",
      "น้ำมันเครื่อง", "car accessory", "automotive", "motorcycle", "helmet", "dash cam",
      "car mount", "tire", "engine oil", "vehicle",
    ],
  },
  {
    productCategory: "food_beverage",
    legacySkillId: "food-beverage-reference-storyboard",
    signals: [
      "อาหาร", "เครื่องดื่ม", "ขนม", "ซอส", "กาแฟ", "ชา", "น้ำดื่ม", "ผงชงดื่ม",
      "food", "beverage", "snack", "sauce", "coffee", "tea", "drink", "powdered drink",
      "ready meal", "ingredient",
    ],
  },
  {
    productCategory: "pet_supplies",
    legacySkillId: "pet-supplies-reference-storyboard",
    signals: [
      "สัตว์เลี้ยง", "อาหารสัตว์", "ของใช้สัตว์", "ปลอกคอ", "สายจูง", "ทรายแมว",
      "pet", "pet food", "pet supplies", "collar", "leash", "harness", "litter",
      "grooming", "aquarium",
    ],
  },
  {
    productCategory: "shoes",
    legacySkillId: "shoes-reference-storyboard",
    signals: [
      "รองเท้า", "สนีกเกอร์", "รองเท้าวิ่ง", "รองเท้าแตะ", "บูท", "ส้นสูง", "loafers",
      "sneakers", "running shoes", "sandals", "slippers", "boots", "heels", "footwear",
    ],
  },
  {
    productCategory: "fashion_clothing",
    legacySkillId: "fashion-clothing-reference-storyboard",
    signals: [
      "เสื้อผ้า", "แฟชั่น", "เดรส", "กางเกง", "กระโปรง", "แจ็คเก็ต", "ชุดว่ายน้ำ",
      "เสื้อเชิ้ต", "clothing", "fashion", "shirt", "dress", "pants", "skirt", "jacket",
      "activewear", "swimwear", "uniform", "scarf", "hat",
    ],
  },
  {
    productCategory: "watch_eyewear",
    legacySkillId: "watch-eyewear-reference-storyboard",
    signals: [
      "นาฬิกา", "แว่นตา", "แว่นกันแดด", "กรอบแว่น", "สายรัดนาฬิกา", "smart watch",
      "watch", "watches", "sunglasses", "eyewear", "glasses", "watch strap",
    ],
  },
  {
    productCategory: "jewelry",
    legacySkillId: "jewelry-reference-storyboard",
    signals: [
      "เครื่องประดับ", "แหวน", "สร้อย", "ต่างหู", "กำไล", "จี้", "ลูกปัด", "jewelry",
      "ring", "necklace", "pendant", "earrings", "bracelet", "bangle", "charm",
    ],
  },
  {
    productCategory: "sports_equipment",
    legacySkillId: "sports-equipment-reference-storyboard",
    signals: [
      "อุปกรณ์กีฬา", "ฟิตเนส", "ดัมเบล", "โยคะ", "ลูกบอล", "แร็กเก็ต", "ไม้แบด",
      "sports equipment", "fitness", "dumbbell", "yoga", "ball", "racket", "gloves",
      "resistance band", "helmet", "training",
    ],
  },
  {
    productCategory: "books",
    legacySkillId: "books-reference-storyboard",
    signals: [
      "หนังสือ", "นิยาย", "มังงะ", "การ์ตูน", "ตำรา", "แบบฝึกหัด", "นิตยสาร",
      "book", "textbook", "novel", "comic", "manga", "children book", "workbook",
      "magazine", "manual",
    ],
  },
  {
    productCategory: "stationery",
    legacySkillId: "stationery-reference-storyboard",
    signals: [
      "เครื่องเขียน", "ปากกา", "ดินสอ", "สมุด", "แฟ้ม", "กระดาษ", "ยางลบ", "ไม้บรรทัด",
      "เทป", "คลิป", "stationery", "pen", "pencil", "marker", "notebook", "planner",
      "paper", "sticky note", "folder", "binder", "eraser", "ruler", "desk organizer",
    ],
  },
  {
    productCategory: "household_product",
    legacySkillId: "household-product-reference-storyboard",
    signals: [
      "เครื่องใช้ในบ้าน", "ของใช้ในบ้าน", "อุปกรณ์ทำความสะอาด", "ที่เก็บของ", "กล่องเก็บของ",
      "เครื่องครัว", "ห้องน้ำ", "ซักผ้า", "ไม้ถูพื้น", "household", "home goods",
      "cleaning tool", "organizer", "storage container", "kitchenware", "bathroom",
      "laundry", "mop", "bedding",
    ],
  },
  {
    productCategory: "cosmetics",
    legacySkillId: "cosmatic-reference-storyboard",
    signals: [
      "คอสเมติก", "เครื่องสำอาง", "บิวตี้", "สกินแคร์", "เซรั่ม", "ครีม", "ลิป",
      "รองพื้น", "beauty", "cosmetic", "cosmetics", "makeup", "skincare", "skin care",
      "serum", "cream", "lipstick", "foundation",
    ],
  },
  {
    productCategory: "furniture",
    legacySkillId: "furniture-reference-storyboard",
    signals: [
      "เฟอร์นิเจอร์", "โต๊ะ", "เก้าอี้", "ชั้นวาง", "ตู้", "โซฟา", "เตียง", "โต๊ะข้างเตียง",
      "โต๊ะวางของ", "ตู้เสื้อผ้า", "ลิ้นชัก", "สตูล", "furniture", "table", "chair",
      "shelf", "shelves", "rack", "cabinet", "sofa", "bed", "desk", "nightstand",
      "bedside table", "drawer", "wardrobe", "stool",
    ],
  },
];

export const PRODUCTION_REFERENCE_STORYBOARD_SKILL_IDS = [
  PRODUCTION_REFERENCE_STORYBOARD_SKILL_ID,
] as const;

export const PRODUCTION_REFERENCE_STORYBOARD_LEGACY_SKILL_IDS = PRODUCTION_REFERENCE_STORYBOARD_SKILL_RULES.map(
  (rule) => rule.legacySkillId,
);

export function isProductionReferenceStoryboardProductCategory(
  value: unknown,
): value is ProductionReferenceStoryboardProductCategory {
  return typeof value === "string"
    && (PRODUCTION_REFERENCE_STORYBOARD_PRODUCT_CATEGORIES as readonly string[]).includes(value);
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreSignalMatch(searchableText: string, signal: string): number {
  const normalizedSignal = normalizeSearchText(signal);
  if (!normalizedSignal || !searchableText.includes(normalizedSignal)) return 0;
  return normalizedSignal.length >= 12 ? 3 : normalizedSignal.includes(" ") ? 2 : 1;
}

export function detectProductionReferenceStoryboardProductCategoryFromText(
  text: string,
  fallbackProductCategory: ProductionReferenceStoryboardProductCategory = PRODUCTION_REFERENCE_STORYBOARD_FALLBACK_PRODUCT_CATEGORY,
): ProductionReferenceStoryboardProductCategory {
  const searchableText = normalizeSearchText(text);
  if (!searchableText) return fallbackProductCategory;

  let bestProductCategory: ProductionReferenceStoryboardProductCategory = fallbackProductCategory;
  let bestScore = 0;

  for (const rule of PRODUCTION_REFERENCE_STORYBOARD_SKILL_RULES) {
    const score = rule.signals.reduce((sum, signal) => sum + scoreSignalMatch(searchableText, signal), 0);
    if (score > bestScore) {
      bestScore = score;
      bestProductCategory = rule.productCategory;
    }
  }

  return bestProductCategory;
}

export function detectProductionReferenceStoryboardSkillIdFromText(
  text: string,
  fallbackSkillId = PRODUCTION_REFERENCE_STORYBOARD_FALLBACK_SKILL_ID,
): string {
  return normalizeSearchText(text) ? PRODUCTION_REFERENCE_STORYBOARD_SKILL_ID : fallbackSkillId;
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanMultilineText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasText(value: unknown): value is string {
  return cleanText(value).length > 0;
}

function isShotByShotStoryboardGuideText(value: unknown): boolean {
  return /(?:แนวคิดวิดีโอแบบ\s*Shot-by-shot|Shot-by-shot video concept)\s*:/i.test(String(value ?? ""));
}

export function buildProductionReferenceStoryboardConceptDetails(input: {
  concept?: ProductionReferenceStoryboardConcept | null;
  fallbackConceptDetails?: string | null;
}): string {
  const concept = input.concept ?? null;
  const productFacts = cleanText(concept?.productFacts);
  const conceptDetails = cleanText(input.fallbackConceptDetails || concept?.conceptDetails);
  const structuredContext = [
    concept?.title ? `Concept: ${cleanText(concept.title)}` : "",
    concept?.angle ? `Angle: ${cleanText(concept.angle)}` : "",
    concept?.audience ? `Audience: ${cleanText(concept.audience)}` : "",
    concept?.painPoint ? `Problem: ${cleanText(concept.painPoint)}` : "",
    concept?.hook ? `Hook: ${cleanText(concept.hook)}` : "",
    concept?.useCase ? `Use case: ${cleanText(concept.useCase)}` : "",
    concept?.sellingPoints?.length ? `Selling points: ${concept.sellingPoints.map(cleanText).filter(Boolean).join(" / ")}` : "",
    concept?.objectionsTrust?.length ? `Proof/trust: ${concept.objectionsTrust.map(cleanText).filter(Boolean).join(" / ")}` : "",
  ].filter(Boolean).join("\n");

  return [
    productFacts,
    conceptDetails || structuredContext,
  ].filter(hasText).join("\n\n");
}

export function buildProductionReferenceStoryboardGuide(input: {
  projectTitle?: string | null;
  projectSummary?: string | null;
  concept?: ProductionReferenceStoryboardConcept | null;
  fallbackConceptDetails?: string | null;
  locale?: "th" | "en";
}): string {
  const concept = input.concept ?? null;
  const timeline = Array.isArray(concept?.sceneTimeline) ? concept.sceneTimeline : [];
  const sceneLines = timeline
    .map((scene) => {
      const timeRange = cleanText(scene.timeRange);
      const title = cleanText(scene.title);
      const detail = cleanText(scene.detail);
      return [timeRange, title, detail].filter(Boolean).join(" - ");
    })
    .filter(Boolean);
  const rawConceptDetails = cleanMultilineText(input.fallbackConceptDetails || concept?.conceptDetails);
  if (isShotByShotStoryboardGuideText(rawConceptDetails)) return rawConceptDetails;
  const conceptDetails = cleanText(rawConceptDetails);

  return [
    input.projectTitle ? `PROJECT: ${cleanText(input.projectTitle)}` : "",
    input.projectSummary ? `STORY GOAL: ${cleanText(input.projectSummary)}` : "",
    concept?.title ? `SELECTED CONCEPT: ${cleanText(concept.title)}` : "",
    concept?.hook ? `OPENING HOOK: ${cleanText(concept.hook)}` : "",
    concept?.painPoint ? `CUSTOMER PROBLEM: ${cleanText(concept.painPoint)}` : "",
    conceptDetails ? `CUSTOMER JOURNEY / STORY INTENT: ${conceptDetails}` : "",
    sceneLines.length ? `STORY BEATS:\n${sceneLines.map((line, index) => `${index + 1}. ${line}`).join("\n")}` : "",
    concept?.useCase ? `REAL USE CONTEXT: ${cleanText(concept.useCase)}` : "",
    sceneLines.length
      ? "FRAME ALLOCATION POLICY: If STORY BEATS are numbered/timed and match the requested frame count, map one beat to one frame in order. For a 3x3/9-frame storyboard, keep Frame 1 through Frame 9 aligned with beats 1 through 9 when nine beats are supplied. If fewer or more beats are supplied, follow the selected storyboard_layout_preset, aspect_ratio, and required_frame_count while preserving the same story sequence and spoken meaning."
      : "",
    input.locale === "th"
      ? "สร้าง storyboard ที่เล่าการใช้งานจริงของสินค้าให้ต่างจากแค่การแปะ description; ให้แต่ละเฟรมมีหน้าที่ชัดเจนใน journey."
      : "Create a storyboard that shows the product in real use, not pasted product description; each frame needs a distinct customer-journey role.",
  ].filter(hasText).join("\n");
}

export function buildProductionReferenceStoryboardVoiceoverScript(input: {
  concept?: ProductionReferenceStoryboardConcept | null;
  fallbackVoiceoverScript?: string | null;
}): string {
  const concept = input.concept ?? null;
  const beats = Array.isArray(concept?.voiceoverBeats)
    ? concept.voiceoverBeats
      .slice()
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map((beat, index) => {
        const order = cleanText(beat.order) || String(index + 1);
        const startSec = cleanText(beat.startSec);
        const endSec = cleanText(beat.endSec);
        const timing = startSec && endSec ? `${startSec}-${endSec}s` : "";
        const title = cleanText(beat.title);
        const script = cleanMultilineText(beat.voiceoverScript || beat.script);
        if (!script) return "";
        const prefix = [order ? `${order}.` : "", timing, title].filter(Boolean).join(" ");
        return `${prefix}: ${script}`;
      })
      .filter(Boolean)
    : [];

  if (beats.length) {
    return [
      "VOICEOVER SCRIPT BY SHOT:",
      ...beats,
      "Use these spoken lines as the dialogue/narration contract for the matching Storyboard Guide shots. Do not invent a different spoken story.",
    ].join("\n");
  }

  const fallback = cleanMultilineText(input.fallbackVoiceoverScript);
  return fallback ? `VOICEOVER SCRIPT:\n${fallback}` : "";
}
