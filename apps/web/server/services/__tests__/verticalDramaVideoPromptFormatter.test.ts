/**
 * Vertical Drama Storyboard Completion Plan — Phase 3.3 unit coverage for
 * `verticalDramaVideoPromptFormatter.ts`'s `formatVideoClipRequest`.
 *
 * Covers the model-family behavior matrix required by the plan:
 *  - Veo 3.1 (any tier) — native audio: dialogue embedded verbatim +
 *    delivery/acting direction, `generateAudio: true`, `ttsFallback: false`.
 *  - Grok Imagine 1.5 (kie.ai, `grok-imagine-video-1-5-preview`) — no native
 *    audio: acting/mouth-movement direction only (no literal transcript),
 *    `ttsFallback: true` with the resolved lines echoed back.
 *  - A Seedance model id (ByteDance/BytePlus ModelArk family, DB-only — no
 *    static catalog entry, `configJson.hasAudio: false`) — same non-native
 *    behavior as Grok. (Note: WaveSpeed's `bytedance/seedance-2.0/*` variants
 *    DO have a static catalog entry with `nativeAudio: true` — this test
 *    intentionally picks a Seedance id WITHOUT native audio to exercise the
 *    non-native branch + the DB-only derivation fallback.)
 *  - An unknown/generic model id — falls back to the generic family, same
 *    non-native behavior.
 *  - Silent clips (no dialogue lines) never set `ttsFallback`/`generateAudio`.
 */
import { describe, expect, it } from "vitest";
import {
  formatVideoClipRequest,
  resolveProviderFamily,
  type VerticalDramaClipDialogueLine,
} from "../verticalDramaVideoPromptFormatter";
import { buildNativeDialogueVerbatimBlock } from "@shared/verticalDramaSeries/nativeDialogue";

function clip(over: Partial<Parameters<typeof formatVideoClipRequest>[0]["clip"]> = {}) {
  return {
    clipNumber: 1,
    prompt: "Slow push-in on Aria as tension rises.",
    negativeMotionPrompt: "no warping, no identity drift",
    durationSeconds: 8,
    startFrameAssetId: "500",
    ...over,
  };
}

function dialogueLine(over: Partial<VerticalDramaClipDialogueLine> = {}): VerticalDramaClipDialogueLine {
  return {
    characterKey: "aria",
    lineTh: "เราไม่ได้จบกันแค่นี้หรอกนะ",
    emotion: "cold defiance",
    delivery: { tone: "cold", pace: "slow", pauses: "a beat before the last word", texture: "steady" },
    subtext: "She wants him to believe she's unafraid, but her hands are shaking.",
    ...over,
  };
}

