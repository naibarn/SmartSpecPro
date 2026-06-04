export const PRODUCT_REFERENCE_CATEGORY_OPTIONS = [
  { value: "auto", label: "Auto / ให้ระบบเดาหมวดสินค้า" },
  { value: "household_product", label: "เครื่องใช้ในบ้าน" },
  { value: "computer_laptop", label: "คอมพิวเตอร์และแล็ปท็อป" },
  { value: "electrical_appliance", label: "เครื่องใช้ไฟฟ้า" },
  { value: "food_beverage", label: "อาหารและเครื่องดื่ม" },
  { value: "electronics", label: "อุปกรณ์อิเล็กทรอนิกส์" },
  { value: "fashion_clothing", label: "เสื้อผ้าแฟชั่น" },
  { value: "shoes", label: "รองเท้า" },
  { value: "watch_eyewear", label: "นาฬิกาและแว่นตา" },
  { value: "mobile_tablet", label: "มือถือและแท็บเล็ต" },
  { value: "jewelry", label: "เครื่องประดับ" },
  { value: "mother_baby", label: "สินค้าแม่และเด็ก" },
  { value: "pet_supplies", label: "ของใช้และอาหารสัตว์" },
  { value: "sports_equipment", label: "อุปกรณ์กีฬา" },
  { value: "camera_photography", label: "กล้องและอุปกรณ์ถ่ายภาพ" },
  { value: "gaming_accessories", label: "เกมส์และอุปกรณ์เสริม" },
  { value: "automotive", label: "ยานยนต์" },
  { value: "stationery", label: "เครื่องเขียน" },
  { value: "books", label: "หนังสือ" },
  { value: "furniture", label: "เฟอร์นิเจอร์" },
  { value: "cosmetics", label: "เครื่องสำอางและสกินแคร์" },
] as const;

export type ProductReferenceCategory = (typeof PRODUCT_REFERENCE_CATEGORY_OPTIONS)[number]["value"];

export const PRODUCT_REFERENCE_CATEGORY_VALUES = PRODUCT_REFERENCE_CATEGORY_OPTIONS.map(
  (option) => option.value,
) as ProductReferenceCategory[];

