export type ProductionReferenceStoryboardScene = {
  timeRange?: string | null;
  title?: string | null;
  detail?: string | null;
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
};

export const PRODUCTION_REFERENCE_STORYBOARD_FALLBACK_SKILL_ID = "furniture-reference-storyboard";

type ProductionReferenceStoryboardSkillRule = {
  skillId: string;
  signals: string[];
};

const PRODUCTION_REFERENCE_STORYBOARD_SKILL_RULES: ProductionReferenceStoryboardSkillRule[] = [
  {
    skillId: "mother-baby-reference-storyboard",
    signals: [
      "แม่และเด็ก", "สินค้าแม่และเด็ก", "เด็กอ่อน", "ทารก", "เด็ก 6 เดือน", "หัดนั่ง",
      "เก้าอี้กินข้าวเด็ก", "เก้าอี้ทานข้าวเด็ก", "เก้าอี้เด็ก", "รถเข็นเด็ก", "ขวดนม",
      "ผ้าอ้อม", "จุกนม", "baby", "infant", "toddler", "stroller", "baby chair",
      "baby seat", "high chair", "feeding chair", "diaper", "pacifier", "baby bottle",
    ],
  },
  {
    skillId: "mobile-tablet-reference-storyboard",
    signals: [
      "มือถือ", "สมาร์ทโฟน", "โทรศัพท์", "แท็บเล็ต", "เคสมือถือ", "ฟิล์มกันรอย",
      "smartphone", "mobile phone", "tablet", "ipad", "phone case", "screen protector",
      "stylus", "foldable phone",
    ],
  },
  {
    skillId: "computer-laptop-reference-storyboard",
    signals: [
      "คอมพิวเตอร์", "แล็ปท็อป", "โน้ตบุ๊ก", "โน๊ตบุ๊ค", "จอคอม", "คีย์บอร์ด", "เมาส์",
      "laptop", "notebook computer", "desktop computer", "monitor", "keyboard", "mouse",
      "pc case", "mini pc", "docking station",
    ],
  },
  {
    skillId: "camera-photography-reference-storyboard",
    signals: [
      "กล้อง", "เลนส์", "ขาตั้งกล้อง", "กิมบอล", "แฟลช", "ไฟถ่ายภาพ", "กระเป๋ากล้อง",
      "camera", "lens", "tripod", "gimbal", "flash", "action camera", "instant camera",
      "camera bag", "photography",
    ],
  },
  {
    skillId: "gaming-accessories-reference-storyboard",
    signals: [
      "เกม", "เกมส์", "เกมมิ่ง", "จอยเกม", "คอนโทรลเลอร์", "เครื่องเกม", "แผ่นเกม",
      "gaming", "game console", "controller", "gamepad", "gaming headset", "mousepad",
      "charging dock",
    ],
  },
  {
    skillId: "electrical-appliance-reference-storyboard",
    signals: [
      "เครื่องใช้ไฟฟ้า", "ตู้เย็น", "เครื่องซักผ้า", "ไมโครเวฟ", "หม้อทอด", "เครื่องปั่น",
      "พัดลม", "เครื่องฟอกอากาศ", "กาต้มน้ำ", "หม้อหุงข้าว", "เตารีด", "เครื่องดูดฝุ่น",
      "appliance", "refrigerator", "washing machine", "microwave", "air fryer", "blender",
      "fan", "air purifier", "kettle", "rice cooker", "iron", "vacuum cleaner",
    ],
  },
  {
    skillId: "electronics-reference-storyboard",
    signals: [
      "อุปกรณ์อิเล็กทรอนิกส์", "หูฟัง", "ลำโพง", "เราเตอร์", "สมาร์ทโฮม", "สายชาร์จ",
      "พาวเวอร์แบงค์", "ไมโครโฟน", "รีโมต", "เซนเซอร์", "earbuds", "headphones",
      "speaker", "router", "smart home", "charger", "power bank", "cable", "adapter",
      "hub", "microphone", "remote", "sensor", "gadget",
    ],
  },
  {
    skillId: "automotive-reference-storyboard",
    signals: [
      "ยานยนต์", "รถยนต์", "มอเตอร์ไซค์", "หมวกกันน็อค", "กล้องติดรถ", "ยางรถ",
      "น้ำมันเครื่อง", "car accessory", "automotive", "motorcycle", "helmet", "dash cam",
      "car mount", "tire", "engine oil", "vehicle",
    ],
  },
  {
    skillId: "food-beverage-reference-storyboard",
    signals: [
      "อาหาร", "เครื่องดื่ม", "ขนม", "ซอส", "กาแฟ", "ชา", "น้ำดื่ม", "ผงชงดื่ม",
      "food", "beverage", "snack", "sauce", "coffee", "tea", "drink", "powdered drink",
      "ready meal", "ingredient",
    ],
  },
  {
    skillId: "pet-supplies-reference-storyboard",
    signals: [
      "สัตว์เลี้ยง", "อาหารสัตว์", "ของใช้สัตว์", "ปลอกคอ", "สายจูง", "ทรายแมว",
      "pet", "pet food", "pet supplies", "collar", "leash", "harness", "litter",
      "grooming", "aquarium",
    ],
  },
  {
    skillId: "shoes-reference-storyboard",
    signals: [
      "รองเท้า", "สนีกเกอร์", "รองเท้าวิ่ง", "รองเท้าแตะ", "บูท", "ส้นสูง", "loafers",
      "sneakers", "running shoes", "sandals", "slippers", "boots", "heels", "footwear",
    ],
  },
  {
    skillId: "fashion-clothing-reference-storyboard",
    signals: [
      "เสื้อผ้า", "แฟชั่น", "เดรส", "กางเกง", "กระโปรง", "แจ็คเก็ต", "ชุดว่ายน้ำ",
      "เสื้อเชิ้ต", "clothing", "fashion", "shirt", "dress", "pants", "skirt", "jacket",
      "activewear", "swimwear", "uniform", "scarf", "hat",
    ],
  },
  {
    skillId: "watch-eyewear-reference-storyboard",
    signals: [
      "นาฬิกา", "แว่นตา", "แว่นกันแดด", "กรอบแว่น", "สายรัดนาฬิกา", "smart watch",
      "watch", "watches", "sunglasses", "eyewear", "glasses", "watch strap",
    ],
  },
  {
    skillId: "jewelry-reference-storyboard",
    signals: [
      "เครื่องประดับ", "แหวน", "สร้อย", "ต่างหู", "กำไล", "จี้", "ลูกปัด", "jewelry",
      "ring", "necklace", "pendant", "earrings", "bracelet", "bangle", "charm",
    ],
  },
  {
    skillId: "sports-equipment-reference-storyboard",
    signals: [
      "อุปกรณ์กีฬา", "ฟิตเนส", "ดัมเบล", "โยคะ", "ลูกบอล", "แร็กเก็ต", "ไม้แบด",
      "sports equipment", "fitness", "dumbbell", "yoga", "ball", "racket", "gloves",
      "resistance band", "helmet", "training",
    ],
  },
  {
    skillId: "books-reference-storyboard",
    signals: [
      "หนังสือ", "นิยาย", "มังงะ", "การ์ตูน", "ตำรา", "แบบฝึกหัด", "นิตยสาร",
      "book", "textbook", "novel", "comic", "manga", "children book", "workbook",
      "magazine", "manual",
    ],
  },
  {
    skillId: "stationery-reference-storyboard",
    signals: [
      "เครื่องเขียน", "ปากกา", "ดินสอ", "สมุด", "แฟ้ม", "กระดาษ", "ยางลบ", "ไม้บรรทัด",
      "เทป", "คลิป", "stationery", "pen", "pencil", "marker", "notebook", "planner",
      "paper", "sticky note", "folder", "binder", "eraser", "ruler", "desk organizer",
    ],
  },
  {
    skillId: "household-product-reference-storyboard",
    signals: [
      "เครื่องใช้ในบ้าน", "ของใช้ในบ้าน", "อุปกรณ์ทำความสะอาด", "ที่เก็บของ", "กล่องเก็บของ",
      "เครื่องครัว", "ห้องน้ำ", "ซักผ้า", "ไม้ถูพื้น", "household", "home goods",
      "cleaning tool", "organizer", "storage container", "kitchenware", "bathroom",
      "laundry", "mop", "bedding",
    ],
  },
  {
    skillId: "cosmatic-reference-storyboard",
    signals: [
      "คอสเมติก", "เครื่องสำอาง", "บิวตี้", "สกินแคร์", "เซรั่ม", "ครีม", "ลิป",
      "รองพื้น", "beauty", "cosmetic", "cosmetics", "makeup", "skincare", "skin care",
      "serum", "cream", "lipstick", "foundation",
    ],
  },
  {
    skillId: "furniture-reference-storyboard",
    signals: [
      "เฟอร์นิเจอร์", "โต๊ะ", "เก้าอี้", "ชั้นวาง", "ตู้", "โซฟา", "เตียง", "โต๊ะข้างเตียง",
      "โต๊ะวางของ", "ตู้เสื้อผ้า", "ลิ้นชัก", "สตูล", "furniture", "table", "chair",
      "shelf", "shelves", "rack", "cabinet", "sofa", "bed", "desk", "nightstand",
      "bedside table", "drawer", "wardrobe", "stool",
    ],
  },
];