describe("formatVideoClipRequest — Veo 3.1 (native audio)", () => {
  const veoModel = {
    id: "veo3/generate-veo-3-video-lite",
    type: "video" as const,
    provider: "kie.ai",
    aliases: ["veo 3.1 lite", "veo3-lite"],
    configJson: {},
  };

  it("embeds the Thai dialogue line verbatim + delivery/acting direction and sets generateAudio true", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.providerFamily).toBe("veo");
    expect(result.nativeAudioDialogue).toBe(true);
    expect(result.generateAudio).toBe(true);
    expect(result.ttsFallback).toBe(false);
    expect(result.ttsLines).toEqual([]);
    expect(result.prompt).toContain("เราไม่ได้จบกันแค่นี้หรอกนะ");
    expect(result.prompt).toContain("tone: cold");
    expect(result.prompt).toContain("pace: slow");
    expect(result.prompt).toContain("Subtext/acting note:");
    expect(result.maxReferenceImages).toBe(3);
    expect(result.supportsStartFrame).toBe(true);
  });

  it("does not append a second spoken copy when the canonical native-dialogue block already exists", () => {
    const line = dialogueLine();
    // Lip-sync discipline fix — the formatter's own idempotency guard
    // compares against whatever `buildNativeDialogueVerbatimBlock` (with the
    // SAME `dialogueLanguageName` the formatter itself resolves — "Thai" by
    // default) produces, so this must be built the same way rather than a
    // hand-rolled literal.
    const canonicalBlock = buildNativeDialogueVerbatimBlock([line], {
      dialogueLanguageName: "Thai",
    });
    const result = formatVideoClipRequest({
      clip: clip({ prompt: `Camera pushes in. ${canonicalBlock}` }),
      dialogueLines: [line],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt.match(new RegExp(line.lineTh, "g"))).toHaveLength(1);
    expect(result.generateAudio).toBe(true);
    expect(result.ttsFallback).toBe(false);
  });

  it("attributes each speaker by DISPLAY NAME and includes the SILENT LISTENER rules when the canonical block is already embedded (2+ speakers)", () => {
    // `formatVideoClipRequest` only embeds the canonical block itself when
    // the base `clip.prompt` doesn't already carry it — in real usage
    // `clip.prompt` was already produced by the shot-video-prompt service,
    // which embeds the (speaker-attributed) canonical block via
    // `appendMissingDialogueVerbatim`. Mirror that here rather than
    // asserting on the separate acting-direction-only fallback clause
    // (`buildNativeDialogueClause`), which is unrelated to this fix.
    const lines = [
      dialogueLine({ characterKey: "aria", speakerName: "อาเรีย", lineTh: "First line" }),
      dialogueLine({ characterKey: "noah", speakerName: "โนอาห์", lineTh: "Second line" }),
    ];
    const canonicalBlock = buildNativeDialogueVerbatimBlock(lines, {
      dialogueLanguageName: "Thai",
    });
    const result = formatVideoClipRequest({
      clip: clip({ prompt: `Camera pushes in. ${canonicalBlock}` }),
      dialogueLines: lines,
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt).toContain('อาเรีย: "First line"');
    expect(result.prompt).toContain('โนอาห์: "Second line"');
    expect(result.prompt).toContain("SILENT LISTENER");
    expect(result.prompt.match(/First line/g)).toHaveLength(1);
    expect(result.prompt.match(/Second line/g)).toHaveLength(1);
  });

  it("leaves the base prompt untouched for a silent clip with no start frame (no dialogue lines, no startFrameAssetId)", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: undefined }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });
    expect(result.prompt).toBe(clip().prompt);
    expect(result.generateAudio).toBe(false);
    expect(result.ttsFallback).toBe(false);
  });

  it("states the speech language explicitly as 'spoken Thai' by default (no dialogueLanguage supplied)", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: veoModel.id,
      model: veoModel,
    });
    expect(result.prompt).toContain("in natural spoken Thai, exactly:");
  });

  it("states the speech language explicitly as 'spoken English' when dialogueLanguage is 'en'", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine({ lineTh: "We are not done here." })],
      modelId: veoModel.id,
      model: veoModel,
      dialogueLanguage: "en",
    });
    expect(result.prompt).toContain("in natural spoken English, exactly:");
    expect(result.prompt).toContain("We are not done here.");
  });

  it("supports the wider dialogueLanguage set (e.g. Vietnamese, Arabic) beyond just th/en", () => {
    const viResult = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine({ lineTh: "Chúng ta chưa xong đâu." })],
      modelId: veoModel.id,
      model: veoModel,
      dialogueLanguage: "vi",
    });
    expect(viResult.prompt).toContain("in natural spoken Vietnamese, exactly:");

    const arResult = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine({ lineTh: "لم ننته بعد." })],
      modelId: veoModel.id,
      model: veoModel,
      dialogueLanguage: "ar",
    });
    expect(arResult.prompt).toContain("in natural spoken Arabic, exactly:");
  });
});

describe("formatVideoClipRequest — Grok Imagine 1.5 (native audio — xAI synchronized speech, user-confirmed 2026-07-06)", () => {
  const grokModel = {
    id: "grok-imagine-video-1-5-preview",
    type: "video" as const,
    provider: "kie.ai",
    aliases: ["grok imagine 1.5", "grok imagine video 1.5"],
    configJson: { maxReferenceImages: 1, hasAudio: true },
  };

  it("embeds the Thai dialogue verbatim with generateAudio and no ttsFallback", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: grokModel.id,
      model: grokModel,
    });

    expect(result.providerFamily).toBe("grok");
    expect(result.nativeAudioDialogue).toBe(true);
    expect(result.generateAudio).toBe(true);
    expect(result.ttsFallback).toBe(false);
    // Literal transcript IS embedded for native-audio models.
    expect(result.prompt).toContain("เราไม่ได้จบกันแค่นี้หรอกนะ");
    expect(result.prompt).toContain("in natural spoken Thai, exactly:");
    expect(result.maxReferenceImages).toBe(1);
  });

  it("states 'spoken in English' when dialogueLanguage is 'en'", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: grokModel.id,
      model: grokModel,
      dialogueLanguage: "en",
    });
    expect(result.prompt).toContain("in natural spoken English, exactly:");
  });
});

