import { describe, expect, it } from "vitest";
import {
  buildPromptExpansionSkillBillingContext,
  buildValidatedPromptExpansionPreview,
  PROMPT_EXPANSION_LLM_TIMEOUT_MS,
  PromptExpansionFailure,
} from "../verticalDramaPromptExpansionService";
import { buildSlotPrompt, evaluatePromptExpansionQuality, hashPrompt, parsePromptExpansionModelOutput, promptExpansionPreviewSchema, PROMPT_EXPANSION_PREMISE_LIMIT, type PromptExpansionModelOutput } from "@shared/verticalDramaSeries/promptExpansion";

const execution = { skillId: "vertical-drama-prompt-expansion" as const, skillVersion: "2.0.0", executionMode: "llm-only" as const, provider: "test-real-provider", providerCallId: "provider-call-123", model: "test-model", attemptCount: 1, inputTokens: 220, outputTokens: 900, mocked: false as const };
const visualSlot = { slotKey: "story_anchor", title: "ภาพฉากหลัก", description: "ภาพประกอบฉากหลักที่ระบบเสนอจากผลลัพธ์ของ skill และต้องตรวจสอบสิทธิ์ก่อนใช้", semanticRole: "scene_anchor" as const, mediaType: "mixed" as const, required: true, evidenceStatus: "illustrative" as const, rationale: "ทำให้บริบทของเรื่องเห็นได้ชัด" };

function storyOutput(overrides: Partial<PromptExpansionModelOutput> = {}): PromptExpansionModelOutput {
  return {
    brief: {
      title: "เงื่อนไขของหัวใจ", oneLineSummary: "นักเรียนสองคนต้องร่วมมือกันหลังเหตุการณ์ที่ทำให้ครอบครัวของทั้งคู่แตกแยก", profile: "story", angle: "เนื้อเรื่องย่อกึ่งสมบูรณ์ที่ขยายตัวละคร ความสัมพันธ์ ปม และทิศทางตอนจบ", audience: "ผู้ชมละครแนวตั้งที่ชอบดราม่าโรแมนติก", scope: ["ตัวละคร", "ความสัมพันธ์", "อุปสรรค", "ปมใหญ่", "จุดไคลแมกซ์", "ตอนจบ"], factualClaims: [], creativeAssumptions: ["ชื่อและรายละเอียดที่ไม่ได้ระบุเป็นข้อเสนอเพื่อแก้ไขได้"], exclusions: ["ยังไม่ลงรายละเอียดเป็นฉากย่อยหรือบทสนทนา"],
      storyTreatment: {
        protagonists: [
          { name: "แพร", role: "นักเรียนผู้ดูแลแม่", background: "เติบโตมากับภาระในครอบครัวและไม่ไว้ใจคนง่าย", goal: "รักษาบ้านและเรียนให้จบ", need: "ยอมรับว่าการขอความช่วยเหลือไม่ใช่ความพ่ายแพ้" },
          { name: "ธาม", role: "นักเรียนใหม่", background: "ย้ายตามพ่อที่กลับมารับผิดชอบธุรกิจในชุมชน", goal: "พิสูจน์ว่าตนเองไม่ใช่ต้นเหตุของอดีต", need: "เผชิญหน้ากับความจริงแทนการหนี" },
        ],
        setting: "ชุมชนริมแม่น้ำและโรงเรียนมัธยมที่กำลังเผชิญการเปลี่ยนแปลง",
        meetingAndIncitingEvent: "ทั้งคู่พบกันเมื่อแพรเข้าใจว่าธามเกี่ยวข้องกับการสูญเสียของครอบครัว แต่ต้องร่วมมือกันช่วยเพื่อนในเหตุการณ์ฉุกเฉิน",
        relationshipProgression: ["ความไม่ไว้ใจและการปะทะกัน", "เห็นความรับผิดชอบของอีกฝ่ายและเริ่มช่วยเหลือกัน", "ความจริงทำให้ต้องเลือกระหว่างความรักกับความแค้น"],
        obstacles: ["ความลับของผู้ใหญ่", "แรงกดดันจากครอบครัว", "ความเข้าใจผิดที่ถูกย้ำด้วยหลักฐานบางส่วน"],
        opposingForces: ["ผู้ใหญ่ที่ปกป้องผลประโยชน์ของตน", "บาดแผลและความเชื่อที่ผิดของตัวละคร"],
        centralQuestion: "ทั้งคู่จะรักและเชื่อใจกันได้หรือไม่เมื่อความจริงทำให้ครอบครัวต้องเผชิญหน้ากัน",
        majorConflict: "หลักฐานใหม่ชี้ว่าครอบครัวของธามอาจปกปิดเหตุการณ์ที่ทำให้ครอบครัวแพรสูญเสียอนาคต",
        turningPoints: ["แพรพบว่าธามช่วยปกป้องแม่ของเธอโดยไม่หวังผล", "ธามพบหลักฐานที่พ่อซ่อนไว้และยอมเปิดเผยต่อแพร", "ทั้งคู่แตกหักก่อนร่วมมือกันเปิดโปงความจริง"],
        climax: "ทั้งคู่ต้องเปิดเผยความจริงต่อชุมชน แม้จะทำให้ครอบครัวตนเองสูญเสียสถานะและความปลอดภัย",
        endingDirection: "ความจริงได้รับการยอมรับ ครอบครัวเริ่มชดใช้ความเสียหาย และทั้งคู่เลือกเดินหน้าความสัมพันธ์บนความจริง",
        unresolvedHooks: ["ผลที่ตามมาจากการตัดสินใจของผู้ใหญ่ยังเปิดไว้สำหรับ Draft ต่อไป"], tone: "ดราม่าอบอุ่น กดดัน และมีความหวัง", audience: "ผู้ชมวัยรุ่นและผู้ใหญ่ที่ชอบเรื่องรักซึ่งมีปมครอบครัว", assumptions: ["เหตุการณ์และชื่อทั้งหมดที่ไม่ได้อยู่ในโจทย์เป็นข้อเสนอสร้างสรรค์"], exclusions: ["ไม่กำหนดจำนวนตอนหรือฉากถ่ายทำในชั้นนี้"],
      },
    },
    expandedPrompt: "เงื่อนไขของหัวใจเป็นเรื่องของแพรและธาม นักเรียนสองคนจากครอบครัวที่มีบาดแผลร่วมกัน พวกเขาพบกันจากความเข้าใจผิดและถูกบังคับให้ร่วมมือกันในเหตุการณ์ฉุกเฉิน ความสัมพันธ์เริ่มจากการปะทะและค่อย ๆ เปลี่ยนเป็นความไว้ใจ แต่ความลับของผู้ใหญ่ทำให้ความรักต้องชนกับความแค้น ปมใหญ่คือหลักฐานที่อาจเปลี่ยนความเข้าใจต่อเหตุการณ์ในอดีต ทั้งคู่ต้องตัดสินใจเปิดเผยความจริงต่อชุมชนในไคลแมกซ์ และยอมรับผลกระทบเพื่อเริ่มต้นความสัมพันธ์บนความจริง โดยรายละเอียดที่ไม่ได้ระบุควรให้ผู้สร้างตรวจและแก้ไขก่อนทำ Draft ฉากเต็ม",
    sources: [], warnings: ["ชื่อและเหตุการณ์ที่ไม่ได้ระบุในโจทย์เป็นข้อเสนอสร้างสรรค์ ต้องตรวจแก้ก่อนใช้"], slots: [visualSlot], ...overrides,
  };
}