export const PRODUCTION_REFERENCE_STORYBOARD_SKILL_IDS = PRODUCTION_REFERENCE_STORYBOARD_SKILL_RULES.map(
  (rule) => rule.skillId,
);

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreSignalMatch(searchableText: string, signal: string): number {
  const normalizedSignal = normalizeSearchText(signal);
  if (!normalizedSignal || !searchableText.includes(normalizedSignal)) return 0;
  return normalizedSignal.length >= 12 ? 3 : normalizedSignal.includes(" ") ? 2 : 1;
}

export function detectProductionReferenceStoryboardSkillIdFromText(
  text: string,
  fallbackSkillId = PRODUCTION_REFERENCE_STORYBOARD_FALLBACK_SKILL_ID,
): string {
  const searchableText = normalizeSearchText(text);
  if (!searchableText) return fallbackSkillId;

  let bestSkillId = fallbackSkillId;
  let bestScore = 0;

  for (const rule of PRODUCTION_REFERENCE_STORYBOARD_SKILL_RULES) {
    const score = rule.signals.reduce((sum, signal) => sum + scoreSignalMatch(searchableText, signal), 0);
    if (score > bestScore) {
      bestScore = score;
      bestSkillId = rule.skillId;
    }
  }

  return bestSkillId;
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function hasText(value: unknown): value is string {
  return cleanText(value).length > 0;
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
  const conceptDetails = cleanText(input.fallbackConceptDetails || concept?.conceptDetails);

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
      ? "FRAME ALLOCATION POLICY: Treat story beats as narrative stages, not a fixed scene/frame count. Follow the selected storyboard_layout_preset, aspect_ratio, and required_frame_count at execution time. For 3x3, expand the beats across all 9 frames with transitions, close-ups, proof details, and final end frame. For 3x2 or 2x3, condense the same arc into 6 frames. Layout/frame count wins if it conflicts with beat count."
      : "",
    input.locale === "th"
      ? "สร้าง storyboard ที่เล่าการใช้งานจริงของสินค้าให้ต่างจากแค่การแปะ description; ให้แต่ละเฟรมมีหน้าที่ชัดเจนใน journey."
      : "Create a storyboard that shows the product in real use, not pasted product description; each frame needs a distinct customer-journey role.",
  ].filter(hasText).join("\n");
}

export function buildProductionReferenceStoryboardSceneDescriptions(input: {
  productFacts?: string | null;
  storyboardGuide?: string | null;
  concept?: ProductionReferenceStoryboardConcept | null;
}): string[] {
  const concept = input.concept ?? null;
  const hasTimeline = Array.isArray(concept?.sceneTimeline) && concept.sceneTimeline.length > 0;

  return [
    cleanText(input.productFacts || concept?.productFacts),
    hasTimeline || cleanText(input.storyboardGuide)
      ? "LAYOUT-ADAPTIVE OUTPUT: Do not treat Scene Descriptions item count as the output frame or shot count. Use storyboard_layout_preset and required_frame_count to decide the number of panels, then distribute the Storyboard Guide beats across that layout while preserving the product facts lock."
      : "",
  ].filter(hasText);
}
