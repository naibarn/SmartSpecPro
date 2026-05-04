import { describe, expect, it } from "vitest";
import {
  applySharedContextToMultiVideoText,
  extractMusicBriefFromPromptText,
  extractVoiceoverScriptFromPromptText,
  parseMultiVideoPrompts,
  prepareSilentVideoPromptDisplayForExternalAudio,
  prepareSilentVideoPromptForExternalAudio,
  sanitizeMediaGenerationPromptText,
  splitMultiVideoPromptOutput,
} from "./mediaStudioPromptParsing";

describe("parseMultiVideoPrompts", () => {
  it("splits prompts and prepends shared context to each one", () => {
    const input = [
      "SHARED CONTINUITY PREAMBLE:",
      "CAST LOCK: yellow dog in a blue collar. Same park, same red ball.",
      "",
      "PROMPT 1 (8 seconds):",
      "A high-quality Realistic clip (8 seconds).",
      "Speaker: เด็กชาย",
      "",
      "PROMPT 2 (8 seconds):",
      "A high-quality Realistic clip (8 seconds).",
      "Speaker: เด็กหญิง",
    ].join("\n");

    expect(parseMultiVideoPrompts(input)).toEqual([
      "CAST LOCK: yellow dog in a blue collar. Same park, same red ball.\n\nA high-quality Realistic clip (8 seconds).\nSpeaker: เด็กชาย",
      "CAST LOCK: yellow dog in a blue collar. Same park, same red ball.\n\nA high-quality Realistic clip (8 seconds).\nSpeaker: เด็กหญิง",
    ]);
  });

  it("splits out shared continuity notes separately", () => {
    const input = [
      "REFERENCE NOTES:",
      "Yellow dog with a blue collar, red bandana, same grassy park.",
      "",
      "PROMPT 1 (8 seconds):",
      "Speaker: เด็กชาย",
      "",
      "PROMPT 2 (8 seconds):",
      "Speaker: เด็กหญิง",
    ].join("\n");

    expect(splitMultiVideoPromptOutput(input)).toEqual({
      sharedContext: "Yellow dog with a blue collar, red bandana, same grassy park.",
      prompts: [
        "Speaker: เด็กชาย",
        "Speaker: เด็กหญิง",
      ],
    });
  });

  it("returns an empty array when no prompt markers are present", () => {
    expect(parseMultiVideoPrompts("A single prompt without markers")).toEqual([]);
  });

  it("also splits other scene-like markers for future compatible skills", () => {
    const input = [
      "Shared world description that should repeat.",
      "",
      "SCENE 1 (4 seconds):",
      "Speaker: Cat",
      "",
      "SCENE 2 (4 seconds):",
      "Speaker: Dog",
    ].join("\n");

    expect(parseMultiVideoPrompts(input)).toEqual([
      "Shared world description that should repeat.\n\nSpeaker: Cat",
      "Shared world description that should repeat.\n\nSpeaker: Dog",
    ]);
  });

  it("does not split prompt marker words that appear inside shared planning text and does not prepend the plan to each generation prompt", () => {
    const input = [
      "NEWS BEAT PLAN:",
      "Beat 1 mentions PROMPT 1 only as text, not as a split marker.",
      "Beat 2 continues the same story arc.",
      "",
      "PROMPT 1 (8 seconds):",
      "Speaker: Anchor",
      "",
      "PROMPT 2 (8 seconds):",
      "Speaker: Anchor",
    ].join("\n");

    expect(parseMultiVideoPrompts(input)).toEqual([
      "Speaker: Anchor",
      "Speaker: Anchor",
    ]);
  });

  it("keeps reference and continuity context for legacy prompt blocks without a continuity lock", () => {
    const input = [
      "REFERENCE NOTES:",
      "Same AI newsroom visual wall and Xiaomi MiMo graphics.",
      "",
      "CONTINUITY NOTES:",
      "Same Thai presenter, same navy blazer, same desk.",
      "",
      "VEO 3.1 SETTINGS:",
      "Model: veo3_lite",
      "",
      "NEWS BEAT PLAN:",
      "Beat 1 - Xiaomi launches MiMo.",
      "Beat 2 - Long context matters.",
      "",
      "PROMPT 1 (8 seconds):",
      "Speaker: Anchor",
      "",
      "PROMPT 2 (8 seconds):",
      "Speaker: Anchor",
    ].join("\n");

    expect(parseMultiVideoPrompts(input)).toEqual([
      [
        "Same AI newsroom visual wall and Xiaomi MiMo graphics.",
        "",
        "CONTINUITY NOTES:",
        "Same Thai presenter, same navy blazer, same desk.",
        "",
        "Speaker: Anchor",
      ].join("\n"),
      [
        "Same AI newsroom visual wall and Xiaomi MiMo graphics.",
        "",
        "CONTINUITY NOTES:",
        "Same Thai presenter, same navy blazer, same desk.",
        "",
        "Speaker: Anchor",
      ].join("\n"),
    ]);
  });

  it("does not prepend long shared story notes when each prompt already has a continuity lock", () => {
    const input = [
      "REFERENCE NOTES:",
      "The whole video follows a luxurious building journey from exterior, through the entrance, into the elevator, and finally to the office desk with a large computer screen.",
      "",
      "CONTINUITY NOTES:",
      "Keep one continuous forward camera path through the full building journey. Do not repeat the path inside every generated shot.",
      "",
      "STORY BEAT PLAN:",
      "Beat 1 - exterior.",
      "Beat 2 - entrance.",
      "",
      "PROMPT 1 (8 seconds):",
      "Continuity Lock: same realistic luxury building and forward camera path.",
      "Visual action: Establish the exterior facade only.",
      "",
      "PROMPT 2 (8 seconds):",
      "Continuity Lock: same realistic luxury building and forward camera path.",
      "Visual action: Move toward the entrance doors only.",
    ].join("\n");

    expect(parseMultiVideoPrompts(input)).toEqual([
      [
        "Continuity Lock: same realistic luxury building and forward camera path.",
        "Visual action: Establish the exterior facade only.",
      ].join("\n"),
      [
        "Continuity Lock: same realistic luxury building and forward camera path.",
        "Visual action: Move toward the entrance doors only.",
      ].join("\n"),
    ]);
  });

  it("replaces the shared continuity paragraph without disturbing prompt markers", () => {
    const input = [
      "REFERENCE NOTES:",
      "Yellow dog in a blue collar.",
      "",
      "PROMPT 1 (8 seconds):",
      "Speaker: เด็กชาย",
      "",
      "PROMPT 2 (8 seconds):",
      "Speaker: เด็กหญิง",
    ].join("\n");

    expect(applySharedContextToMultiVideoText(input, "Yellow dog with a red bandana.")).toBe(
      [
        "REFERENCE NOTES:",
        "Yellow dog with a red bandana.",
        "",
        "PROMPT 1 (8 seconds):",
        "Speaker: เด็กชาย",
        "",
        "PROMPT 2 (8 seconds):",
        "Speaker: เด็กหญิง",
      ].join("\n"),
    );
  });

  it("injects shared continuity notes when none exist yet", () => {
    const input = [
      "PROMPT 1 (8 seconds):",
      "Speaker: Cat",
      "",
      "PROMPT 2 (8 seconds):",
      "Speaker: Dog",
    ].join("\n");

    expect(applySharedContextToMultiVideoText(input, "Shared continuity note.")).toBe(
      [
        "REFERENCE NOTES:",
        "Shared continuity note.",
        "",
        "PROMPT 1 (8 seconds):",
        "Speaker: Cat",
        "",
        "PROMPT 2 (8 seconds):",
        "Speaker: Dog",
      ].join("\n"),
    );
  });
});

