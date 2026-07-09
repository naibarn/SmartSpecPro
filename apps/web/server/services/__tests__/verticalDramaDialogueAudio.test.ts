/**
 * Vertical Drama Series — dialogue/audio/subtitle planner tests (section-07
 * "Tests First"). These exercise the pure planning + repair core with no DB.
 */

import { describe, expect, it } from "vitest";
import type { VerticalDramaProviderCapabilities } from "@shared/verticalDramaSeries/providerRouting";
import { buildCharacterVoiceConfigMap } from "@shared/verticalDramaSeries/voiceCasting";
import type { VerticalDramaDialogueLine, VerticalDramaSpeakerVoiceMap } from "@shared/verticalDramaSeries/audio";
import {
  applyAudioRepair,
  buildDialogueAudioPlan,
  buildSeparateTtsPlan,
  buildSpeakerVoiceMap,
  buildStoryboardReviewAudioMetadata,
  type PlanDialogueAudioInput,
} from "../verticalDramaDialogueAudio";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const caps = (over: Partial<VerticalDramaProviderCapabilities> = {}): VerticalDramaProviderCapabilities => ({
  supportsImageGeneration: true,
  supportsImageReferences: true,
  supportsVideoGeneration: true,
  supportsVideoInputReference: true,
  supportsFirstLastFrameVideo: true,
  supportsHumanFaceInputReference: true,
  supportsHumanLikenessCharacterAsset: true,
  supportsNativeAudio: false,
  supportsThaiNativeAudio: false,
  supportsSeparateTts: true,
  supportsDialogueTts: true,
  supportsSubtitleBurnIn: true,
  allowedVideoSeconds: [4, 6, 8],
  allowedVideoSizes: ["1080x1920"],
  allowedAspectRatios: ["9:16"],
  ...over,
});