describe("formatVideoClipRequest — Seedance (ByteDance/BytePlus ModelArk family, DB-only model, no native audio)", () => {
  const seedanceModel = {
    id: "seedance-1-0-lite-i2v-250428",
    type: "video" as const,
    provider: "byteplus_modelark",
    aliases: [],
    configJson: { maxReferenceImages: 1, hasAudio: false },
  };

  it("resolves the seedance provider family and stays non-native (mouth-movement direction, ttsFallback true)", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: seedanceModel.id,
      model: seedanceModel,
    });

    expect(result.providerFamily).toBe("seedance");
    expect(result.nativeAudioDialogue).toBe(false);
    expect(result.ttsFallback).toBe(true);
    expect(result.prompt).not.toContain("เราไม่ได้จบกันแค่นี้หรอกนะ");
  });
});

describe("formatVideoClipRequest — unknown model id -> generic family", () => {
  const unknownModel = {
    id: "some-future-video-model",
    type: "video" as const,
    provider: "some_provider",
    aliases: [],
    configJson: {},
  };

  it("falls back to the generic family and non-native dialogue handling", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: unknownModel.id,
      model: unknownModel,
    });

    expect(result.providerFamily).toBe("generic");
    expect(result.nativeAudioDialogue).toBe(false);
    expect(result.ttsFallback).toBe(true);
    expect(result.maxReferenceImages).toBe(0);
    expect(result.supportsStartFrame).toBe(false);
  });
});

describe("formatVideoClipRequest — WaveSpeed Seedance 2.0 (static catalog entry, HAS native audio)", () => {
  const waveSpeedSeedanceModel = {
    id: "bytedance/seedance-2.0/image-to-video",
    type: "video" as const,
    provider: "wavespeed_ai",
    aliases: [],
    configJson: {},
  };

  it("resolves as seedance family AND native audio (static catalog entry overrides the generic non-native default)", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: waveSpeedSeedanceModel.id,
      model: waveSpeedSeedanceModel,
    });

    expect(result.providerFamily).toBe("seedance");
    expect(result.nativeAudioDialogue).toBe(true);
    expect(result.generateAudio).toBe(true);
    expect(result.ttsFallback).toBe(false);
    expect(result.prompt).toContain("เราไม่ได้จบกันแค่นี้หรอกนะ");
  });
});

describe("formatVideoClipRequest — start-frame grounding instruction (video MCP submission fix)", () => {
  const veoModel = {
    id: "veo3/generate-veo-3-video-lite",
    type: "video" as const,
    provider: "kie.ai",
    aliases: ["veo 3.1 lite", "veo3-lite"],
    configJson: {},
  };
  const unknownModel = {
    id: "some-future-video-model",
    type: "video" as const,
    provider: "some_provider",
    aliases: [],
    configJson: {},
  };

  it("prepends the grounding instruction when the clip has a start frame and the model supports one", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: "500" }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt.startsWith(
      "Use the attached first image as the exact start frame and visual source of truth — continue motion from it; keep faces, wardrobe, set and composition identical.",
    )).toBe(true);
    expect(result.prompt).toContain(clip().prompt);
  });

  it("does not add the grounding instruction when the clip has no start frame", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: undefined }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt).toBe(clip().prompt);
    expect(result.prompt).not.toContain("exact start frame");
  });

  it("does not add the grounding instruction when the model does not support a start frame (even if the clip has one)", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: "500" }),
      dialogueLines: [],
      modelId: unknownModel.id,
      model: unknownModel,
    });

    expect(result.supportsStartFrame).toBe(false);
    expect(result.prompt).toBe(clip().prompt);
    expect(result.prompt).not.toContain("exact start frame");
  });

  it("still respects the model's native-audio dialogue clause after the grounding instruction", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: "500" }),
      dialogueLines: [dialogueLine()],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt.startsWith("Use the attached first image")).toBe(true);
    expect(result.prompt).toContain("เราไม่ได้จบกันแค่นี้หรอกนะ");
  });
});

