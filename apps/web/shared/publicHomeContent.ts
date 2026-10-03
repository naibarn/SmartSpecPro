export const PUBLIC_HOME_SEO = {
  en: {
    title: "SmartAIHub | Product Information",
    h1: "Product information and resources",
    description:
      "Explore SmartAIHub product information, documentation, media tools, and support.",
    keywords: [
      "SmartAIHub",
      "product information",
      "documentation",
      "media tools",
      "support",
    ],
  },
  th: {
    title: "SmartAIHub | ข้อมูลผลิตภัณฑ์",
    h1: "ข้อมูลผลิตภัณฑ์และแหล่งข้อมูล",
    description:
      "สำรวจข้อมูลผลิตภัณฑ์ เอกสาร เครื่องมือสื่อ และช่องทางติดต่อของ SmartAIHub",
    keywords: [
      "SmartAIHub",
      "ข้อมูลผลิตภัณฑ์",
      "เอกสาร",
      "เครื่องมือสื่อ",
      "ติดต่อ",
    ],
  },
} as const;

export function getPublicHomeSeo(language?: string) {
  return language?.toLowerCase().startsWith("th")
    ? PUBLIC_HOME_SEO.th
    : PUBLIC_HOME_SEO.en;
}
