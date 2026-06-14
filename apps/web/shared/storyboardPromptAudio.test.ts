import { describe, expect, it } from "vitest";
import {
  appendNativeSpeechDirectiveToStoryboardPrompt,
  buildCompactStoryboardReviewVideoPrompt,
  buildVeo31StoryboardVideoPrompt,
  extractStoryboardNativeSpeechText,
  formatStoryboardNativeSpeechDirective,
  splitStoryboardVoiceoverScriptByShot,
  storyboardPromptHasVeo31Sections,
} from "./storyboardPromptAudio";

describe("storyboard prompt audio helpers", () => {
  it("formats Thai native speech directives in the provider prompt shape", () => {
    expect(formatStoryboardNativeSpeechDirective("มุมข้างเตียงดูเป็นระเบียบขึ้น", "th", "Thai"))
      .toBe('พูดเป็นภาษาไทยว่า "มุมข้างเตียงดูเป็นระเบียบขึ้น"');
  });

  it("appends Thai speech once when a prompt has no spoken line", () => {
    const prompt = "Start with a close-up of the bedside table.";
    const withSpeech = appendNativeSpeechDirectiveToStoryboardPrompt(prompt, "หยิบของใช้ได้ง่ายขึ้น", "th", "Thai");

    expect(withSpeech).toContain('พูดเป็นภาษาไทยว่า "หยิบของใช้ได้ง่ายขึ้น"');
    expect(appendNativeSpeechDirectiveToStoryboardPrompt(withSpeech, "ไม่ควรซ้ำ", "th", "Thai"))
      .toBe(withSpeech);
  });

  it("extracts existing Thai and English spoken lines", () => {
    expect(extractStoryboardNativeSpeechText('ผู้ประกาศพูดเป็นภาษาไทยว่า "โต๊ะนี้ช่วยจัดของให้หยิบง่าย"'))
      .toBe("โต๊ะนี้ช่วยจัดของให้หยิบง่าย");
    expect(extractStoryboardNativeSpeechText('The presenter speaks in English: "Keep essentials within reach."'))
      .toBe("Keep essentials within reach.");
    expect(extractStoryboardNativeSpeechText('Woman says in Thai, quietly: "วันนี้ฝนตกหนักเหมือนใจฉันเลย"'))
      .toBe("วันนี้ฝนตกหนักเหมือนใจฉันเลย");
  });

  it("splits numbered combined voiceover scripts into ordered shot dialogue", () => {
    const segments = splitStoryboardVoiceoverScriptByShot(
      "VOICEOVER SCRIPT BY SHOT:1. 0-6.7s เปิดปัญหา: เคยไหม ของใช้เล็ก ๆ ข้างเตียงไม่มีที่อยู่ประจำ 2. 6.7-13.3s ขยาย pain point: พอเจอทุกวัน มุมนั้นก็ใช้งานไม่ค่อยสบาย 3. 13.3-20s สินค้าเข้ามาแก้: พอเอาชั้นวางเข้ามา มุมนี้ก็เริ่มมีตำแหน่งชัดขึ้น",
      3,
    );

    expect(segments).toEqual([
      "เคยไหม ของใช้เล็ก ๆ ข้างเตียงไม่มีที่อยู่ประจำ",
      "พอเจอทุกวัน มุมนั้นก็ใช้งานไม่ค่อยสบาย",
      "พอเอาชั้นวางเข้ามา มุมนี้ก็เริ่มมีตำแหน่งชัดขึ้น",
    ]);
  });

  it("splits Thai paragraph voiceover scripts across storyboard shots", () => {
    const segments = splitStoryboardVoiceoverScriptByShot(
      "เลือกชุดให้เด็กทารกนี่คิดยากเลยค่ะ เพราะต้องใส่สบายและสมกับตัวจริง ๆ วันนี้เราลองบอดี้สูทแขนยาวสีขาว เนื้อนุ่มมาก ใส่ง่ายกว่าเยอะค่ะ ผ้าค่อนข้างยืดหยุ่น น้องขยับตัวได้สบาย ถ้ากำลังหาชุดแรกเกิดที่ใส่ง่าย รุ่นนี้เป็นตัวเลือกที่น่ารักมากค่ะ",
      4,
    );

    expect(segments).toHaveLength(4);
    expect(segments[0]).toContain("เลือกชุดให้เด็กทารก");
    expect(segments[1]).toContain("วันนี้เราลองบอดี้สูท");
    expect(segments[2]).toContain("ผ้าค่อนข้างยืดหยุ่น");
    expect(segments[3]).toContain("ตัวเลือกที่น่ารัก");
  });

  it("builds a complete Veo 3.1 storyboard prompt with Thai dialogue and sound", () => {
    const prompt = buildVeo31StoryboardVideoPrompt({
      visualPrompt: "Start with a close-up of the cluttered floor, then reveal the organized bedside table.",
      durationSeconds: 8,
      aspectRatio: "9:16",
      frameRoles: ["start", "stop"],
      includeVoiceover: true,
      speechMode: "th",
      speechLanguage: "Thai",
      voiceoverScript: "โต๊ะนี้ช่วยให้มุมข้างเตียงหยิบของง่ายขึ้น",
      includeSound: true,
      soundBrief: "Soft room tone and gentle product handling foley.",
    });

    expect(prompt).toContain("Create an 8-second cinematic video.");
    expect(prompt).toContain("Scene:\n");
    expect(prompt).toContain("Characters:\n");
    expect(prompt).toContain("Action:\n");
    expect(prompt).toContain("Camera:\n");
    expect(prompt).toContain("Lighting / Style:\n");
    expect(prompt).toContain("Audio:\n");
    expect(prompt).toContain("Dialogue:\n");
    expect(prompt).toContain("Dialogue must be spoken in natural Thai, central Thai accent.");
    expect(prompt).toContain("Dialogue pacing: write enough spoken content for about 9.5 วินาที");
    expect(prompt).toContain("Avoid a short 5-6 second line or silent tail.");
    expect(prompt).toContain('Presenter พูดเป็นภาษาไทยว่า "โต๊ะนี้ช่วยให้มุมข้างเตียงหยิบของง่ายขึ้น"');
    expect(storyboardPromptHasVeo31Sections(prompt)).toBe(true);
  });

  it("describes single storyboard frame references without inventing a stop frame", () => {
    const prompt = buildVeo31StoryboardVideoPrompt({
      visualPrompt: "Animate the selected storyboard frame with a gentle product-focused camera move.",
      durationSeconds: 8,
      aspectRatio: "9:16",
      frameRoles: ["single_storyboard"],
      includeVoiceover: false,
      speechMode: "none",
      includeSound: false,
    });

    expect(prompt).toContain("Use @Image1 as single storyboard frame.");
    expect(prompt).toContain("do not invent a second endpoint");
    expect(prompt).not.toContain("@Image2");
    expect(prompt).not.toContain("stop/end frame");
  });

  it("deduplicates long concept details from storyboard guide prompts", () => {
    const conceptDetails = [
      "PRODUCT FACTS LOCK: เก้าอี้กินข้าวเด็ก โต๊ะกินข้าวเด็ก เด็ก 6 เดือน 3 in 1.",
      "รายละเอียดสินค้า: รีวิวเก้าอี้กินข้าวเด็ก.",
      "ห้ามเปลี่ยนประเภทสินค้า ขนาด จำนวนชั้น/ส่วนประกอบ สไตล์ หรือการใช้งานที่ระบุ.",
      "หลังซื้อ คืนแรกจัดมุมกินข้าวใหม่ให้อยู่ใกล้โต๊ะที่บ้าน เช้าวันถัดไปพาลูกนั่งโดยปรับระดับความสูงให้พอดีกับโต๊ะ แล้วคาดเข็มขัดนิรภัยเพื่อจัดท่านั่งให้ยึดตำแหน่ง พอทำซ้ำไม่กี่มื้อก็เริ่มชิน",
    ].join(" ");

    const prompt = buildVeo31StoryboardVideoPrompt({
      visualPrompt: "Shot 1: transition from @Image1 exact start frame to @Image2 exact end frame.",
      durationSeconds: 8,
      aspectRatio: "9:16",
      frameRoles: ["start", "stop"],
      conceptDetails,
      storyboardGuide: [
        "Concept and product facts:",
        conceptDetails,
        "",
        "Storyboard source: 9 sliced image frames creating 8 ordered video shots.",
      ].join("\n"),
      includeVoiceover: true,
      speechMode: "th",
      speechLanguage: "Thai",
      voiceoverScript: "เริ่มจากปัญหาหน้างาน แล้วค่อย ๆ เห็นทางออกที่ใช้งานได้จริง",
      includeSound: false,
    });

    expect(prompt.match(/PRODUCT FACTS LOCK/g)).toHaveLength(1);
    expect(prompt).not.toContain("Concept and product facts:");
    expect(prompt.length).toBeLessThan(1800);
  });

  it("adds dialogue pacing guidance to existing Veo section prompts", () => {
    const prompt = buildVeo31StoryboardVideoPrompt({
      visualPrompt: [
        "Create an 8-second cinematic video.",
        "",
        "Scene:",
        "A warm bedroom.",
        "",
        "Action:",
        "A presenter shows a bedside table.",
        "",
        "Camera:",
        "Medium close-up.",
        "",
        "Lighting / Style:",
        "Warm realistic lighting.",
        "",
        "Audio:",
        "Native audio. Dialogue must be spoken in natural Thai, central Thai accent.",
        "",
        "Dialogue:",
        "Presenter พูดเป็นภาษาไทยว่า \"โต๊ะนี้ช่วยให้หยิบของง่ายขึ้น\"",
      ].join("\n"),
      durationSeconds: 8,
      includeVoiceover: true,
      speechMode: "th",
      speechLanguage: "Thai",
      voiceoverScript: "โต๊ะนี้ช่วยให้หยิบของง่ายขึ้น",
    });

    expect(prompt).toContain("Dialogue pacing: write enough spoken content for about 9.5 วินาที");
    expect(prompt).toContain("Veo 3.1 can finish a slightly longer line.");
    expect(prompt.match(/Dialogue pacing:/g)).toHaveLength(1);
  });

  it("replaces stale no-audio sections when native voiceover is requested", () => {
    const prompt = buildVeo31StoryboardVideoPrompt({
      visualPrompt: [
        "Create an 8-second cinematic video.",
        "",
        "Scene:",
        "A warm bedroom.",
        "",
        "Action:",
        "A presenter shows the product.",
        "",
        "Camera:",
        "Medium shot.",
        "",
        "Lighting / Style:",
        "Warm realistic lighting.",
        "",
        "Audio:",
        "No audio. Do not add background music, sound effects, foley, room tone, or ambient/environment audio.",
        "",
        "Dialogue:",
        "No spoken dialogue.",
      ].join("\n"),
      durationSeconds: 8,
      includeVoiceover: true,
      speechMode: "th",
      speechLanguage: "Thai",
      voiceoverScript: "",
      includeSound: true,
      soundBrief: "Subtle product handling foley only, no music.",
    });

    expect(prompt).toContain("Native audio.");
    expect(prompt).toContain("Voice:");
    expect(prompt).toContain("Presenter พูดเป็นภาษาไทยว่า");
    expect(prompt).not.toContain("No audio.");
    expect(prompt).not.toContain("No spoken dialogue.");
  });

  it("removes ambient sound from existing Veo prompts when sound is disabled but Thai dialogue is enabled", () => {
    const prompt = buildVeo31StoryboardVideoPrompt({
      visualPrompt: [
        "Create an 8-second cinematic video.",
        "",
        "Scene:",
        "A bright nursery.",
        "",
        "Action:",
        "A presenter shows the nursery decor.",
        "",
        "Camera:",
        "Medium shot to wide shot.",
        "",
        "Lighting / Style:",
        "Soft warm lighting.",
        "",
        "Audio:",
        "Native audio of ambient nursery sounds.",
        "",
        "Dialogue:",
        "Presenter พูดเป็นภาษาไทยว่า \"เปลี่ยนห้องนอนเด็กให้เป็นโลกแห่งจินตนาการ\"",
      ].join("\n"),
      durationSeconds: 8,
      includeVoiceover: true,
      speechMode: "th",
      speechLanguage: "Thai",
      voiceoverScript: "เปลี่ยนห้องนอนเด็กให้เป็นโลกแห่งจินตนาการ",
      includeSound: false,
    });

    expect(prompt).toContain("Native dialogue audio only.");
    expect(prompt).toContain("Do not add background music, sound effects, foley, room tone, or ambient/environment audio.");
    expect(prompt).not.toContain("ambient nursery sounds");
    expect(prompt).toContain('Presenter พูดเป็นภาษาไทยว่า "เปลี่ยนห้องนอนเด็กให้เป็นโลกแห่งจินตนาการ"');
  });

  it("builds compact Storyboard Review video prompts from start/stop frames without long static details", () => {
    const longPropDetails = "Prop details: An adorable fluffy kitten with extra soft fur, big innocent eyes, tiny paws, sitting in a cozy sunlit room, warm golden light, soft pastel background, cute playful expression, detailed realistic fur, cinematic close-up, heartwarming mood, high resolution, beautiful depth of field.";
    const prompt = buildCompactStoryboardReviewVideoPrompt({
      visualPrompt: [
        "Create a 5-second cinematic video.",
        "",
        "Scene:",
        "Use @Image1 as start frame. Use @Image2 as stop frame. USER-SELECTED CREATIVE DIRECTION LOCK: Storytelling structure: Hook -> Problem -> Insight -> Proof -> CTA. PRODUCT FACTS LOCK: BENO PRO-FLEX espresso machine. Price signal: 22850 THB. Rating signal: 4.90.",
        "",
        "Characters:",
        `Use only the presenter visible in the frames. User-selected visual details: ${longPropDetails} User-selected character brief: คนไทย ผู้ชาย, 30-39, role คนทำงาน, style เป็นกันเอง.`,
        "",
        "Action:",
        "The presenter reaches toward the BENO PRO-FLEX, starts the brew, and the cup fills as the shot moves from the problem reaction to the clean product endpoint.",
        "",
        "Camera:",
        "Begin as a medium start-frame hold, then push toward the espresso machine and finish exactly on the stop-frame product angle.",
        "",
        "Audio:",
        "Native audio with room tone.",
        "",
        "Dialogue:",
        'Presenter พูดเป็นภาษาไทยว่า "พอใช้ BENO PRO-FLEX เราบด ชง และตีฟองนมในเครื่องเดียวเลย"',
      ].join("\n"),
      durationSeconds: 5,
      aspectRatio: "9:16",
      frameRoles: ["start", "stop"],
      includeVoiceover: true,
      speechMode: "th",
      speechLanguage: "Thai",
      voiceoverScript: "พอใช้ BENO PRO-FLEX เราบด ชง และตีฟองนมในเครื่องเดียวเลย",
      includeSound: false,
      soundBrief: longPropDetails,
    });

    expect(prompt.length).toBeLessThanOrEqual(2000);
    expect(storyboardPromptHasVeo31Sections(prompt)).toBe(true);
    expect(prompt).toContain("Use @Image1 as start frame. Use @Image2 as stop/end frame.");
    expect(prompt).toContain("Frames define the product, people, props, location, lighting, and final look");
    expect(prompt).toContain("The presenter reaches toward the BENO PRO-FLEX");
    expect(prompt).toContain('Presenter พูดเป็นภาษาไทยว่า "พอใช้ BENO PRO-FLEX เราบด ชง และตีฟองนมในเครื่องเดียวเลย"');
    expect(prompt).not.toContain("USER-SELECTED CREATIVE DIRECTION LOCK");
    expect(prompt).not.toContain("PRODUCT FACTS LOCK");
    expect(prompt).not.toContain("Prop details");
    expect(prompt).not.toContain("big innocent eyes");
    expect(prompt).not.toContain("Price signal");
  });

  it("keeps requested Thai dialogue when speech mode is selected even if the legacy boolean is false", () => {
    const prompt = buildCompactStoryboardReviewVideoPrompt({
      visualPrompt: [
        "Create an 8-second cinematic video.",
        "",
        "Scene:",
        "Use @Image1 as start frame. Use @Image2 as stop/end frame.",
        "",
        "Action:",
        "A hand starts the espresso machine, the cup fills, and the product moment lands on the clean endpoint frame.",
        "",
        "Camera:",
        "Slow push-in from the presenter's hand to the espresso stream, then settle on the machine.",
      ].join("\n"),
      durationSeconds: 8,
      aspectRatio: "9:16",
      frameRoles: ["start", "stop"],
      includeVoiceover: false,
      speechMode: "th",
      speechLanguage: "Thai",
      voiceoverScript: "ใช้เครื่องเดียว บด ชง และตีฟองนมได้ครบในทุกเช้า",
      includeSound: false,
    });

    expect(prompt).toContain("Native dialogue audio only.");
    expect(prompt).toContain("Dialogue must be spoken in natural Thai, central Thai accent.");
    expect(prompt).toContain('Presenter พูดเป็นภาษาไทยว่า "ใช้เครื่องเดียว บด ชง และตีฟองนมได้ครบในทุกเช้า"');
    expect(prompt).not.toContain("No spoken dialogue.");
  });
});
