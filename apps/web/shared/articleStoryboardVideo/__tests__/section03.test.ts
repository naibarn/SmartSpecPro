import { describe, expect, it } from "vitest";
import {
  applyArticleStoryboardReferenceChange,
  autoSelectArticleStoryboardSceneReferences,
  buildArticleStoryboardAudioPolicy,
  buildArticleStoryboardReferenceCandidateInput,
  buildArticleStoryboardReferenceCandidatePrompt,
  buildArticleStoryboardSeedancePromptInput,
  buildArticleStoryboardSeedancePromptText,
  buildArticleStoryboardVideoShotPlans,
  buildArticleStorytellingVoiceScript,
  createEmptyArticleStoryboardCandidateSheet,
  markArticleStoryboardCandidateSheetFailed,
  markArticleStoryboardCandidateSheetGenerating,
  preserveCharacterReferencesOnRepair,
  splitArticleStoryboard3x3Sheet,
  updateArticleStoryboardSelectedSceneReferences,
  type ArticleStoryboardReferenceImage,
} from "../index";

const characterReference: ArticleStoryboardReferenceImage = {
  id: "char-1",
  url: "https://cdn.example.com/character.png",
  source: "character",
  safetyStatus: "approved",
  confirmed: true,
};

function buildShot() {
  return buildArticleStoryboardVideoShotPlans({
    pages: [{ id: "page-1", pageNumber: 1, title: "เทรนด์ใหม่", body: "เนื้อหาบทความสำหรับเล่าเรื่อง" }],
    selectedReferenceImagesByPageId: {
      "page-1": [{ id: "scene-1", url: "https://cdn.example.com/scene.jpg", source: "generated_3x3" }],
    },
    characterReferenceImagesByPageId: { "page-1": [characterReference] },
  })[0]!;
}

describe("article storyboard video reference candidates", () => {
  it("moves candidate sheet through empty, generating, ready, failed, and stale-style states", () => {
    const empty = createEmptyArticleStoryboardCandidateSheet(buildShot());
    expect(empty.status).toBe("empty");
    expect(markArticleStoryboardCandidateSheetGenerating(empty).status).toBe("generating");

    const ready = splitArticleStoryboard3x3Sheet({
      sheetId: "sheet-1",
      shotId: "shot-1",
      pageId: "page-1",
      imageUrl: "https://cdn.example.com/sheet.jpg",
    });
    expect(ready.status).toBe("ready");
    expect(ready.candidates).toHaveLength(9);

    const failed = markArticleStoryboardCandidateSheetFailed(ready, "provider failed");
    expect(failed.status).toBe("failed");
    expect(failed.errorMessage).toBe("provider failed");
  });

  it("auto-selects 1-5 scene frames and supports user adjustment", () => {
    const sheet = splitArticleStoryboard3x3Sheet({
      sheetId: "sheet-1",
      shotId: "shot-1",
      pageId: "page-1",
      imageUrl: "https://cdn.example.com/sheet.jpg",
    });
    expect(autoSelectArticleStoryboardSceneReferences(sheet, 8)).toHaveLength(5);
    expect(autoSelectArticleStoryboardSceneReferences(sheet, 0)).toHaveLength(1);

    const adjusted = updateArticleStoryboardSelectedSceneReferences(sheet, [
      sheet.candidates[5]!.id,
      sheet.candidates[3]!.id,
      "missing",
    ]);
    expect(adjusted.selectedReferenceIds).toEqual([sheet.candidates[5]!.id, sheet.candidates[3]!.id]);
  });

  it("preserves character references when repairing a sheet or prompt", () => {
    const previous = buildShot();
    const repaired = { ...previous, characterReferenceImages: [], selectedReferenceImages: [] };
    expect(preserveCharacterReferencesOnRepair(previous, repaired).characterReferenceImages).toEqual([characterReference]);
  });

  it("stales candidate sheet for character changes but only prompt for scene changes", () => {
    const shot = buildShot();
    expect(applyArticleStoryboardReferenceChange(shot, "character_references").stale).toEqual({
      candidateSheet: true,
      videoPrompt: true,
    });
    expect(applyArticleStoryboardReferenceChange(shot, "selected_scene_references").stale).toEqual({
      candidateSheet: false,
      videoPrompt: true,
    });
  });
});

