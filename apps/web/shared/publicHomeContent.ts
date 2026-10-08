export const PUBLIC_HOME_SEO = {
  en: {
    title: "SmartAIHub | One AI workspace to move ideas forward",
    h1: "One AI workspace to move your idea forward",
    description:
      "Start with the work you want to do, then explore SmartAIHub spaces for chat, media creation, and vertical series.",
    keywords: [
      "SmartAIHub",
      "AI creation tools",
      "media creation",
      "vertical series",
      "chat",
    ],
  },
  th: {
    title: "SmartAIHub | พื้นที่ทำงาน AI สำหรับไอเดียที่ไปต่อได้",
    h1: "พื้นที่ทำงาน AI เดียว ที่พาไอเดียไปต่อได้",
    description:
      "เริ่มจากงานที่อยากทำ แล้วสำรวจพื้นที่ทำงาน SmartAIHub สำหรับแชต สร้างสื่อ และซีรีส์แนวตั้ง",
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