describe("vertical drama prompt expansion strict real-LLM contract", () => {
  it("accepts exactly 5,000 premise characters and rejects the 5,001st", () => {
    const atLimit = promptExpansionPreviewSchema.shape.originalPrompt.safeParse("ก".repeat(PROMPT_EXPANSION_PREMISE_LIMIT));
    const overLimit = promptExpansionPreviewSchema.shape.originalPrompt.safeParse("ก".repeat(PROMPT_EXPANSION_PREMISE_LIMIT + 1));

    expect(PROMPT_EXPANSION_PREMISE_LIMIT).toBe(5_000);
    expect(atLimit.success).toBe(true);
    expect(overLimit.success).toBe(false);
  });

  it("keeps the real provider timeout above the observed 25-35 second response window", () => {
    expect(PROMPT_EXPANSION_LLM_TIMEOUT_MS).toBe(55_000);
  });

  it("binds credit usage to the dedicated skill settlement", () => {
    expect(buildPromptExpansionSkillBillingContext({
      runId: "ppex-run-1",
      traceId: "ppex-trace-1",
      providerCallId: "provider-call-123",
    })).toEqual({
      skillRunId: "ppex-run-1",
      skillSlug: "vertical-drama-prompt-expansion",
      sourceType: "skill",
      metadata: {
        feature: "vertical-drama-prompt-expansion",
        traceId: "ppex-trace-1",
        providerCallId: "provider-call-123",
      },
    });
  });

  it("accepts a materially expanded story treatment with real execution evidence", () => {
    const prompt = "พระเอกและนางเอกเป็นนักเรียนมัธยมปลายที่เป็นคู่กัดกันประจำ แต่มีเหตุให้ต้องร่วมมือกัน";
    const preview = buildValidatedPromptExpansionPreview({ prompt, modelOutput: JSON.stringify(storyOutput()), execution });
    expect(preview.originalPromptHash).toBe(hashPrompt(prompt));
    expect(preview.brief.storyTreatment?.meetingAndIncitingEvent).toBeTruthy();
    expect(preview.brief.storyTreatment?.climax).toBeTruthy();
    expect(preview.brief.storyTreatment?.endingDirection).toBeTruthy();
    expect(preview.execution?.mocked).toBe(false);
    expect(preview.execution?.providerCallId).toBe("provider-call-123");
    expect(buildSlotPrompt(preview.slots[0]!, preview.brief)).toContain("scene_anchor");
  });
  it("fails closed when no model output is supplied", () => {
    expect(() => buildValidatedPromptExpansionPreview({ prompt: "โจทย์เรื่องสั้น" })).toThrow(PromptExpansionFailure);
  });
  it("rejects empty slots instead of deriving deterministic slots", () => {
    expect(() => parsePromptExpansionModelOutput(JSON.stringify(storyOutput({ slots: [] })))).toThrow(/schema/);
  });
  it("rejects copied output as not useful", () => {
    const prompt = "เรื่องของคนสองคนที่ต้องกลับมาเจอกัน";
    expect(() => buildValidatedPromptExpansionPreview({ prompt, modelOutput: JSON.stringify(storyOutput({ expandedPrompt: prompt })), execution })).toThrow(/ไม่ได้ขยายโจทย์/);
  });
  it("requires real-run evidence before a preview can be approved", () => {
    expect(() => buildValidatedPromptExpansionPreview({ prompt: "โจทย์เรื่องรักและความลับในครอบครัว", modelOutput: JSON.stringify(storyOutput()) })).toThrow(/หลักฐาน/);
  });
  it("keeps the quality gate explicit and accepts a complete story treatment", () => {
    const quality = evaluatePromptExpansionQuality({ originalPrompt: "โจทย์เรื่องรักและความลับในครอบครัว", output: storyOutput() });
    expect(quality.ok).toBe(true);
    expect(quality.failureReasons).toEqual([]);
  });
});