describe("article storyboard video prompting", () => {
  it("builds candidate input with page intent and character references", () => {
    const input = buildArticleStoryboardReferenceCandidateInput(buildShot());
    expect(input.articleTitle).toBe("เทรนด์ใหม่");
    expect(input.characterReferenceImages).toEqual([characterReference]);
  });

  it("builds reviewable prompts for the 3x3 sheet and video shot", () => {
    const shot = buildShot();
    const imagePrompt = buildArticleStoryboardReferenceCandidatePrompt(shot);
    const videoPrompt = buildArticleStoryboardSeedancePromptText({
      shot,
      audioResolution: {
        requested: "separate_tts_voiceover",
        resolved: "separate_tts_voiceover",
        reasonCode: "ok",
        message: "ok",
        nativeAudioAllowed: false,
        separateTtsAllowed: true,
        fallbackOffered: [],
      },
    });

    expect(imagePrompt).toContain("3x3 reference image candidate sheet");
    expect(imagePrompt).toContain("https://cdn.example.com/character.png");
    expect(videoPrompt).toContain("Create a moving video shot");
    expect(videoPrompt).toContain("CSS overlay text is added later");
  });

  it("separates character and scene references for the Seedance adapter", () => {
    const promptInput = buildArticleStoryboardSeedancePromptInput({
      shot: buildShot(),
      audioResolution: {
        requested: "separate_tts_voiceover",
        resolved: "separate_tts_voiceover",
        reasonCode: "ok",
        message: "ok",
        nativeAudioAllowed: false,
        separateTtsAllowed: true,
        fallbackOffered: [],
      },
    });

    expect(promptInput.skillId).toBe("seedance-multishot-review");
    expect(promptInput.sceneReferenceImages).toHaveLength(1);
    expect(promptInput.characterReferenceImages).toEqual([characterReference]);
    expect(promptInput.audioPolicy).toContain("silent visual-only");
    expect(promptInput.overlayInstruction).toContain("Do not draw");
  });

  it("includes speech lines only for native video audio", () => {
    const separate = buildArticleStoryboardAudioPolicy({
      audioResolution: {
        requested: "separate_tts_voiceover",
        resolved: "separate_tts_voiceover",
        reasonCode: "ok",
        message: "ok",
        nativeAudioAllowed: true,
        separateTtsAllowed: true,
        fallbackOffered: [],
      },
      scriptSegments: [{ shotId: "s1", pageId: "p1", speaker: "A", text: "สวัสดี" }],
    });
    expect(separate.nativeSpeechLines).toEqual([]);

    const native = buildArticleStoryboardAudioPolicy({
      audioResolution: {
        requested: "native_video_audio",
        resolved: "native_video_audio",
        reasonCode: "ok",
        message: "ok",
        nativeAudioAllowed: true,
        separateTtsAllowed: true,
        fallbackOffered: [],
      },
      scriptSegments: [{ shotId: "s1", pageId: "p1", speaker: "A", text: "สวัสดี" }],
    });
    expect(native.nativeSpeechLines).toEqual(["A: สวัสดี"]);
  });

  it("builds single-narrator and two-speaker storytelling scripts mapped to shots", () => {
    const shot = buildShot();
    const single = buildArticleStorytellingVoiceScript({
      shots: [shot],
      language: "th-TH",
      voiceConfig: {
        mode: "single_narrator",
        speakers: [{ speaker: "ผู้บรรยาย", voiceId: "TH-KantapongPremiumHD" }],
      },
    });
    expect(single.segments).toHaveLength(1);
    expect(single.segments[0]?.shotId).toBe(shot.id);

    const dialogue = buildArticleStorytellingVoiceScript({
      shots: [shot],
      language: "th-TH",
      voiceConfig: {
        mode: "two_speaker_dialogue",
        speakers: [
          { speaker: "พิธีกรชาย", voiceId: "TH-KantapongPremiumHD" },
          { speaker: "ผู้ช่วยหญิง", voiceId: "TH-FemaleVoiceID" },
        ],
      },
    });
    expect(dialogue.segments).toHaveLength(2);
    expect(dialogue.segments.map((segment) => segment.speaker)).toEqual(["พิธีกรชาย", "ผู้ช่วยหญิง"]);
  });
});
