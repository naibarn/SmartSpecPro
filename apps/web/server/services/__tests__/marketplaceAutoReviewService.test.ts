import { describe, expect, it } from "vitest";

import {
  assertCompleteMarketplaceAutoReviewVideoClips,
  buildMarketplaceAutoReviewNativeSpeechText,
  buildMarketplaceAutoReviewVideoPromptForTest,
  resolveMarketplaceAutoReviewAudioStrategy,
} from "../marketplaceAutoReviewService";

const basePlan = {
  conceptId: "concept-1",
  title: "รีวิวสินค้า",
  productTruth: {
    productId: "mp_1",
    productName: "Greenforst โต๊ะวางของข้างเตียง",
    brand: "Greenforst",
    platform: "shopee",
    sourceUrl: "https://example.com/product",
    affiliateUrl: null,
    shopName: null,
    price: null,
    rating: null,
    sold: null,
    reviews: null,
    description: "",
    specs: {},
    imageUrls: ["https://example.com/product.png"],
  },
  storyboardGuide: "Shot-by-shot storyboard guide",
  voiceoverScript: "VOICEOVER SCRIPT BY SHOT",
  productDetail: "PRODUCT FACTS LOCK: Greenforst โต๊ะวางของข้างเตียง. Do not alter shape, material, or shelf count.",
  shots: [],
};

const baseShot = {
  id: "shot-1",
  order: 1,
  title: "เปิดปัญหา",
  startSeconds: 0,
  endSeconds: 8,
  durationSeconds: 8,
  storyboardGuide: "1. 0-8s เปิดปัญหา / มุมกล้อง: slow push-in",
  voiceover: "สั้นมาก",
  camera: "slow push-in",
  visual: "เห็นมุมข้างเตียงก่อนจัดของ",
  movement: "slow push-in",
  productRole: "context first",
};

describe("marketplace auto review audio/video planning", () => {
  it("defaults full video on Veo 3.1 Lite to native video audio", () => {
    expect(resolveMarketplaceAutoReviewAudioStrategy({
      outputMode: "full_video",
      requested: "auto",
      videoModel: "veo3/generate-veo-3-video-lite",
    })).toBe("native_video_audio");
  });

  it("does not generate audio for storyboard-only output", () => {
    expect(resolveMarketplaceAutoReviewAudioStrategy({
      outputMode: "storyboard_images",
      requested: "native_video_audio",
      videoModel: "veo3/generate-veo-3-video-lite",
    })).toBe("silent");
  });

  it("extends short non-final native speech so Veo clips do not end with a silent tail", () => {
    const speech = buildMarketplaceAutoReviewNativeSpeechText({
      plan: basePlan,
      shot: baseShot,
      isLastShot: false,
    });

    expect(speech).toContain(baseShot.voiceover);
    expect(speech).toContain("ไม่ปล่อยท้ายช็อตเงียบ");
  });

  it("adds Thai native dialogue pacing to Veo prompts", () => {
    const prompt = buildMarketplaceAutoReviewVideoPromptForTest({
      plan: basePlan as any,
      shot: baseShot as any,
      audioStrategy: "native_video_audio",
      isLastShot: false,
    });

    expect(prompt).toContain("Audio:");
    expect(prompt).toContain("Dialogue pacing");
    expect(prompt).toContain("9.5 วินาที");
    expect(prompt).toContain("พูดเป็นภาษาไทยว่า");
  });

  it("treats 3x3 split video prompts as one storyboard frame plus product references", () => {
    const prompt = buildMarketplaceAutoReviewVideoPromptForTest({
      plan: basePlan as any,
      shot: baseShot as any,
      audioStrategy: "native_video_audio",
      isLastShot: false,
      referenceMode: "single_storyboard_frame",
    });

    expect(prompt).toContain("Use @Image1 as single storyboard frame.");
    expect(prompt).toContain("@Image1 is the single storyboard frame");
    expect(prompt).toContain("not a stop/end frame");
    expect(prompt).toContain("product references only");
    expect(prompt).not.toContain("Use @Image1 as start frame and @Image2 as stop/end frame.");
    expect(prompt).not.toContain("provided start and stop frames");
  });

  it("keeps separate TTS video prompts visual-only", () => {
    const prompt = buildMarketplaceAutoReviewVideoPromptForTest({
      plan: basePlan as any,
      shot: baseShot as any,
      audioStrategy: "separate_tts_voiceover",
      isLastShot: false,
    });

    expect(prompt).toContain("External audio workflow");
    expect(prompt).toContain("No audio.");
    expect(prompt).toContain("No spoken dialogue.");
    expect(prompt).not.toContain("พูดเป็นภาษาไทยว่า");
  });

  it("fails video assembly when any expected shot clip is missing", () => {
    expect(() => assertCompleteMarketplaceAutoReviewVideoClips({
      expectedCount: 3,
      clipUrls: ["/a.mp4", "", "/c.mp4"],
      nodeIds: ["shot-1-video", "shot-2-video", "shot-3-video"],
    })).toThrow(/shot-2-video/);
  });
});