describe("sanitizeMediaGenerationPromptText", () => {
  it("removes Veo/provider metadata lines before generation", () => {
    const input = [
      "PROMPT 1 (8 seconds):",
      "Continuity Lock: same Thai presenter in the same vertical AI newsroom.",
      "Veo Settings: veo3_lite, TEXT_2_VIDEO, 720p, 9:16, enableTranslation=false, enableFallback=false",
      "Reference Image Role: none required",
      "A high-quality Realistic presenter-style news clip (8 seconds).",
      "Audio Cue: A serious, authoritative, and articulate voice speaking rapidly with a neutral, professional journalistic tone.",
      "Dialogue Budget: 1 short sentence, ~5.0 seconds max",
      "Speaker: ผู้ชายชาวไทยอายุ 22 ปี",
      "Speech Delivery: Natural Thai news cadence, crisp and conversational, no stretched syllables.",
      "News Beat Goal: Xiaomi launches MiMo-V2.5 Series.",
      "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo-V2.5 Series\"",
      "Background Visuals: vertical AI newsroom visual wall with non-readable MiMo workflow graphics.",
      "Sound Design: Low-volume modern newsroom tech ambience under the voice, with a tiny UI whoosh.",
      "No subtitles, no extra on-screen captions unless includeTextOverlays=true, no narrator. Only presenter voice.",
    ].join("\n");

    expect(sanitizeMediaGenerationPromptText(input)).toBe([
      "Continuity Lock: same Thai presenter in the same vertical AI newsroom.",
      "A high-quality Realistic presenter-style news clip (8 seconds).",
      "Audio Cue: A serious, authoritative, and articulate voice speaking rapidly with a neutral, professional journalistic tone.",
      "Speaker: ผู้ชายชาวไทยอายุ 22 ปี",
      "Speech Delivery: Natural Thai news cadence, crisp and conversational, no stretched syllables.",
      "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo-V2.5 Series\"",
      "Background Visuals: vertical AI newsroom visual wall with non-readable MiMo workflow graphics.",
      "Sound Design: Low-volume modern newsroom tech ambience under the voice, with a tiny UI whoosh.",
      "No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no random glyphs, no narrator. Only the intended character or presenter voice.",
    ].join("\n"));
  });

  it("removes leaked settings and beat-plan sections while keeping continuity notes", () => {
    const input = [
      "Reference Notes:",
      "Same presenter, desk, and AI visual wall.",
      "",
      "VEO 3.1 SETTINGS:",
      "Model: veo3_lite",
      "Generation Type: TEXT_2_VIDEO",
      "Aspect Ratio: 9:16",
      "",
      "NEWS BEAT PLAN:",
      "Beat 1 - Xiaomi launches MiMo.",
      "",
      "Continuity Notes:",
      "Same anchor identity and lighting.",
      "",
      "PROMPT 1 (8 seconds):",
      "A high-quality Realistic presenter-style news clip.",
    ].join("\n");

    expect(sanitizeMediaGenerationPromptText(input)).toBe([
      "Reference Notes:",
      "Same presenter, desk, and AI visual wall.",
      "",
      "Continuity Notes:",
      "Same anchor identity and lighting.",
      "",
      "A high-quality Realistic presenter-style news clip.",
    ].join("\n"));
  });

  it("strengthens older no-text lines before generation", () => {
    expect(sanitizeMediaGenerationPromptText(
      "A high-quality clip.\nNo subtitles, no on-screen text. No narrator. Only character voice.",
    )).toBe([
      "A high-quality clip.",
      "No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no random glyphs, no narrator. Only the intended character or presenter voice.",
    ].join("\n"));
  });
});

