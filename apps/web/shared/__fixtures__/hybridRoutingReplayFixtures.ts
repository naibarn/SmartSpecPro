import { HYBRID_RUNTIME_CONTRACT_VERSION } from "../orchestration/hybridOrchestration";

export type HybridRoutingReplayFixtureGroup =
  | "direct_media_negative"
  | "prompt_enhancement_negative"
  | "direct_skill_negative"
  | "hybrid_positive_thai"
  | "hybrid_positive_english"
  | "ambiguous"
  | "legacy_agency_compatibility";

export interface HybridRoutingReplayFixture {
  id: string;
  group: HybridRoutingReplayFixtureGroup;
  locale: "th" | "en";
  input: string;
  expectedRoute: "direct_skill" | "hybrid_candidate" | "chat";
  expectedReason: string;
  expectedContractVersion: typeof HYBRID_RUNTIME_CONTRACT_VERSION;
}

export const hybridRoutingReplayFixtures: HybridRoutingReplayFixture[] = [
  {
    id: "direct-image-create-th",
    group: "direct_media_negative",
    locale: "th",
    input: "create image: ผู้หญิงไทยยืนในห้องนั่งเล่นหรูหรา",
    expectedRoute: "direct_skill",
    expectedReason: "direct_image_command",
    expectedContractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
  },
  {
    id: "direct-video-create-en",
    group: "direct_media_negative",
    locale: "en",
    input: "create video: short product reveal with cinematic lighting",
    expectedRoute: "direct_skill",
    expectedReason: "direct_video_command",
    expectedContractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
  },
  {
    id: "enhance-prompt-en",
    group: "prompt_enhancement_negative",
    locale: "en",
    input: "enhance edit prompt: make this image prompt more photorealistic",
    expectedRoute: "direct_skill",
    expectedReason: "prompt_enhancement_command",
    expectedContractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
  },
  {
    id: "article-direct-th",
    group: "direct_skill_negative",
    locale: "th",
    input: "เขียนบทความการศึกษาเรื่องเด็กตกเตียงควรดูแลอย่างไร",
    expectedRoute: "direct_skill",
    expectedReason: "single_skill_article_request",
    expectedContractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
  },
  {
    id: "hybrid-review-approve-th",
    group: "hybrid_positive_thai",
    locale: "th",
    input: "ช่วยวางแผนหลายขั้นตอน เปรียบเทียบทางเลือก วิจารณ์ความเสี่ยง แล้วให้ฉันอนุมัติก่อนดำเนินการ",
    expectedRoute: "hybrid_candidate",
    expectedReason: "multi_stage_or_approval_request",
    expectedContractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
  },
  {
    id: "hybrid-review-approve-en",
    group: "hybrid_positive_english",
    locale: "en",
    input: "Plan this in stages, explore alternatives, critique the tradeoffs, then ask for approval before the final action.",
    expectedRoute: "hybrid_candidate",
    expectedReason: "multi_stage_or_approval_request",
    expectedContractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
  },
  {
    id: "ambiguous-normal-chat-en",
    group: "ambiguous",
    locale: "en",
    input: "Can you think through this with me?",
    expectedRoute: "chat",
    expectedReason: "normal_chat",
    expectedContractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
  },
];
