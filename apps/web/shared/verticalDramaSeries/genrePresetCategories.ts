/**
 * Vertical Drama Series — genre preset category display labels.
 *
 * Maps the stable category slug stored in `vertical_drama_genre_presets.category`
 * to bilingual (Thai/English) display names for the Create-Series wizard and any
 * other surface that lists preset categories. Slugs are the source of truth in
 * the DB; labels here are presentation-only. Unknown slugs (e.g. user-created
 * private preset categories) fall back to the raw slug via
 * `genrePresetCategoryLabel()`.
 */

export interface GenrePresetCategoryLabel {
  th: string;
  en: string;
}

export const GENRE_PRESET_CATEGORY_LABELS: Record<string, GenrePresetCategoryLabel> = {
  // --- Original melodrama / romance set -----------------------------------
  "revenge-reborn": { th: "ย้อนเวลาทวงแค้น", en: "Revenge Reborn" },
  "hidden-heir": { th: "ทายาทลับ", en: "Hidden Heir" },
  "family-feud-inheritance": { th: "ศึกชิงมรดกตระกูล", en: "Family Feud & Inheritance" },
  "arranged-marriage-enemies": { th: "คลุมถุงชนศัตรูหัวใจ", en: "Arranged Marriage Enemies" },
  "cross-class-cinderella": { th: "รักข้ามชนชั้น", en: "Cross-Class Cinderella" },
  "secret-baby-return": { th: "ลูกลับกลับคืนตระกูล", en: "Secret Baby Return" },
  "twin-swap-identity": { th: "แฝดสลับตัวตน", en: "Twin Swap Identity" },
  "memory-loss-revenge": { th: "ความจำเสื่อมทวงแค้น", en: "Memory-Loss Revenge" },
  "evil-stepmother-inheritance": { th: "แม่เลี้ยงร้ายชิงมรดก", en: "Evil Stepmother Inheritance" },
  "adopted-child-revenge": { th: "ลูกบุญธรรมทวงคืนศักดิ์ศรี", en: "Adopted Child's Revenge" },
  "fake-marriage-contract": { th: "สัญญาแต่งงานปลอม", en: "Fake Marriage Contract" },
  "disowned-heir-comeback": { th: "ทายาทถูกตัดขาดคัมแบ็ก", en: "Disowned Heir Comeback" },
  "ceo-office-romance": { th: "รักซีอีโอในออฟฟิศ", en: "CEO Office Romance" },
  "bodyguard-romance": { th: "รักบอดี้การ์ด", en: "Bodyguard Romance" },
  "fake-dating-contract": { th: "สัญญาเดตปลอม", en: "Fake Dating Contract" },
  "idol-trainee-rivalry": { th: "ศึกเด็กฝึกไอดอล", en: "Idol Trainee Rivalry" },
  "celebrity-secret-identity": { th: "ตัวตนลับคนดัง", en: "Celebrity Secret Identity" },
  "second-chance-love": { th: "รักครั้งที่สอง", en: "Second-Chance Love" },
  "workplace-rivals-to-lovers": { th: "คู่แข่งกลายเป็นคู่รัก", en: "Workplace Rivals to Lovers" },
  "chef-restaurant-romance": { th: "รักในครัวเชฟ", en: "Chef & Restaurant Romance" },
  "sports-underdog-love": { th: "รักนักกีฬาม้ามืด", en: "Sports Underdog Love" },
  "music-producer-romance": { th: "รักโปรดิวเซอร์เพลง", en: "Music Producer Romance" },
  "wedding-planner-romance": { th: "รักเวดดิ้งแพลนเนอร์", en: "Wedding Planner Romance" },
  "matchmaking-agency-romance": { th: "รักบริษัทจัดหาคู่", en: "Matchmaking Agency Romance" },
  "rebirth-transmigration": { th: "เกิดใหม่ทะลุมิติ", en: "Rebirth & Transmigration" },
  "time-loop-mystery": { th: "ปริศนาวนเวลา", en: "Time-Loop Mystery" },
  "supernatural-ghost-romance": { th: "รักเหนือธรรมชาติ", en: "Supernatural Ghost Romance" },
  "mafia-underworld-romance": { th: "รักเจ้าพ่อมาเฟีย", en: "Mafia Underworld Romance" },
  "royal-palace-intrigue": { th: "เกมบัลลังก์ในวัง", en: "Royal Palace Intrigue" },
  "medical-drama-rescue": { th: "ดราม่าการแพทย์กู้ชีพ", en: "Medical Rescue Drama" },
  "incognito-billionaire": { th: "มหาเศรษฐีปลอมตัว", en: "Incognito Billionaire" },
  "small-town-vs-city-ambition": { th: "บ้านนอกสู้เมืองใหญ่", en: "Small Town vs. City Ambition" },
  "historical-costume-revenge": { th: "แค้นย้อนยุคพีเรียด", en: "Historical Costume Revenge" },
  "sci-fi-dystopian-teen": { th: "วัยรุ่นโลกดิสโทเปีย", en: "Sci-Fi Dystopian Teen" },
  "amnesia-mystery-thriller": { th: "ปริศนาความจำหาย", en: "Amnesia Mystery Thriller" },
  "doppelganger-conspiracy": { th: "แผนลับคนหน้าเหมือน", en: "Doppelgänger Conspiracy" },

  // --- Drama / Thriller -----------------------------------------------------
  "prestige-crime-thriller": { th: "อาชญากรรมสืบสวนพรีเมียม", en: "Prestige Crime Thriller" },
  "korean-thriller-drama": { th: "ธริลเลอร์สไตล์เกาหลี", en: "Korean-Style Thriller Drama" },
  "dark-academia-school-mystery": { th: "ปริศนาโรงเรียนดาร์กอคาเดเมีย", en: "Dark Academia School Mystery" },
  "elevated-teen-drama": { th: "ดราม่าวัยรุ่นเข้มข้น", en: "Elevated Teen Drama" },
  "grounded-emotional-drama": { th: "ดราม่าชีวิตสมจริง", en: "Grounded Emotional Drama" },
  "scripted-romance-drama": { th: "โรแมนติกดราม่าเนื้อแน่น", en: "Scripted Romance Drama" },

  // --- Commercial / Social ---------------------------------------------------
  "premium-commercial-cinematic": { th: "หนังโฆษณาซีเนมาติกพรีเมียม", en: "Premium Commercial Cinematic" },
  "social-short-form-cinematic": { th: "หนังสั้นโซเชียลจังหวะไว", en: "Social Short-Form Cinematic" },
  "family-commercial-lifestyle": { th: "ไลฟ์สไตล์ครอบครัวอบอุ่น", en: "Cozy Family Lifestyle" },

  // --- Kids / Family ---------------------------------------------------------
  "soft-cozy-kids": { th: "เด็กเล็กโทนนุ่มอบอุ่น", en: "Soft & Cozy Kids" },
  "playful-preschool-adventure": { th: "ผจญภัยวัยอนุบาลสดใส", en: "Playful Preschool Adventure" },
  "wonder-learning-kids": { th: "เด็กช่างสงสัยเรียนรู้โลก", en: "Wonder & Learning Kids" },
  "wholesome-magical-kids": { th: "เวทมนตร์ใสวัยเด็ก", en: "Wholesome Magical Kids" },

  // --- Science / Sci-Fi ------------------------------------------------------
  "clean-science-documentary": { th: "สารคดีวิทยาศาสตร์ภาพสะอาด", en: "Clean Science Documentary" },
  "near-future-science-lab": { th: "แล็บวิทยาศาสตร์อนาคตใกล้", en: "Near-Future Science Lab" },
  "high-concept-sci-fi-mystery": { th: "ไซไฟปริศนาไฮคอนเซปต์", en: "High-Concept Sci-Fi Mystery" },
  "space-exploration-wonder": { th: "สำรวจอวกาศสายอัศจรรย์", en: "Space Exploration Wonder" },
  "biotech-medical-future": { th: "การแพทย์ไบโอเทคอนาคต", en: "Biotech Medical Future" },
  "ai-research-cinematic": { th: "ทีมวิจัย AI ซีเนมาติก", en: "AI Research Cinematic" },
  "eco-science-field-research": { th: "วิจัยภาคสนามสิ่งแวดล้อม", en: "Eco-Science Field Research" },

  // --- Animation / Cartoon ---------------------------------------------------
  "modern-3d-animated-family": { th: "แอนิเมชัน 3D ครอบครัว", en: "Modern 3D Animated Family" },
  "soft-2d-storybook-animation": { th: "แอนิเมชัน 2D นิทานภาพ", en: "Soft 2D Storybook Animation" },
  "japanese-anime-drama": { th: "อนิเมะดราม่าญี่ปุ่น", en: "Japanese Anime Drama" },
  "chibi-comedy-cartoon": { th: "การ์ตูนจิบิคอมเมดี้", en: "Chibi Comedy Cartoon" },
  "stylized-action-anime": { th: "อนิเมะแอ็กชันสไตล์จัด", en: "Stylized Action Anime" },
  "western-cartoon-comedy": { th: "การ์ตูนคอมเมดี้ตะวันตก", en: "Western Cartoon Comedy" },
  "stop-motion-handmade": { th: "สต็อปโมชันงานมือ", en: "Handmade Stop Motion" },
  "soft-claymation-kids": { th: "เคลย์เมชันเด็กโทนนุ่ม", en: "Soft Claymation Kids" },
  "animated-comic-book": { th: "คอมิกบุ๊กเคลื่อนไหว", en: "Animated Comic Book" },
  "hybrid-2-5d-motion-graphic": { th: "โมชันกราฟิก 2.5D", en: "Hybrid 2.5D Motion Graphic" },
};

/**
 * Display label for a preset category slug in the given language.
 * Falls back to the raw slug for unknown categories (e.g. user-created presets).
 */
export function genrePresetCategoryLabel(slug: string, lang: "th" | "en"): string {
  const entry = GENRE_PRESET_CATEGORY_LABELS[slug];
  return entry ? entry[lang] : slug;
}
