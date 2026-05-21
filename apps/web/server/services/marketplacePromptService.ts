export function buildMarketplaceExtractionPrompt(input: {
  platform: string;
  sourceUrl: string;
  domText: string;
  htmlBlocks: unknown;
  imageCandidates: unknown;
}) {
  return [
    "คุณคือระบบแยกข้อมูลสินค้า marketplace สำหรับ SmartSpecPro",
    "ตอบเป็น JSON เท่านั้น ห้ามมี markdown หรือคำอธิบายนอก JSON",
    "ห้ามเดาข้อมูลที่ไม่มีหลักฐาน ถ้าไม่พบให้ใช้ null หรือ []",
    "แยกรูป main product ออกจาก related/bundle/sidebar/recommended products",
    "ระบุ confidence 0-1 และ evidence source ต่อ field",
    `Platform: ${input.platform}`,
    `Source URL: ${input.sourceUrl}`,
    "",
    "DOM TEXT:",
    input.domText.slice(0, 60_000),
    "",
    "HTML BLOCKS:",
    JSON.stringify(input.htmlBlocks ?? []).slice(0, 20_000),
    "",
    "IMAGE CANDIDATES:",
    JSON.stringify(input.imageCandidates ?? []).slice(0, 20_000),
  ].join("\n");
}
