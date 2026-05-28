import { describe, expect, it } from "vitest";
import {
  appendNativeSpeechDirectiveToStoryboardPrompt,
  buildVeo31StoryboardVideoPrompt,
  extractStoryboardNativeSpeechText,
  formatStoryboardNativeSpeechDirective,
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
    expect(prompt).toContain("Dialogue pacing: aim for the spoken line to fill about 8 วินาที of the clip");
    expect(prompt).toContain('Presenter พูดเป็นภาษาไทยว่า "โต๊ะนี้ช่วยให้มุมข้างเตียงหยิบของง่ายขึ้น"');
    expect(storyboardPromptHasVeo31Sections(prompt)).toBe(true);
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

    expect(prompt).toContain("Dialogue pacing: aim for the spoken line to fill about 8 วินาที of the clip");
    expect(prompt.match(/Dialogue pacing:/g)).toHaveLength(1);
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
});