describe("formatVideoClipRequest — speakability sanitize on native embed (2026-07-08/W9-A, spec §14.1 rule 6b)", () => {
  const veoModel = {
    id: "veo3/generate-veo-3-video-lite",
    type: "video" as const,
    provider: "kie.ai",
    aliases: ["veo 3.1 lite", "veo3-lite"],
    configJson: {},
  };

  it("sanitizes a real bad-data line (wrapping quotes + parenthetical + tilde) before embedding it verbatim", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [
        dialogueLine({ characterKey: "เจ้าเกลือ", lineTh: "“เหมียว~”" }),
      ],
      modelId: veoModel.id,
      model: veoModel,
    });

    // The RAW quoted/tilde text never reaches the outbound prompt.
    expect(result.prompt).not.toContain("“เหมียว~”");
    expect(result.prompt).not.toContain("~");
    // The sanitized text is embedded instead.
    expect(result.prompt).toContain('exactly: "เหมียว".');
  });

  it("sanitizes an em-dash line to a comma before embedding (the dialogue's OWN em-dash is gone — unrelated em-dashes elsewhere in the instructional prompt template are untouched)", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [
        dialogueLine({
          characterKey: "ชายนต์",
          lineTh: "“ใจเย็น ฟังให้ครบตามกติกา—ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย”",
        }),
      ],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt).not.toContain("กติกา—ความจริง");
    expect(result.prompt).toContain(
      'exactly: "ใจเย็น ฟังให้ครบตามกติกา, ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย".',
    );
  });

  it("a clean, already-speakable line is embedded byte-identical (idempotent sanitizer, no visible change)", () => {
    const result = formatVideoClipRequest({
      clip: clip(),
      dialogueLines: [dialogueLine()],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt).toContain('exactly: "เราไม่ได้จบกันแค่นี้หรอกนะ".');
  });
});

describe("resolveProviderFamily", () => {
  it("detects veo/grok/seedance/generic independently of resolveVerticalDramaCapabilities", () => {
    expect(
      resolveProviderFamily("veo-3-1", { type: "video", provider: "kie.ai", aliases: [] }),
    ).toBe("veo");
    expect(
      resolveProviderFamily("grok-imagine-video-1-5-preview", {
        type: "video",
        provider: "kie.ai",
        aliases: [],
      }),
    ).toBe("grok");
    expect(
      resolveProviderFamily("bytedance/seedance-2.0/image-to-video", {
        type: "video",
        provider: "wavespeed_ai",
        aliases: [],
      }),
    ).toBe("seedance");
    expect(
      resolveProviderFamily("acme-video-1", { type: "video", provider: "acme", aliases: [] }),
    ).toBe("generic");
  });

  // Feature 135 — Hermes Grok media worker (section 09, TDD §3.6): prompt
  // style follows model FAMILY, not transport — `hermes-grok/grok-imagine-
  // video` must resolve to the same "grok" family as the kie.ai gateway
  // Grok rows, even though its transport is `hermes_worker`, not
  // `gateway_api`. Locked with a literal-id test (not just the substring
  // match `detectGrokOrSeedance` already happens to pass on) so a future
  // provider-key rename can never silently regress the prompt variant.
  it("resolves hermes-grok/grok-imagine-video to the 'grok' family (transport-independent — locks the literal id)", () => {
    expect(
      resolveProviderFamily("hermes-grok/grok-imagine-video", {
        type: "video",
        provider: "hermes-grok",
        aliases: ["hermes grok imagine video", "grok imagine video via hermes", "hermes-grok-video"],
        configJson: { transport: "hermes_worker" },
      }),
    ).toBe("grok");
  });

  it("still resolves the kie.ai gateway grok id and veo/seedance ids unchanged (regression)", () => {
    expect(
      resolveProviderFamily("grok-imagine-video-1-5-preview", {
        type: "video",
        provider: "kie.ai",
        aliases: [],
        configJson: {},
      }),
    ).toBe("grok");
    expect(
      resolveProviderFamily("veo-3-1", { type: "video", provider: "kie.ai", aliases: [], configJson: {} }),
    ).toBe("veo");
    expect(
      resolveProviderFamily("bytedance/seedance-2.0/image-to-video", {
        type: "video",
        provider: "wavespeed_ai",
        aliases: [],
        configJson: {},
      }),
    ).toBe("seedance");
  });
});