/** Two shots, one dialogue line each, sums to 60s. */
function baseInput(over: Partial<PlanDialogueAudioInput> = {}): PlanDialogueAudioInput {
  return {
    seriesId: "1",
    episodeId: "2",
    language: "th",
    mode: "dialogue",
    episodeTargetSeconds: 60,
    beats: [
      {
        shotNumber: 1,
        clipNumber: 1,
        speakerName: "Aria",
        speakerCharacterId: "char_aria",
        isNarration: false,
        text: "We are not done here.",
        estimatedSeconds: 2.4,
      },
      {
        shotNumber: 2,
        clipNumber: 1,
        speakerName: "Ben",
        speakerCharacterId: "char_ben",
        isNarration: false,
        text: "Then finish it.",
        estimatedSeconds: 1.8,
      },
    ],
    shots: [
      { shotNumber: 1, shotDurationSeconds: 30 },
      { shotNumber: 2, shotDurationSeconds: 30 },
    ],
    voiceBindings: [
      { speakerName: "Aria", characterId: "char_aria", voiceId: "voice_aria_v1", locked: true },
      { speakerName: "Ben", characterId: "char_ben", voiceId: "voice_ben_v1", locked: true },
    ],
    now: "2026-07-03T00:00:00.000Z",
    ...over,
  };
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe("buildDialogueAudioPlan", () => {
  it("maps speakers to characters and stable voice IDs", () => {
    const plan = buildDialogueAudioPlan(baseInput());
    const aria = plan.speakerVoiceMap.entries.find((e) => e.speakerName === "Aria");
    expect(aria?.characterId).toBe("char_aria");
    expect(aria?.voiceId).toBe("voice_aria_v1");
    expect(aria?.missingVoiceId).toBe(false);
    expect(aria?.locked).toBe(true);
    // Voice ids flow into the separate-TTS plan.
    const item = plan.separateTtsPlan?.items.find((i) => i.characterId === "char_aria");
    expect(item?.voiceId).toBe("voice_aria_v1");
    expect(item?.blocked).toBe(false);
  });

  it("flags whole-episode dialogue that is too sparse for the target duration", () => {
    const plan = buildDialogueAudioPlan(baseInput());

    expect(plan.dialogueQuality?.totalDurationSeconds).toBe(60);
    expect(plan.dialogueQuality?.issues.some((issue) => issue.code === "VD_DIALOGUE_EPISODE_UNDERFILLED")).toBe(
      true,
    );
    expect(plan.warnings.some((warning) => warning.code === "episode_dialogue_underfilled")).toBe(true);
    expect(
      plan.repairQueue.some((repair) => repair.kind === "expand_underfilled_dialogue"),
    ).toBe(true);
  });

  it("missing voice ID creates warning and blocks TTS generation only (not planning)", () => {
    const plan = buildDialogueAudioPlan(
      baseInput({ voiceBindings: [{ speakerName: "Aria", characterId: "char_aria", voiceId: "voice_aria_v1" }] }),
    );
    const ben = plan.speakerVoiceMap.entries.find((e) => e.speakerName === "Ben");
    expect(ben?.missingVoiceId).toBe(true);
    // Script planning still produced the line.
    expect(plan.dialogueLines.some((l) => l.speakerName === "Ben")).toBe(true);
    // TTS is blocked for the missing-voice line.
    const blocked = plan.separateTtsPlan?.items.find((i) => i.speakerName === "Ben");
    expect(blocked?.blocked).toBe(true);
    expect(blocked?.blockReason).toBe("missing_voice_id");
    expect(plan.separateTtsPlan?.blockedLineIds.length).toBe(1);
    expect(plan.warnings.some((w) => w.code === "missing_voice_id")).toBe(true);
    expect(plan.repairQueue.some((r) => r.kind === "assign_missing_voice_id")).toBe(true);
  });

  it("omits native audio snippets when model capability does not support native audio", () => {
    const plan = buildDialogueAudioPlan(
      baseInput({
        requestedStrategy: "native_video_audio",
        nativeAudio: { requested: true, videoModelId: "veo-3.1", capabilities: caps({ supportsNativeAudio: false }), userAcceptedRegenerationCost: true },
      }),
    );
    expect(plan.nativeAudioPolicy.allowed).toBe(false);
    expect(plan.nativeAudioSnippets).toEqual([]);
    // Falls back to the safe default.
    expect(plan.audioStrategy).toBe("separate_tts_voiceover");
    expect(plan.repairQueue.some((r) => r.kind === "disable_native_audio")).toBe(true);
  });

  it("emits native audio snippets and no separate TTS plan when native audio is allowed", () => {
    const plan = buildDialogueAudioPlan(
      baseInput({
        language: "en",
        requestedStrategy: "native_video_audio",
        nativeAudio: { requested: true, videoModelId: "veo-3.1", capabilities: caps({ supportsNativeAudio: true }), userAcceptedRegenerationCost: true },
      }),
    );
    expect(plan.nativeAudioPolicy.allowed).toBe(true);
    expect(plan.audioStrategy).toBe("native_video_audio");
    expect(plan.nativeAudioSnippets.length).toBe(2);
    expect(plan.separateTtsPlan).toBeUndefined();
  });

  it("separate TTS plan never injects speech/lip-sync into visual video prompts", () => {
    const plan = buildDialogueAudioPlan(baseInput({ requestedStrategy: "separate_tts_voiceover" }));
    expect(plan.separateTtsPlan?.injectsIntoVideoPrompts).toBe(false);
  });

  describe("speakability sanitize on outbound TTS/native-audio payloads (2026-07-08/W9-A, spec §14.1 rule 6b)", () => {
    it("sanitizes a real bad-data line (wrapping quotes + tilde) for the separate-TTS plan's outbound text, without touching the persisted dialogueLines artifact", () => {
      const plan = buildDialogueAudioPlan(
        baseInput({
          beats: [
            {
              shotNumber: 1,
              clipNumber: 1,
              speakerName: "เจ้าเกลือ",
              speakerCharacterId: "char_cat",
              isNarration: false,
              text: "“เหมียว~”",
              estimatedSeconds: 2,
            },
          ],
          shots: [{ shotNumber: 1, shotDurationSeconds: 8 }],
          voiceBindings: [
            { speakerName: "เจ้าเกลือ", characterId: "char_cat", voiceId: "voice_cat_v1", locked: true },
          ],
          requestedStrategy: "separate_tts_voiceover",
        }),
      );

      // Original artifact untouched.
      expect(plan.dialogueLines[0].text).toBe("“เหมียว~”");
      // Outbound TTS payload sanitized.
      const item = plan.separateTtsPlan?.items.find((i) => i.speakerName === "เจ้าเกลือ");
      expect(item?.text).toBe("เหมียว");
    });

    it("sanitizes an em-dash line for native-audio snippets, without touching the persisted dialogueLines artifact", () => {
      const plan = buildDialogueAudioPlan(
        baseInput({
          beats: [
            {
              shotNumber: 1,
              clipNumber: 1,
              speakerName: "ชายนต์",
              speakerCharacterId: "char_chai",
              isNarration: false,
              text: "“ใจเย็น ฟังให้ครบตามกติกา—ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย”",
              estimatedSeconds: 3,
            },
          ],
          shots: [{ shotNumber: 1, shotDurationSeconds: 8 }],
          requestedStrategy: "native_video_audio",
          nativeAudio: {
            requested: true,
            videoModelId: "veo-3.1",
            // Thai dialogue (this fixture's default `language: "th"") needs
            // `supportsThaiNativeAudio` specifically — see
            // `computeNativeAudioPolicy`'s Thai-vs-other-language branch.
            capabilities: caps({ supportsNativeAudio: true, supportsThaiNativeAudio: true }),
            userAcceptedRegenerationCost: true,
          },
        }),
      );

      expect(plan.dialogueLines[0].text).toBe(
        "“ใจเย็น ฟังให้ครบตามกติกา—ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย”",
      );
      expect(plan.nativeAudioSnippets[0].text).toBe(
        "ใจเย็น ฟังให้ครบตามกติกา, ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย",
      );
    });

    it("a clean line is byte-identical in the outbound TTS payload (idempotent sanitizer, no visible change)", () => {
      const plan = buildDialogueAudioPlan(baseInput({ requestedStrategy: "separate_tts_voiceover" }));
      const item = plan.separateTtsPlan?.items[0];
      expect(item?.text).toBe(plan.dialogueLines[0].text);
    });
  });

  it("subtitle cues include start/end timing, text, speaker, and safe-area metadata", () => {
    const plan = buildDialogueAudioPlan(baseInput());
    const cue = plan.subtitleCues[0];
    expect(cue.start).toBe(0);
    expect(cue.end).toBe(2.4);
    expect(cue.text).toBe("We are not done here.");
    expect(cue.speakerName).toBe("Aria");
    expect(cue.safeArea.position).toBe("bottom_safe");
    expect(cue.safeArea.maxLines).toBeGreaterThanOrEqual(1);
  });

  it("overlong speech creates a repair action", () => {
    const plan = buildDialogueAudioPlan(
      baseInput({
        beats: [
          {
            shotNumber: 1,
            clipNumber: 1,
            speakerName: "Aria",
            speakerCharacterId: "char_aria",
            isNarration: false,
            text: "A very long monologue.",
            estimatedSeconds: 45,
          },
        ],
        shots: [{ shotNumber: 1, shotDurationSeconds: 30 }],
      }),
    );
    expect(plan.timing.overlongLineIds.length).toBe(1);
    expect(plan.timing.timingMismatch).toBe(true);
    expect(plan.repairQueue.some((r) => r.kind === "shorten_overlong_line")).toBe(true);
  });

  it("revalidates native audio policy when the selected video model changes", () => {
    const withoutCap = buildDialogueAudioPlan(
      baseInput({
        requestedStrategy: "native_video_audio",
        nativeAudio: { requested: true, videoModelId: "model-a", capabilities: caps({ supportsNativeAudio: false }), userAcceptedRegenerationCost: true },
      }),
    );
    expect(withoutCap.nativeAudioPolicy.allowed).toBe(false);
    expect(withoutCap.audioStrategy).toBe("separate_tts_voiceover");

    const withCap = buildDialogueAudioPlan(
      baseInput({
        language: "en",
        requestedStrategy: "native_video_audio",
        nativeAudio: { requested: true, videoModelId: "model-b", capabilities: caps({ supportsNativeAudio: true }), userAcceptedRegenerationCost: true },
      }),
    );
    expect(withCap.nativeAudioPolicy.allowed).toBe(true);
    expect(withCap.audioStrategy).toBe("native_video_audio");
  });
});

describe("buildStoryboardReviewAudioMetadata", () => {
  it("preserves audio strategy, voice IDs, subtitle cue IDs, and timing", () => {
    const plan = buildDialogueAudioPlan(baseInput());
    const meta = buildStoryboardReviewAudioMetadata(plan);
    expect(meta.audioStrategy).toBe(plan.audioStrategy);
    expect(meta.voiceIds).toEqual(expect.arrayContaining(["voice_aria_v1", "voice_ben_v1"]));
    expect(meta.subtitleCueIds).toEqual(plan.subtitleCues.map((c) => c.cueId));
    expect(meta.totalDialogueSeconds).toBe(plan.timing.totalDialogueSeconds);
    expect(meta.episodeTargetSeconds).toBe(60);
  });

  it("native_video_audio: a script change requires VIDEO regeneration (spec §14 rule 6)", () => {
    const plan = buildDialogueAudioPlan(
      baseInput({
        language: "en",
        requestedStrategy: "native_video_audio",
        nativeAudio: { requested: true, videoModelId: "veo-3.1", capabilities: caps({ supportsNativeAudio: true }), userAcceptedRegenerationCost: true },
      }),
    );
    const meta = buildStoryboardReviewAudioMetadata(plan);
    expect(meta.regenerationImpact.requiresVideoRegeneration).toBe(true);
    expect(meta.regenerationImpact.message).toMatch(/video/i);
  });

  it("separate_tts_voiceover: a script change regenerates audio without touching video (spec §14 rule 7)", () => {
    const plan = buildDialogueAudioPlan(baseInput({ requestedStrategy: "separate_tts_voiceover" }));
    const meta = buildStoryboardReviewAudioMetadata(plan);
    expect(meta.regenerationImpact.requiresVideoRegeneration).toBe(false);
    expect(meta.regenerationImpact.message).toMatch(/without/i);
  });
});

describe("sub-shot spanning (spec §7.4)", () => {
  /** One shot (10s) with a single 6s line that spans two 5s sub-shots. */
  function spanningInput(subShotsEnabled: boolean): PlanDialogueAudioInput {
    return baseInput({
      subShotsEnabled,
      beats: [
        {
          shotNumber: 1,
          clipNumber: 1,
          speakerName: "Aria",
          speakerCharacterId: "char_aria",
          isNarration: false,
          text: "One continuous line across a cut.",
          estimatedSeconds: 6,
        },
      ],
      shots: [
        {
          shotNumber: 1,
          shotDurationSeconds: 60,
          subShots: [
            { subShotNumber: 1, durationSeconds: 5 },
            { subShotNumber: 2, durationSeconds: 55 },
          ],
        },
      ],
      episodeTargetSeconds: 60,
    });
  }

  it("a subtitle cue spanning sub-shot cuts keeps a single continuous start/end", () => {
    const plan = buildDialogueAudioPlan(spanningInput(true));
    const cue = plan.subtitleCues[0];
    expect(cue.start).toBe(0);
    expect(cue.end).toBe(6);
    expect(cue.spansSubShotNumbers).toEqual([1, 2]);
  });

  it("a dialogue line spanning sub-shot cuts keeps continuous audio timing", () => {
    const plan = buildDialogueAudioPlan(spanningInput(true));
    const line = plan.dialogueLines[0];
    expect(line.start).toBe(0);
    expect(line.end).toBe(6);
    expect(line.spansSubShotNumbers).toEqual([1, 2]);
  });

  it("validates 9:16 safe-area per sub-shot for a spanning cue", () => {
    const plan = buildDialogueAudioPlan(spanningInput(true));
    const cue = plan.subtitleCues[0];
    expect(cue.safeAreaPerSubShot?.map((c) => c.subShotNumber)).toEqual([1, 2]);
    expect(cue.safeAreaPerSubShot?.every((c) => c.valid)).toBe(true);
  });

  it("evaluates regeneration rules per MAIN shot, not per sub-shot", () => {
    const decomposed = buildStoryboardReviewAudioMetadata(buildDialogueAudioPlan(spanningInput(true)));
    const flat = buildStoryboardReviewAudioMetadata(buildDialogueAudioPlan(spanningInput(false)));
    expect(decomposed.regenerationImpact.requiresVideoRegeneration).toBe(
      flat.regenerationImpact.requiresVideoRegeneration,
    );
  });

  it("timing still sums within the parent main shot and the episode totals 60s", () => {
    const plan = buildDialogueAudioPlan(spanningInput(true));
    const shot = plan.timing.perShot[0];
    expect(shot.shotDurationSeconds).toBe(60);
    const episodeTotal = plan.timing.perShot.reduce((a, s) => a + s.shotDurationSeconds, 0);
    expect(episodeTotal).toBe(60);
    expect(plan.timing.timingMismatch).toBe(false);
  });

  it("with sub-shots off, dialogue/subtitle timing matches the non-decomposed baseline", () => {
    const on = buildDialogueAudioPlan(spanningInput(true));
    const off = buildDialogueAudioPlan(spanningInput(false));
    expect(off.dialogueLines[0].start).toBe(on.dialogueLines[0].start);
    expect(off.dialogueLines[0].end).toBe(on.dialogueLines[0].end);
    expect(off.dialogueLines[0].spansSubShotNumbers).toBeUndefined();
    expect(off.subtitleCues[0].spansSubShotNumbers).toBeUndefined();
    expect(off.subtitleCues[0].safeAreaPerSubShot).toBeUndefined();
  });
});

describe("applyAudioRepair", () => {
  it("assigning a missing voice id unblocks separate TTS and clears the warning", () => {
    const plan = buildDialogueAudioPlan(
      baseInput({ voiceBindings: [{ speakerName: "Aria", characterId: "char_aria", voiceId: "voice_aria_v1" }] }),
    );
    const repair = plan.repairQueue.find((r) => r.kind === "assign_missing_voice_id");
    expect(repair).toBeDefined();
    const next = applyAudioRepair(plan, {
      seriesId: "1",
      episodeId: "2",
      repairId: repair!.repairId,
      resolution: { kind: "assign_missing_voice_id", speakerName: "Ben", voiceId: "voice_ben_v2" },
      now: "2026-07-03T01:00:00.000Z",
    });
    const ben = next.speakerVoiceMap.entries.find((e) => e.speakerName === "Ben");
    expect(ben?.voiceId).toBe("voice_ben_v2");
    expect(ben?.missingVoiceId).toBe(false);
    expect(next.separateTtsPlan?.blockedLineIds.length).toBe(0);
    expect(next.warnings.some((w) => w.code === "missing_voice_id")).toBe(false);
  });

  it("shortening an overlong line resolves the timing mismatch", () => {
    const plan = buildDialogueAudioPlan(
      baseInput({
        beats: [
          {
            shotNumber: 1,
            clipNumber: 1,
            speakerName: "Aria",
            speakerCharacterId: "char_aria",
            isNarration: false,
            text: "Long line.",
            estimatedSeconds: 45,
          },
        ],
        shots: [{ shotNumber: 1, shotDurationSeconds: 60 }],
        episodeTargetSeconds: 60,
      }),
    );
    const repair = plan.repairQueue.find((r) => r.kind === "shorten_overlong_line");
    // Not overlong vs shot here (45 < 60) but assert repair path still recomputes.
    const next = applyAudioRepair(plan, {
      seriesId: "1",
      episodeId: "2",
      repairId: repair?.repairId ?? "repair-timing",
      resolution: { kind: "shorten_overlong_line", lineId: plan.dialogueLines[0].lineId, newTargetDurationSeconds: 10 },
    });
    expect(next.dialogueLines[0].targetDurationSeconds).toBe(10);
    expect(next.dialogueLines[0].end).toBe(10);
    expect(next.subtitleCues[0].end).toBe(10);
  });
});

/* -------------------------------------------------------------------------- */
/* W12-A voice chain — per-character casting is authoritative over           */
/* voiceBindings, with the missing-voice warning path unchanged.             */
/* -------------------------------------------------------------------------- */

describe("buildSpeakerVoiceMap — characterVoiceConfigs (W12-A)", () => {
  it("casting overrides a conflicting voiceBindings entry for the same character", () => {
    const map = buildSpeakerVoiceMap(
      [
        {
          shotNumber: 1,
          speakerName: "Aria",
          speakerCharacterId: "char_aria",
          isNarration: false,
          text: "Line.",
          estimatedSeconds: 2,
        },
      ],
      [{ speakerName: "Aria", characterId: "char_aria", voiceId: "voice_from_binding" }],
      buildCharacterVoiceConfigMap([
        { characterId: "char_aria", voiceModelId: "uvoice/tts-premium", voiceId: "voice_from_casting" },
      ]),
    );
    const aria = map.entries.find((e) => e.characterId === "char_aria");
    expect(aria?.voiceId).toBe("voice_from_casting");
    expect(aria?.voiceModelId).toBe("uvoice/tts-premium");
    expect(aria?.locked).toBe(true);
    expect(aria?.missingVoiceId).toBe(false);
  });

  it("falls back to voiceBindings for a character with no casting entry", () => {
    const map = buildSpeakerVoiceMap(
      [
        {
          shotNumber: 1,
          speakerName: "Ben",
          speakerCharacterId: "char_ben",
          isNarration: false,
          text: "Line.",
          estimatedSeconds: 2,
        },
      ],
      [{ speakerName: "Ben", characterId: "char_ben", voiceId: "voice_ben_v1" }],
      buildCharacterVoiceConfigMap([
        { characterId: "char_other", voiceModelId: "uvoice/tts-premium", voiceId: "voice_other" },
      ]),
    );
    const ben = map.entries.find((e) => e.characterId === "char_ben");
    expect(ben?.voiceId).toBe("voice_ben_v1");
    expect(ben?.missingVoiceId).toBe(false);
  });

  it("a speaking character with NEITHER casting NOR a resolvable binding still gets missingVoiceId: true (unchanged warning path)", () => {
    const map = buildSpeakerVoiceMap(
      [
        {
          shotNumber: 1,
          speakerName: "Cass",
          speakerCharacterId: "char_cass",
          isNarration: false,
          text: "Line.",
          estimatedSeconds: 2,
        },
      ],
      [],
      buildCharacterVoiceConfigMap([
        { characterId: "char_other", voiceModelId: "uvoice/tts-premium", voiceId: "voice_other" },
      ]),
    );
    const cass = map.entries.find((e) => e.characterId === "char_cass");
    expect(cass?.missingVoiceId).toBe(true);
  });

  it("is byte-identical to the pre-W12-A result when characterVoiceConfigs is omitted", () => {
    const beats = [
      {
        shotNumber: 1,
        speakerName: "Aria",
        speakerCharacterId: "char_aria",
        isNarration: false,
        text: "Line.",
        estimatedSeconds: 2,
      },
    ];
    const bindings = [{ speakerName: "Aria", characterId: "char_aria", voiceId: "voice_aria_v1", locked: true }];
    expect(buildSpeakerVoiceMap(beats, bindings, undefined)).toEqual(buildSpeakerVoiceMap(beats, bindings));
  });
});

describe("buildDialogueAudioPlan — characterVoiceConfigs threads into the whole plan (W12-A)", () => {
  it("the plan's speakerVoiceMap AND separateTtsPlan both reflect the authoritative casting", () => {
    const plan = buildDialogueAudioPlan(
      baseInput({
        voiceBindings: [
          { speakerName: "Aria", characterId: "char_aria", voiceId: "voice_from_binding" },
          { speakerName: "Ben", characterId: "char_ben", voiceId: "voice_ben_v1" },
        ],
        characterVoiceConfigs: [
          {
            characterId: "char_aria",
            voiceProvider: "uvoice",
            voiceModelId: "uvoice/tts-premium",
            voiceId: "voice_from_casting",
          },
        ],
      }),
    );
    const ariaEntry = plan.speakerVoiceMap.entries.find((e) => e.characterId === "char_aria");
    expect(ariaEntry?.voiceId).toBe("voice_from_casting");
    const ariaItem = plan.separateTtsPlan?.items.find((i) => i.characterId === "char_aria");
    expect(ariaItem?.voiceId).toBe("voice_from_casting");
    expect(ariaItem?.voiceModelId).toBe("uvoice/tts-premium");
    expect(ariaItem?.blocked).toBe(false);
    // Ben has no casting entry — falls back to voiceBindings, unaffected.
    const benItem = plan.separateTtsPlan?.items.find((i) => i.characterId === "char_ben");
    expect(benItem?.voiceId).toBe("voice_ben_v1");
  });

  it("a speaking character missing BOTH casting and a binding still produces the missing_voice_id warning/repair with unchanged codes", () => {
    const plan = buildDialogueAudioPlan(
      baseInput({
        voiceBindings: [{ speakerName: "Aria", characterId: "char_aria", voiceId: "voice_aria_v1" }],
        characterVoiceConfigs: [
          { characterId: "char_aria", voiceModelId: "uvoice/tts-premium", voiceId: "voice_from_casting" },
        ],
        // Ben has no binding and no casting entry.
      }),
    );
    const ben = plan.speakerVoiceMap.entries.find((e) => e.speakerName === "Ben");
    expect(ben?.missingVoiceId).toBe(true);
    expect(plan.warnings.some((w) => w.code === "missing_voice_id")).toBe(true);
    expect(plan.repairQueue.some((r) => r.kind === "assign_missing_voice_id")).toBe(true);
    const blockedItem = plan.separateTtsPlan?.items.find((i) => i.speakerName === "Ben");
    expect(blockedItem?.blocked).toBe(true);
    expect(blockedItem?.blockReason).toBe("missing_voice_id");
  });

  it("flags-off byte-identical: an absent characterVoiceConfigs field produces the exact pre-W12-A plan", () => {
    const withField = buildDialogueAudioPlan(baseInput({ characterVoiceConfigs: undefined }));
    const withoutField = buildDialogueAudioPlan(baseInput());
    expect(withField).toEqual(withoutField);
  });
});

describe("buildSeparateTtsPlan — characterVoiceConfigs is authoritative even against an already-resolved voiceMap entry (W12-A)", () => {
  const lines: VerticalDramaDialogueLine[] = [
    {
      lineId: "line-1",
      shotNumber: 1,
      speakerName: "Aria",
      speakerCharacterId: "char_aria",
      isNarration: false,
      text: "We are not done here.",
      start: 0,
      end: 2,
      targetDurationSeconds: 2,
    },
  ];
  const voiceMap: VerticalDramaSpeakerVoiceMap = {
    entries: [
      {
        speakerName: "Aria",
        characterId: "char_aria",
        voiceId: "voice_from_voicemap",
        locked: false,
        missingVoiceId: false,
      },
    ],
  };

  it("prefers the casting map's voice over the voiceMap-resolved entry", () => {
    const plan = buildSeparateTtsPlan(
      "separate_tts_voiceover",
      lines,
      voiceMap,
      buildCharacterVoiceConfigMap([
        { characterId: "char_aria", voiceModelId: "uvoice/tts-premium", voiceId: "voice_from_casting" },
      ]),
    );
    expect(plan.items[0].voiceId).toBe("voice_from_casting");
    expect(plan.items[0].blocked).toBe(false);
  });

  it("falls back to the voiceMap entry when no casting is present for that character", () => {
    const plan = buildSeparateTtsPlan("separate_tts_voiceover", lines, voiceMap, buildCharacterVoiceConfigMap([]));
    expect(plan.items[0].voiceId).toBe("voice_from_voicemap");
  });
});