describe("external audio prompt helpers", () => {
  it("extracts the spoken news script from multi-video prompt blocks", () => {
    const input = [
      "PROMPT 1 (8 seconds):",
      "Audio Cue: A serious news voice.",
      "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo-V2.5 Series\"",
      "Background Visuals: AI newsroom.",
      "",
      "PROMPT 2 (8 seconds):",
      "ผู้ประกาศพูดเป็นภาษาไทยว่า \"รองรับบริบทยาวได้ถึง 1 ล้าน token\"",
    ].join("\n");

    expect(extractVoiceoverScriptFromPromptText(input)).toBe([
      "Xiaomi เปิดตัว MiMo-V2.5 Series",
      "รองรับบริบทยาวได้ถึง 1 ล้าน token",
    ].join("\n"));
  });

  it("prefers an explicit top-level voiceover script for separate audio workflows", () => {
    const input = [
      "VOICEOVER SCRIPT:",
      "OpenAI ออกอัปเดต Codex CLI รุ่นใหม่",
      "รุ่นนี้ช่วยให้ agent ทำงานต่อเนื่องได้ดีขึ้น",
      "",
      "SOUND BED BRIEF:",
      "Low-volume modern tech newsroom pulse, restrained and continuous.",
      "",
      "PROMPT 1 (8 seconds):",
      "A high-quality visual-only news clip.",
    ].join("\n");

    expect(extractVoiceoverScriptFromPromptText(input)).toBe([
      "OpenAI ออกอัปเดต Codex CLI รุ่นใหม่",
      "รุ่นนี้ช่วยให้ agent ทำงานต่อเนื่องได้ดีขึ้น",
    ].join("\n"));
    expect(extractMusicBriefFromPromptText(input)).toBe("Low-volume modern tech newsroom pulse, restrained and continuous.");
  });

  it("extracts inline top-level voiceover and music sections", () => {
    const input = [
      "VOICEOVER SCRIPT: OpenAI ออกอัปเดต Codex CLI รุ่นใหม่",
      "รุ่นนี้ช่วยให้ agent ทำงานต่อเนื่องได้ดีขึ้น",
      "",
      "SOUND BED BRIEF: Low-volume modern tech newsroom pulse.",
      "",
      "PROMPT 1 (8 seconds):",
      "A high-quality visual-only news clip.",
    ].join("\n");

    expect(extractVoiceoverScriptFromPromptText(input)).toBe([
      "OpenAI ออกอัปเดต Codex CLI รุ่นใหม่",
      "รุ่นนี้ช่วยให้ agent ทำงานต่อเนื่องได้ดีขึ้น",
    ].join("\n"));
    expect(extractMusicBriefFromPromptText(input)).toBe("Low-volume modern tech newsroom pulse.");
  });

  it("extracts separate audio fields from structured storyboard JSON", () => {
    const input = JSON.stringify({
      audioWorkflow: {
        voiceoverScript: [
          "OpenAI ออกอัปเดต Codex CLI รุ่นใหม่",
          "รุ่นนี้ช่วยให้ agent ทำงานต่อเนื่องได้ดีขึ้น",
        ].join("\n"),
        musicPrompt: "Low-volume modern newsroom pulse.",
      },
      videoPrompts: [
        {
          sceneNumber: 1,
          durationSeconds: 8,
          prompt: "A visual-only presenter shot in a modern newsroom.",
        },
      ],
    });

    expect(extractVoiceoverScriptFromPromptText(input)).toBe([
      "OpenAI ออกอัปเดต Codex CLI รุ่นใหม่",
      "รุ่นนี้ช่วยให้ agent ทำงานต่อเนื่องได้ดีขึ้น",
    ].join("\n"));
    expect(extractMusicBriefFromPromptText(input)).toBe("Low-volume modern newsroom pulse.");
  });

  it("removes top-level external audio sections before sending prompts to video models", () => {
    const input = [
      "VOICEOVER SCRIPT:",
      "OpenAI ออกอัปเดต Codex CLI รุ่นใหม่",
      "",
      "SOUND BED BRIEF:",
      "Low-volume modern newsroom pulse.",
      "",
      "PROMPT 1 (8 seconds):",
      "A high-quality visual-only news clip.",
      "Background Visuals: abstract AI workflow shapes, no readable text.",
    ].join("\n");

    expect(sanitizeMediaGenerationPromptText(input)).toBe([
      "A high-quality visual-only news clip.",
      "Background Visuals: abstract AI workflow shapes, no readable text.",
    ].join("\n"));
  });

  it("does not turn visual-only prompts into a TTS script when no narration is present", () => {
    const input = [
      "REFERENCE NOTES:",
      "Same presenter in a newsroom.",
      "",
      "PROMPT 1 (8 seconds):",
      "A high-quality Realistic visual-only presenter-style news clip (8 seconds).",
      "Visual action: The presenter gestures while speaking.",
      "No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no random glyphs, no narrator, no speech, no dialogue, no music, no sound effects.",
    ].join("\n");

    expect(extractVoiceoverScriptFromPromptText(input)).toBe("");
  });

  it("derives a music brief from Sound Design lines when no top-level music section exists", () => {
    const input = [
      "PROMPT 1 (8 seconds):",
      "Sound Design: Low-volume modern newsroom pulse with subtle UI whooshes.",
      "",
      "PROMPT 2 (8 seconds):",
      "Sound Design: Low-volume modern newsroom pulse with subtle UI whooshes.",
      "",
      "PROMPT 3 (8 seconds):",
      "Sound Design: Restrained clean tech ambience under the segment.",
    ].join("\n");

    expect(extractMusicBriefFromPromptText(input)).toBe([
      "Low-volume modern newsroom pulse with subtle UI whooshes.",
      "Restrained clean tech ambience under the segment.",
    ].join("\n"));
  });

  it("turns provider prompts into visual-only prompts for separate audio workflows", () => {
    const input = [
      "Continuity Lock: same Thai presenter.",
      "Audio Cue: A serious news voice.",
      "Speaker: Anchor",
      "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo\"",
      "Background Visuals: non-readable AI dashboard graphics.",
      "Sound Design: subtle newsroom pulse.",
      "No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no random glyphs, no narrator, no speech, no dialogue, no music, no sound effects.",
    ].join("\n");

    const output = prepareSilentVideoPromptForExternalAudio(input);

    expect(output).toContain("Continuity Lock: same Thai presenter.");
    expect(output).toContain("Background Visuals: non-readable AI dashboard graphics.");
    expect(output).toContain("No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame");
    expect(output).not.toContain("Audio Cue:");
    expect(output).not.toContain("Speaker:");
    expect(output).not.toContain("Xiaomi เปิดตัว MiMo");
    expect(output).not.toContain("Sound Design:");
    expect(output).not.toContain("no speech");
    expect(output).not.toContain("no dialogue");
    expect(output).not.toContain("no music, no sound effects");
    expect(output).not.toContain("External audio workflow");
  });

  it("removes compact no-speech text restriction lines from external-audio video prompts", () => {
    const input = [
      "Continuity Lock: no visible person.",
      "Visual action: The camera moves through a luxury lobby.",
      "No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no random glyphs, no narrator, no speech.",
    ].join("\n");

    const output = prepareSilentVideoPromptForExternalAudio(input);

    expect(output).toBe([
      "Continuity Lock: no visible person.",
      "Visual action: The camera moves through a luxury lobby.",
      "No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no random glyphs.",
    ].join("\n"));
    expect(output).not.toMatch(/\bno narrator|no speech|no dialogue\b/i);
  });

  it("removes external audio control instructions instead of passing them to the video model", () => {
    const input = [
      "Continuity Lock: same presenter.",
      "Background Visuals: text-free AI workflow.",
      "External audio workflow: create visual-only footage. Do not generate speech, dialogue, narration, music, sound effects, subtitles, captions, lower-thirds, readable text, logos with letters, or random glyphs. The final voiceover and music will be added later in the video editor.",
    ].join("\n");

    const output = prepareSilentVideoPromptForExternalAudio(input);
    expect(output).toBe([
      "Continuity Lock: same presenter.",
      "Background Visuals: text-free AI workflow.",
    ].join("\n"));
    expect(output).not.toContain("External audio workflow:");
    expect(output).not.toContain("Visual-only footage for external voiceover:");
    expect(output).not.toContain("Do not generate speech, dialogue, narration, music, sound effects");
  });

  it("removes speech wording from visual action without adding audio control text", () => {
    const input = [
      "A presenter-style news clip.",
      "Visual action: The presenter gestures while speaking to camera.",
      "Background Visuals: newsroom backdrop.",
    ].join("\n");

    const output = prepareSilentVideoPromptForExternalAudio(input);

    expect(output).toContain("A presenter-style news clip.");
    expect(output).toContain("Visual action: The presenter gestures with natural presenter gestures to camera.");
    expect(output).toContain("Background Visuals: newsroom backdrop.");
    expect(output).not.toMatch(/\bspeak|speech|dialogue|audio|voiceover|mute|sound/i);
  });

  it("preserves multi-video prompt markers when preparing display text for external audio", () => {
    const input = [
      "PROMPT 1 (8 seconds):",
      "Continuity Lock: same anchor.",
      "Audio Cue: A serious news voice.",
      "Speaker: Anchor",
      "The presenter speaks in English: \"OpenAI updated Codex CLI.\"",
      "Background Visuals: text-free software workflow icons.",
      "",
      "PROMPT 2 (8 seconds):",
      "Continuity Lock: same anchor.",
      "Speech Delivery: crisp news cadence.",
      "The presenter speaks in English: \"The release improves agent workflows.\"",
      "Background Visuals: text-free agent workflow diagram.",
    ].join("\n");

    const output = prepareSilentVideoPromptDisplayForExternalAudio(input);

    expect(output).toContain("PROMPT 1 (8 seconds):");
    expect(output).toContain("PROMPT 2 (8 seconds):");
    expect(output).toContain("Background Visuals: text-free software workflow icons.");
    expect(output).toContain("Background Visuals: text-free agent workflow diagram.");
    expect(output).not.toContain("Audio Cue:");
    expect(output).not.toContain("Speaker:");
    expect(output).not.toContain("OpenAI updated Codex CLI");
    expect(output).not.toContain("Speech Delivery:");
  });
});
