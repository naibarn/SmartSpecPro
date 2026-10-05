export const PUBLIC_HOME_SEO = {
  en: {
    title: "SmartAIHub | Create with AI",
    h1: "Start with the work you want to create",
    description:
      "Explore SmartAIHub tools for chat, media creation, and presentations, with guides and support when you need them.",
    keywords: [
      "SmartAIHub",
      "AI creation tools",
      "media creation",
      "presentations",
      "documentation",
      "support",
    ],
  },
  th: {
    title: "SmartAIHub | สร้างสรรค์ผลงานด้วย AI",
    h1: "เริ่มจากงานที่คุณอยากสร้าง",
    description:
      "สำรวจเครื่องมือของ SmartAIHub สำหรับแชต สร้างสื่อ และงานนำเสนอ พร้อมคู่มือและช่องทางช่วยเหลือ",
    keywords: [
      "SmartAIHub",
      "เครื่องมือ AI",
      "สร้างสื่อ",
      "งานนำเสนอ",
      "เอกสาร",
      "ติดต่อ",
    ],
  },
} as const;

export function getPublicHomeSeo(language?: string) {
  return language?.toLowerCase().startsWith("th")
    ? PUBLIC_HOME_SEO.th
    : PUBLIC_HOME_SEO.en;
}