describe("formatVideoClipRequest — audioDirection (task #36 — optional NATIVE AUDIO DIRECTION prompt option; recorded gap-4 fix, 2026-07-22: no longer appended into prompt)", () => {
  const veoModel = {
    id: "veo3/generate-veo-3-video-lite",
    type: "video" as const,
    provider: "kie.ai",
    aliases: ["veo 3.1 lite", "veo3-lite"],
    configJson: {},
  };

  it("leaves the prompt byte-identical when audioDirection is absent", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: undefined }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });
    expect(result.prompt).toBe(clip().prompt);
  });

  it("never appends audioDirection onto a silent (no-dialogue) clip's prompt — the skill now owns writing the sound clause into prompt itself", () => {
    const result = formatVideoClipRequest({
      clip: clip({
        startFrameAssetId: undefined,
        audioDirection:
          "Door slams shut; distant rain patters against the window.",
      }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });
    // Byte-identical to the no-audioDirection case above: this field plays
    // no role in the formatted prompt anymore.
    expect(result.prompt).toBe(clip().prompt);
  });

  it("never appends audioDirection after the dialogue clause — audioDirection plays no role in the formatted prompt at all", () => {
    const result = formatVideoClipRequest({
      clip: clip({ audioDirection: "Rain taps steadily on the glass." }),
      dialogueLines: [dialogueLine()],
      modelId: veoModel.id,
      model: veoModel,
    });
    const dialogueIndex = result.prompt.indexOf("เราไม่ได้จบกันแค่นี้หรอกนะ");
    expect(dialogueIndex).toBeGreaterThan(-1);
    expect(result.prompt).not.toContain("Rain taps steadily on the glass.");
  });

  it("never appends audioDirection regardless of provider family (generic/non-Veo model)", () => {
    const result = formatVideoClipRequest({
      clip: clip({ audioDirection: "Footsteps echo on gravel." }),
      dialogueLines: [],
      modelId: "acme-video-1",
      model: { type: "video", provider: "acme", aliases: [] },
    });
    expect(result.prompt).not.toContain("Footsteps echo on gravel.");
  });

  // Coordinator-requested end-to-end double-append proof (recorded gap 4) —
  // the realistic post-fix scenario: the skill already wrote its sound
  // clause directly into `clip.prompt` at generation time, AND the SAME
  // text is separately persisted on `clip.audioDirection` (for the UI
  // "เสียง:" block + audit trail) — the formatted request must contain that
  // sound text exactly ONCE, never twice.
  it("no double-append end-to-end: clip.prompt already contains the skill-written sound clause + a set audioDirection carrying the SAME text -> the formatted request contains that text exactly once", () => {
    const soundClause = "A kettle whistles softly in the background as rain taps the window.";
    const result = formatVideoClipRequest({
      clip: clip({
        prompt: `${clip().prompt} ${soundClause}`,
        startFrameAssetId: undefined,
        audioDirection: soundClause,
      }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });

    const occurrences = result.prompt.split(soundClause).length - 1;
    expect(occurrences).toBe(1);
  });
});

