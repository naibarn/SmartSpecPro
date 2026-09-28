/**
 * Debug: exercise the product-video-motion-prompt skill end-to-end with a real
 * LLM call, real product images, and a real user motion direction.
 *
 * Usage (from apps/web):
 *   npx tsx -r dotenv/config scripts/debug-product-video-motion-prompt.ts
 */
import { runProductVideoMotionPromptSkill } from "../server/services/productVideoMotionPromptSkillRunner";

const MOTION_DIRECTION =
  "นางแบบหยิบขวดแชมพูขึ้นมา กดหัวปั๊มให้แชมพูไหลลงบนฝ่ามือ นำมาชะโลมบนศีรษะ เกิดฟองนุ่มทั่วเส้นผม แล้วปิดท้ายด้วยการโชว์สินค้าให้เห็นชัดเจน";

const BASE = "https://smartaihub.app";
const REFERENCE_IMAGES = [
  `${BASE}/api/storage/files/marketplace-captures/cap_c44cc6c2a21e452f522afd8fa27d6d46/images/product_review_01_asset_814125b5c00f5f0ec0e107d1e875214b.webp`,
  `${BASE}/api/storage/files/marketplace-captures/cap_c44cc6c2a21e452f522afd8fa27d6d46/images/product_review_02_asset_868e81de9c8a2e3fc7c2b28e1923fee4.webp`,
];

const SHOTS = [
  {
    shotOrder: 2,
    shotCount: 9,
    isLastShot: false,
    shotTitle: "หยิบขวดและกดปั๊มแชมพู",
    shotVisual:
      "Close-up of a Thai female model in a bright bathroom picking up the mamoon herbal shampoo bottle beside the sink",
    shotMovement: "Subtle product-focused motion",
    voiceoverExcerpt: "แชมพูสมุนไพรเร่งผมยาว อ่อนโยนไม่มีซิลิโคน",
  },
  {
    shotOrder: 9,
    shotCount: 9,
    isLastShot: true,
    shotTitle: "ปิดท้ายโชว์สินค้า",
    shotVisual:
      "The model smiles with soft shiny hair and presents the mamoon shampoo bottle toward camera, label clearly readable",
    shotMovement: "Subtle product-focused motion",
    voiceoverExcerpt: "mamoon แชมพูสมุนไพร ผมนุ่ม ยาวไว มั่นใจทุกวัน",
  },
];

async function main() {
  for (const shot of SHOTS) {
    const startedAt = Date.now();
    const result = await runProductVideoMotionPromptSkill({
      tenantId: "tenant-ZCSKEM9s",
      userId: 1,
      facts: {
        productName:
          "แชมพูสมุนไพรเร่งผมยาว mamoon ปราศจากซิลิโคน มะพร้าว บํารุงผม รังแค",
        productBrand: "mamoon",
        productCategory: "herbal shampoo / hair care",
        productFacts:
          "Herbal shampoo, silicone-free, coconut ingredient, anti-dandruff, pump bottle",
        aspectRatio: "9:16",
        durationSeconds: 5,
        motionDirection: MOTION_DIRECTION,
        ...shot,
      },
      referenceImages: REFERENCE_IMAGES,
      runId: "debug-motion-skill-test",
      unitId: `debug-shot-${shot.shotOrder}`,
      attempt: 1,
    });
    console.log(
      `\n===== SHOT ${shot.shotOrder}/${shot.shotCount} (${shot.shotTitle}) — ${
        Date.now() - startedAt
      }ms =====`
    );
    console.log(`model: ${result.modelId} (${result.providerName})`);
    console.log(
      `visionFallback: ${result.visionFallback} | attempts: ${JSON.stringify(
        result.visionModelAttempts
      )}`
    );
    console.log(
      `tokens: ${result.usage.promptTokens}+${result.usage.completionTokens} | credits: ${result.creditsUsed}`
    );
    console.log(`----- PROMPT (${result.prompt.length} chars) -----`);
    console.log(result.prompt);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("debug run failed:", error);
    process.exit(1);
  });
