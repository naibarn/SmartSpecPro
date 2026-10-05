export const PUBLIC_HOME_SEO = {
  en: {
    title: "SmartAIHub | From idea to your next creation",
    h1: "Turn one idea into work you can keep building",
    description:
      "Start with the work you want to do and explore SmartAIHub spaces for chat, media creation, and vertical series.",
    keywords: [
      "SmartAIHub",
      "AI creation tools",
      "media creation",
      "vertical series",
      "chat",
    ],
  },
  th: {
    title: "SmartAIHub | จากไอเดียสู่ผลงานชิ้นต่อไป",
    h1: "เปลี่ยนไอเดียให้เป็นผลงานที่ต่อยอดได้",
    description:
      "เริ่มจากงานที่อยากทำ แล้วสำรวจพื้นที่ทำงานของ SmartAIHub สำหรับแชต สร้างสื่อ และซีรีส์แนวตั้ง",
    keywords: [
      "SmartAIHub",
      "เครื่องมือสร้างสรรค์ด้วย AI",
      "สร้างสื่อ",
      "ซีรีส์แนวตั้ง",
      "แชต",
    ],
  },
} as const;

export function getPublicHomeSeo(language?: string) {
  return language?.toLowerCase().startsWith("th")
    ? PUBLIC_HOME_SEO.th
    : PUBLIC_HOME_SEO.en;
}