// Model-family-aware, vision-grounded video prompt quality upgrade
// (`planning/vd-video-prompt-model-family-quality/plan.md`, item I) — the
// persisted `clip.prompt` is already <= VD_VIDEO_PROMPT_MAX
// (`ensurePromptWithinLimit`, enforced at the router's persist step, sound
// clause included since the recorded gap-4 fix), but this function's OWN
// prepend (start-frame grounding) and appends (dialogue/mouth-movement
// clause, accent directive) can still push the RENDER-TIME formatted
// request over that same cap.
//
// Recorded gap-4 fix (2026-07-22) removed the audioDirection tail entirely
// (see the `audioDirection` describe block above), so the guard below no
// longer has a single tail to trim — it now rolls back this function's OWN
// remaining tiers one at a time, most-recently-added first (accent
// directive -> dialogue/mouth-movement clause -> start-frame grounding),
// and NEVER trims the base `clip.prompt` itself. Each test below PROBES the
// real per-fixture tier overhead with a trivially short base prompt first,
// then sizes a base prompt precisely around the 2000-char cap — this avoids
// brittle hardcoded character counts that would silently drift out of sync
// with the actual clause-building text.
describe("formatVideoClipRequest — final VD_VIDEO_PROMPT_MAX tiered guard, recorded gap-4 fix (planning/vd-video-prompt-model-family-quality/plan.md, item I)", () => {
  const veoModel = {
    id: "veo3/generate-veo-3-video-lite",
    type: "video" as const,
    provider: "kie.ai",
    aliases: ["veo 3.1 lite", "veo3-lite"],
    configJson: {},
  };

  it("drops ONLY the accent directive when grounding + dialogue clause + accent directive together exceed VD_VIDEO_PROMPT_MAX, keeping grounding + dialogue clause + base intact", () => {
    const line = dialogueLine();
    const probe = formatVideoClipRequest({
      clip: clip({ prompt: "X" }),
      dialogueLines: [line],
      modelId: veoModel.id,
      model: veoModel,
      thaiAccent: "standard_central_thai",
    });
    const overheadWithAccent = probe.prompt.length - 1;
    const basePrompt = "C".repeat(2000 - overheadWithAccent + 40);

    const result = formatVideoClipRequest({
      clip: clip({ prompt: basePrompt }),
      dialogueLines: [line],
      modelId: veoModel.id,
      model: veoModel,
      thaiAccent: "standard_central_thai",
    });

    expect(result.prompt.length).toBeLessThanOrEqual(2000);
    expect(result.prompt).toContain(basePrompt);
    expect(result.prompt).toContain("Use the attached first image");
    expect(result.prompt).toContain(line.lineTh);
    expect(result.prompt).not.toContain("Apply this delivery direction to every spoken line.");
  });

  it("drops the accent directive AND the dialogue clause when even grounding + dialogue clause alone exceeds VD_VIDEO_PROMPT_MAX, keeping grounding + base intact", () => {
    const line = dialogueLine();
    const probe = formatVideoClipRequest({
      clip: clip({ prompt: "X" }),
      dialogueLines: [line],
      modelId: veoModel.id,
      model: veoModel,
      // No thaiAccent this time — isolates the grounding+dialogue-clause overhead.
    });
    const overheadNoAccent = probe.prompt.length - 1;
    const basePrompt = "C".repeat(2000 - overheadNoAccent + 40);

    const result = formatVideoClipRequest({
      clip: clip({ prompt: basePrompt }),
      dialogueLines: [line],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt.length).toBeLessThanOrEqual(2000);
    expect(result.prompt).toContain(basePrompt);
    expect(result.prompt).toContain("Use the attached first image");
    expect(result.prompt).not.toContain(line.lineTh);
  });

  it("drops the grounding prepend too when even grounding + base alone would exceed VD_VIDEO_PROMPT_MAX, leaving only the base prompt (which always fits on its own)", () => {
    const probe = formatVideoClipRequest({
      clip: clip({ prompt: "X" }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });
    const groundingOverhead = probe.prompt.length - 1;
    const basePrompt = "C".repeat(2000 - groundingOverhead + 40);

    const result = formatVideoClipRequest({
      clip: clip({ prompt: basePrompt }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt).toBe(basePrompt);
    expect(result.prompt.length).toBeLessThanOrEqual(2000);
  });

  it("never involves clip.audioDirection in the guard at all — a set audioDirection has zero effect on the formatted prompt or its length, regardless of size", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: undefined, audioDirection: "E".repeat(1900) }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt).toBe(clip().prompt);
  });
});

// Silence-aware / idempotent dialogue clause
// (`planning/vd-video-prompt-skill-first/plan.md` Phase 3b) — the render-time
// formatter must never force-embed a dialogue clause a silent/empty clip
// never had, and must never append a SECOND dialogue clause on top of an
// already-compliant skill-first `clip.prompt` (not just the exact
// `buildNativeDialogueVerbatimBlock` string — any prose that already carries
// the line verbatim).
describe("formatVideoClipRequest — silence-aware / idempotent dialogue clause (planning/vd-video-prompt-skill-first/plan.md Phase 3b)", () => {
  const veoModel = {
    id: "veo3/generate-veo-3-video-lite",
    type: "video" as const,
    provider: "kie.ai",
    aliases: ["veo 3.1 lite", "veo3-lite"],
    configJson: {},
  };
  const seedanceModel = {
    id: "seedance-1-0-lite-i2v-250428",
    type: "video" as const,
    provider: "byteplus_modelark",
    aliases: [],
    configJson: { maxReferenceImages: 1, hasAudio: false },
  };

  it("(a) empty dialogueLines: appends nothing at all, prompt stays byte-identical to the base clip prompt", () => {
    const result = formatVideoClipRequest({
      clip: clip({ startFrameAssetId: undefined }),
      dialogueLines: [],
      modelId: veoModel.id,
      model: veoModel,
    });
    expect(result.prompt).toBe(clip().prompt);
    expect(result.generateAudio).toBe(false);
    expect(result.ttsFallback).toBe(false);
  });

  it("(b) native-audio, already-embedded verbatim as SKILL-FIRST PROSE (not the canonical block shape): does not append a second dialogue clause", () => {
    const line = dialogueLine();
    const result = formatVideoClipRequest({
      // No start frame — isolates this assertion from the (unrelated)
      // start-frame grounding instruction.
      clip: clip({
        startFrameAssetId: undefined,
        prompt: `Aria leans in and says "${line.lineTh}" with cold defiance.`,
      }),
      dialogueLines: [line],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt).toBe(
      `Aria leans in and says "${line.lineTh}" with cold defiance.`,
    );
    expect(result.prompt.match(new RegExp(line.lineTh, "g"))).toHaveLength(1);
    expect(result.generateAudio).toBe(true);
    expect(result.ttsFallback).toBe(false);
  });

  it("(b) native-audio, NOT yet embedded: still appends the deterministic verbatim clause (unchanged safety-net behavior)", () => {
    const line = dialogueLine();
    const result = formatVideoClipRequest({
      clip: clip({ prompt: "Aria stares out the window, jaw tight." }),
      dialogueLines: [line],
      modelId: veoModel.id,
      model: veoModel,
    });

    expect(result.prompt).toContain(line.lineTh);
    expect(result.prompt).toContain("Aria stares out the window, jaw tight.");
  });

  it("non-native (mouth-movement) model: does not append a second mouth-movement clause when the base prompt already embeds the line verbatim", () => {
    const line = dialogueLine();
    const result = formatVideoClipRequest({
      // No start frame — isolates this assertion from the (unrelated)
      // start-frame grounding instruction this seedance model's
      // `configJson.maxReferenceImages: 1` makes it eligible for.
      clip: clip({
        startFrameAssetId: undefined,
        prompt: `Aria mouths the words "${line.lineTh}" silently to herself.`,
      }),
      dialogueLines: [line],
      modelId: seedanceModel.id,
      model: seedanceModel,
    });

    expect(result.prompt).toBe(
      `Aria mouths the words "${line.lineTh}" silently to herself.`,
    );
    expect(result.prompt.match(new RegExp(line.lineTh, "g"))).toHaveLength(1);
    // ttsFallback stays true regardless (the caller still routes this
    // clip's dialogue to TTS — only the PROMPT clause is idempotent).
    expect(result.ttsFallback).toBe(true);
  });

  it("non-native (mouth-movement) model: still appends the mouth-movement clause when not yet present (unchanged default behavior)", () => {
    const line = dialogueLine();
    const result = formatVideoClipRequest({
      clip: clip({ prompt: "Aria stares out the window, jaw tight." }),
      dialogueLines: [line],
      modelId: seedanceModel.id,
      model: seedanceModel,
    });

    expect(result.prompt).not.toContain(line.lineTh);
    expect(result.prompt).toContain("mouth moves naturally");
    expect(result.ttsFallback).toBe(true);
  });
});