const PRODUCT_REFERENCE_CATEGORY_SIGNALS: Array<{
  category: Exclude<ProductReferenceCategory, "auto">;
  signals: string[];
}> = [
  { category: "household_product", signals: ["ของใช้ในบ้าน", "เครื่องใช้ในบ้าน", "ทิชชู่", "ไม้ถูพื้น", "ถังขยะ", "กล่องเก็บของ", "household", "home storage", "cleaning"] },
  { category: "computer_laptop", signals: ["คอมพิวเตอร์", "แล็ปท็อป", "โน้ตบุ๊ก", "คีย์บอร์ด", "เมาส์", "จอคอม", "laptop", "notebook", "desktop", "keyboard", "mouse", "monitor"] },
  { category: "electrical_appliance", signals: ["เครื่องใช้ไฟฟ้า", "ตู้เย็น", "เครื่องซักผ้า", "ไมโครเวฟ", "หม้อทอด", "เครื่องฟอกอากาศ", "พัดลม", "appliance", "air fryer", "microwave", "refrigerator"] },
  { category: "food_beverage", signals: ["อาหาร", "เครื่องดื่ม", "ขนม", "กาแฟ", "ชา", "นม", "น้ำผลไม้", "food", "beverage", "snack", "coffee", "tea"] },
  { category: "electronics", signals: ["อิเล็กทรอนิกส์", "หูฟัง", "ลำโพง", "พาวเวอร์แบงค์", "สายชาร์จ", "อะแดปเตอร์", "gadget", "earbuds", "speaker", "power bank", "charger"] },
  { category: "fashion_clothing", signals: ["เสื้อ", "กางเกง", "เดรส", "กระโปรง", "แฟชั่น", "clothing", "shirt", "pants", "dress", "fashion"] },
  { category: "shoes", signals: ["รองเท้า", "sneaker", "sandals", "boots", "shoes"] },
  { category: "watch_eyewear", signals: ["นาฬิกา", "แว่น", "แว่นตา", "watch", "eyewear", "sunglasses", "glasses"] },
  { category: "mobile_tablet", signals: ["มือถือ", "โทรศัพท์", "สมาร์ทโฟน", "แท็บเล็ต", "เคสมือถือ", "ฟิล์มกันรอย", "smartphone", "mobile phone", "tablet", "phone case"] },
  { category: "jewelry", signals: ["เครื่องประดับ", "สร้อย", "แหวน", "ต่างหู", "กำไล", "jewelry", "necklace", "ring", "earrings", "bracelet"] },
  { category: "mother_baby", signals: ["แม่และเด็ก", "ทารก", "เด็กอ่อน", "ผ้าอ้อม", "ขวดนม", "รถเข็นเด็ก", "baby", "infant", "toddler", "diaper", "stroller"] },
  { category: "pet_supplies", signals: ["สัตว์เลี้ยง", "อาหารแมว", "อาหารสุนัข", "ทรายแมว", "pet", "cat", "dog", "pet food", "cat litter"] },
  { category: "sports_equipment", signals: ["กีฬา", "ฟิตเนส", "โยคะ", "ดัมเบล", "จักรยาน", "sports", "fitness", "yoga", "dumbbell", "bicycle"] },
  { category: "camera_photography", signals: ["กล้อง", "เลนส์", "ขาตั้งกล้อง", "กิมบอล", "ไฟถ่ายภาพ", "camera", "lens", "tripod", "gimbal", "photography"] },
  { category: "gaming_accessories", signals: ["เกม", "เกมส์", "เกมมิ่ง", "จอยเกม", "คอนโทรลเลอร์", "gaming", "game console", "controller", "gamepad"] },
  { category: "automotive", signals: ["รถยนต์", "มอเตอร์ไซค์", "ยางรถ", "น้ำมันเครื่อง", "หมวกกันน็อค", "automotive", "car", "motorcycle", "helmet"] },
  { category: "stationery", signals: ["เครื่องเขียน", "ปากกา", "ดินสอ", "สมุด", "กระดาษ", "stationery", "pen", "pencil", "notebook"] },
  { category: "books", signals: ["หนังสือ", "นิยาย", "ตำรา", "book", "novel", "textbook"] },
  { category: "furniture", signals: ["เฟอร์นิเจอร์", "โต๊ะ", "เก้าอี้", "โซฟา", "ตู้", "ชั้นวาง", "furniture", "chair", "table", "sofa", "cabinet", "shelf"] },
  { category: "cosmetics", signals: ["ความงามและของใช้ส่วนตัว", "ของใช้ส่วนตัว", "ดูแลช่องปาก", "ช่องปาก", "แปรงสีฟัน", "ยาสีฟัน", "น้ำยาบ้วนปาก", "เครื่องสำอาง", "สกินแคร์", "ลิปสติก", "ครีม", "เซรั่ม", "กันแดด", "oral care", "toothbrush", "toothpaste", "mouthwash", "cosmetics", "skincare", "lipstick", "serum", "sunscreen"] },
];

export function normalizeProductReferenceCategory(value: unknown): ProductReferenceCategory {
  return typeof value === "string" && PRODUCT_REFERENCE_CATEGORY_VALUES.includes(value as ProductReferenceCategory)
    ? value as ProductReferenceCategory
    : "auto";
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function inferProductReferenceCategory(input: {
  title?: string | null;
  categoryText?: string | null;
  categoryPath?: string[] | null;
  description?: string | null;
}): ProductReferenceCategory {
  const categoryPathText = normalizeSearchText((input.categoryPath ?? []).join(" "));
  const categoryText = normalizeSearchText([input.categoryText, categoryPathText].filter(Boolean).join(" "));
  const text = normalizeSearchText([
    input.title,
    input.categoryText,
    ...(input.categoryPath ?? []),
    input.description,
  ].filter(Boolean).join(" "));
  if (!text) return "auto";

  let best: ProductReferenceCategory = "auto";
  let bestScore = 0;
  for (const rule of PRODUCT_REFERENCE_CATEGORY_SIGNALS) {
    const score = rule.signals.reduce((sum, signal) => {
      const normalized = normalizeSearchText(signal);
      if (!normalized || !text.includes(normalized)) return sum;
      const baseScore = normalized.length >= 12 ? 3 : normalized.includes(" ") ? 2 : 1;
      const breadcrumbBoost = categoryPathText.includes(normalized) ? 4 : categoryText.includes(normalized) ? 2 : 0;
      return sum + baseScore + breadcrumbBoost;
    }, 0);
    if (score > bestScore) {
      best = rule.category;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : "auto";
}
