/**
 * Vertical Drama Series — Text Overlay Suite pure-helper coverage (task #34,
 * `planning/vertical-drama-end-card-teaser/plan.md` v2). See `textOverlay.ts`'s
 * own header doc comment for the module boundary this file tests.
 */
import { describe, expect, it } from "vitest";
import {
  clampVdOverlayText,
  defaultCardStyleVariantForKind,
  deriveCharacterIntroCards,
  deriveEpisodeIndicatorLabel,
  deriveTitleBumperLines,
  listEnabledWatermarkSlots,
  parseSeriesWatermarkConfig,
  parseTextOverlayPlan,
  resolveEndCardText,
  resolveOpenerRecapText,
  resolveOpeningSequenceWindows,
  resolveWatermarkCornerAutoAvoid,
  resolveEpisodeIndicatorCornerAutoAvoid,
  validateTextOverlayPlan,
  vdSeriesWatermarkConfigSchema,
  vdTextOverlayPlanSchema,
  VD_CARD_DURATION_BOUNDS,
  VD_END_CARD_DURATION_BOUNDS,
  VD_END_CARD_FALLBACK_TEXT_TH,
  VD_OPENER_RECAP_DURATION_BOUNDS,
  VD_TITLE_BUMPER_DURATION_SECONDS,
  type VdSeriesWatermarkConfig,
  type VdTextOverlayPlan,
} from "./textOverlay";

describe("clampVdOverlayText", () => {
  it("returns short text unchanged", () => {
    expect(clampVdOverlayText("สวัสดีครับ")).toBe("สวัสดีครับ");
  });

  it("clamps at a space boundary past the halfway point and appends an ellipsis", () => {
    const words = Array.from({ length: 30 }, (_, i) => `คำ${i}`).join(" ");
    const clamped = clampVdOverlayText(words, 40);
    expect(clamped.endsWith("…")).toBe(true);
    expect(Array.from(clamped.replace("…", "")).length).toBeLessThanOrEqual(40);
    expect(clamped.includes(" …")).toBe(false); // trimmed before the ellipsis
  });

  it("hard-cuts when there is no usable space boundary (single long token)", () => {
    const longToken = "ก".repeat(100);
    const clamped = clampVdOverlayText(longToken, 20);
    expect(clamped).toBe(`${"ก".repeat(20)}…`);
  });

  it("does not append an ellipsis when no truncation happened", () => {
    expect(clampVdOverlayText("abc", 10)).toBe("abc");
  });
});

describe("resolveEndCardText — priority: manual > cliffhanger > hook > fallback", () => {
  it("prefers manual text over everything else", () => {
    const result = resolveEndCardText({
      manualText: "ข้อความที่ผู้ใช้พิมพ์เอง",
      cliffhangerLine: "cliffhanger",
      unresolvedHooks: ["hook"],
    });
    expect(result).toEqual({
      text: "ข้อความที่ผู้ใช้พิมพ์เอง",
      source: "manual",
    });
  });

  it("falls back to the cliffhanger_line when no manual text", () => {
    const result = resolveEndCardText({
      cliffhangerLine: "เธอไม่รู้เลยว่าใครอยู่เบื้องหลัง",
      unresolvedHooks: ["hook"],
    });
    expect(result).toEqual({
      text: "เธอไม่รู้เลยว่าใครอยู่เบื้องหลัง",
      source: "cliffhanger",
    });
  });

  it("falls back to the first non-empty unresolved hook when no cliffhanger", () => {
    const result = resolveEndCardText({
      unresolvedHooks: ["", "  ", "ปมค้างที่ยังไม่คลี่คลาย"],
    });
    expect(result).toEqual({ text: "ปมค้างที่ยังไม่คลี่คลาย", source: "hook" });
  });

  it("falls back to the default Thai teaser when nothing else is available", () => {
    const result = resolveEndCardText({});
    expect(result).toEqual({
      text: VD_END_CARD_FALLBACK_TEXT_TH,
      source: "fallback",
    });
  });

  it("honors a caller-supplied fallback override", () => {
    const result = resolveEndCardText({ fallbackText: "โปรดติดตามตอนต่อไป" });
    expect(result).toEqual({ text: "โปรดติดตามตอนต่อไป", source: "fallback" });
  });

  it("clamps a long cliffhanger line", () => {
    const long = "ก".repeat(200);
    const result = resolveEndCardText({ cliffhangerLine: long });
    expect(result.source).toBe("cliffhanger");
    expect(Array.from(result.text.replace("…", "")).length).toBeLessThanOrEqual(
      90
    );
  });
});

describe("resolveOpenerRecapText — priority: manual > prior summary > none", () => {
  it("prefers manual text", () => {
    const result = resolveOpenerRecapText({
      manualText: "ความเดิม: กำหนดเอง",
      priorEpisodeSummary: "สรุปอัตโนมัติ",
      episodeNumber: 3,
    });
    expect(result).toEqual({ text: "ความเดิม: กำหนดเอง", source: "manual" });
  });

  it("episode 1 never has a recap even with a manual-free summary available", () => {
    const result = resolveOpenerRecapText({
      priorEpisodeSummary: "ไม่ควรถูกใช้",
      episodeNumber: 1,
    });
    expect(result).toEqual({ text: "", source: "none" });
  });

  it("uses the prior episode summary for episode 2+", () => {
    const result = resolveOpenerRecapText({
      priorEpisodeSummary: "ตอนที่แล้วนางเอกเพิ่งค้นพบความลับ",
      episodeNumber: 2,
    });
    expect(result).toEqual({
      text: "ตอนที่แล้วนางเอกเพิ่งค้นพบความลับ",
      source: "summary",
    });
  });

  it("returns none when episode 2+ has no prior summary yet", () => {
    const result = resolveOpenerRecapText({ episodeNumber: 2 });
    expect(result).toEqual({ text: "", source: "none" });
  });
});

describe("deriveTitleBumperLines", () => {
  it("includes the episode title when present", () => {
    expect(
      deriveTitleBumperLines({
        seriesTitle: "รักนี้ต้องลุ้น",
        episodeNumber: 3,
        episodeTitle: "ความจริงที่ซ่อนไว้",
      })
    ).toEqual({
      primary: "รักนี้ต้องลุ้น",
      secondary: "SUB-EP 3: ความจริงที่ซ่อนไว้",
    });
  });

  it("falls back to a bare EP N line when no episode title", () => {
    expect(
      deriveTitleBumperLines({
        seriesTitle: "รักนี้ต้องลุ้น",
        episodeNumber: 5,
      })
    ).toEqual({ primary: "รักนี้ต้องลุ้น", secondary: "SUB-EP 5" });
  });
});

describe("deriveEpisodeIndicatorLabel", () => {
  it("includes the target count when known", () => {
    expect(deriveEpisodeIndicatorLabel(3, 10)).toBe("SUB-EP 3/10");
  });

  it("omits the total when unknown/zero", () => {
    expect(deriveEpisodeIndicatorLabel(3, undefined)).toBe("SUB-EP 3");
    expect(deriveEpisodeIndicatorLabel(3, 0)).toBe("SUB-EP 3");
  });
});

describe("deriveCharacterIntroCards", () => {
  it("picks the first (ascending shotNumber) appearance per character", () => {
    const frames = [
      { shotNumber: 3, requiredCharacterRefs: ["char-a"] },
      { shotNumber: 1, requiredCharacterRefs: ["char-a", "char-b"] },
      { shotNumber: 5, requiredCharacterRefs: ["char-b"] },
    ];
    const characters = [
      { characterKey: "char-a", name: "มาลี", role: "นางเอก" },
      { characterKey: "char-b", name: "ธาดา", role: "พระเอก" },
    ];
    expect(deriveCharacterIntroCards(frames, characters)).toEqual([
      { characterKey: "char-a", shotNumber: 1, name: "มาลี", role: "นางเอก" },
      { characterKey: "char-b", shotNumber: 1, name: "ธาดา", role: "พระเอก" },
    ]);
  });

  it("skips a character key with no matching roster entry", () => {
    const frames = [{ shotNumber: 1, requiredCharacterRefs: ["char-missing"] }];
    expect(deriveCharacterIntroCards(frames, [])).toEqual([]);
  });

  it("omits role when absent/blank", () => {
    const frames = [{ shotNumber: 2, requiredCharacterRefs: ["char-a"] }];
    const characters = [{ characterKey: "char-a", name: "มาลี", role: "  " }];
    expect(deriveCharacterIntroCards(frames, characters)).toEqual([
      { characterKey: "char-a", shotNumber: 2, name: "มาลี", role: undefined },
    ]);
  });

  it("returns [] for no frames", () => {
    expect(deriveCharacterIntroCards([], [])).toEqual([]);
  });
});

describe("defaultCardStyleVariantForKind", () => {
  it("maps time_setting -> time_setting", () => {
    expect(defaultCardStyleVariantForKind("time_setting")).toBe("time_setting");
  });
  it("maps narrative_hook and custom -> narrative_hook", () => {
    expect(defaultCardStyleVariantForKind("narrative_hook")).toBe(
      "narrative_hook"
    );
    expect(defaultCardStyleVariantForKind("custom")).toBe("narrative_hook");
  });
});

describe("resolveOpeningSequenceWindows", () => {
  it("queues the recap right after the bumper when both are enabled", () => {
    const windows = resolveOpeningSequenceWindows({
      titleBumper: { enabled: true },
      openerRecap: { enabled: true, durationSec: 4 },
    });
    expect(windows.titleBumper).toEqual({
      startSec: 0,
      endSec: VD_TITLE_BUMPER_DURATION_SECONDS,
    });
    expect(windows.openerRecap).toEqual({
      startSec: VD_TITLE_BUMPER_DURATION_SECONDS,
      endSec: VD_TITLE_BUMPER_DURATION_SECONDS + 4,
    });
  });

  it("starts the recap at 0 when the bumper is disabled", () => {
    const windows = resolveOpeningSequenceWindows({
      titleBumper: { enabled: false },
      openerRecap: { enabled: true, durationSec: 3 },
    });
    expect(windows.titleBumper).toBeUndefined();
    expect(windows.openerRecap).toEqual({ startSec: 0, endSec: 3 });
  });

  it("returns {} when neither is enabled", () => {
    expect(resolveOpeningSequenceWindows({})).toEqual({});
  });

  it("uses the default recap duration when durationSec is absent", () => {
    const windows = resolveOpeningSequenceWindows({
      openerRecap: { enabled: true },
    });
    expect(windows.openerRecap).toEqual({
      startSec: 0,
      endSec: VD_OPENER_RECAP_DURATION_BOUNDS.default,
    });
  });
});

describe("resolveWatermarkCornerAutoAvoid", () => {
  it("moves the watermark to the matching bottom corner when it clashes with the indicator", () => {
    expect(
      resolveWatermarkCornerAutoAvoid({
        watermarkPosition: "top_right",
        episodeIndicatorEnabled: true,
        episodeIndicatorPosition: "top_right",
      })
    ).toEqual({ position: "bottom_right", adjusted: true });

    expect(
      resolveWatermarkCornerAutoAvoid({
        watermarkPosition: "top_left",
        episodeIndicatorEnabled: true,
        episodeIndicatorPosition: "top_left",
      })
    ).toEqual({ position: "bottom_left", adjusted: true });
  });

  it("is a no-op when the corners already differ", () => {
    expect(
      resolveWatermarkCornerAutoAvoid({
        watermarkPosition: "bottom_left",
        episodeIndicatorEnabled: true,
        episodeIndicatorPosition: "top_right",
      })
    ).toEqual({ position: "bottom_left", adjusted: false });
  });

  it("is a no-op when the episode indicator is disabled", () => {
    expect(
      resolveWatermarkCornerAutoAvoid({
        watermarkPosition: "top_right",
        episodeIndicatorEnabled: false,
      })
    ).toEqual({ position: "top_right", adjusted: false });
  });
});

describe("resolveEpisodeIndicatorCornerAutoAvoid", () => {
  it("moves the indicator instead of moving a configured watermark", () => {
    expect(
      resolveEpisodeIndicatorCornerAutoAvoid({
        episodeIndicatorPosition: "top_right",
        watermarkPositions: ["top_right", "bottom_right"],
      })
    ).toEqual({ position: "top_left", adjusted: true });
  });

  it("keeps the indicator when neither watermark occupies its corner", () => {
    expect(
      resolveEpisodeIndicatorCornerAutoAvoid({
        episodeIndicatorPosition: "top_right",
        watermarkPositions: ["bottom_right"],
      })
    ).toEqual({ position: "top_right", adjusted: false });
  });
});

describe("validateTextOverlayPlan", () => {
  it("returns [] for an empty/all-disabled plan", () => {
    expect(validateTextOverlayPlan({})).toEqual([]);
  });

  it("flags an out-of-range end card duration as an error", () => {
    const plan: VdTextOverlayPlan = {
      endCard: {
        enabled: true,
        durationSec: 99,
        showFollowLine: true,
        styleVariant: "center_card",
      },
    };
    const issues = validateTextOverlayPlan(plan);
    expect(issues).toEqual([
      expect.objectContaining({
        code: "VD_TEXT_OVERLAY_END_CARD_DURATION_OUT_OF_RANGE",
        severity: "error",
      }),
    ]);
  });

  it("flags an out-of-range opener duration as an error", () => {
    const plan: VdTextOverlayPlan = {
      openerRecap: { enabled: true, durationSec: 0.5 },
    };
    expect(
      validateTextOverlayPlan(plan).some(
        i => i.code === "VD_TEXT_OVERLAY_OPENER_DURATION_OUT_OF_RANGE"
      )
    ).toBe(true);
  });

  it("flags an out-of-range card duration as an error, scoped to the offending card", () => {
    const plan: VdTextOverlayPlan = {
      cards: [
        {
          id: "card-1",
          kind: "time_setting",
          anchor: { shotNumber: 2 },
          text: "ปี 1980",
          durationSec: 10,
          enabled: true,
        },
      ],
    };
    const issues = validateTextOverlayPlan(plan);
    expect(issues).toEqual([
      expect.objectContaining({
        code: "VD_TEXT_OVERLAY_CARD_DURATION_OUT_OF_RANGE",
        cardId: "card-1",
      }),
    ]);
  });

  it("ignores a disabled card's out-of-range duration", () => {
    const plan: VdTextOverlayPlan = {
      cards: [
        {
          id: "card-1",
          kind: "time_setting",
          anchor: { shotNumber: 2 },
          text: "ปี 1980",
          durationSec: 10,
          enabled: false,
        },
      ],
    };
    expect(validateTextOverlayPlan(plan)).toEqual([]);
  });

  it("warns when more than 2 cards overlap on the same shot", () => {
    const card = (id: string, offsetSec: number) => ({
      id,
      kind: "narrative_hook" as const,
      anchor: { shotNumber: 4, offsetSec },
      text: "ข้อความ",
      durationSec: 2,
      enabled: true,
    });
    const plan: VdTextOverlayPlan = {
      cards: [card("a", 0), card("b", 0.5), card("c", 1)],
    };
    const issues = validateTextOverlayPlan(plan);
    expect(
      issues.some(
        i =>
          i.code === "VD_TEXT_OVERLAY_TOO_MANY_CONCURRENT_CARDS" &&
          i.severity === "warning"
      )
    ).toBe(true);
  });

  it("does not warn for exactly 2 concurrent cards", () => {
    const card = (id: string, offsetSec: number) => ({
      id,
      kind: "narrative_hook" as const,
      anchor: { shotNumber: 4, offsetSec },
      text: "ข้อความ",
      durationSec: 2,
      enabled: true,
    });
    const plan: VdTextOverlayPlan = { cards: [card("a", 0), card("b", 0.5)] };
    expect(
      validateTextOverlayPlan(plan).some(
        i => i.code === "VD_TEXT_OVERLAY_TOO_MANY_CONCURRENT_CARDS"
      )
    ).toBe(false);
  });

  it("does not warn for two cards on different shots", () => {
    const plan: VdTextOverlayPlan = {
      cards: [
        {
          id: "a",
          kind: "time_setting",
          anchor: { shotNumber: 1 },
          text: "x",
          durationSec: 2,
          enabled: true,
        },
        {
          id: "b",
          kind: "time_setting",
          anchor: { shotNumber: 2 },
          text: "y",
          durationSec: 2,
          enabled: true,
        },
      ],
    };
    expect(validateTextOverlayPlan(plan)).toEqual([]);
  });

  it("warns when a fullscreen banner window overlaps the opener recap window", () => {
    const plan: VdTextOverlayPlan = {
      openerRecap: { enabled: true, durationSec: 4 },
    };
    const issues = validateTextOverlayPlan(plan, {
      fullscreenBannerWindows: [{ startSec: 1, endSec: 2 }],
    });
    expect(
      issues.some(
        i =>
          i.code === "VD_TEXT_OVERLAY_FULLSCREEN_BANNER_OVERLAP" &&
          i.severity === "warning"
      )
    ).toBe(true);
  });

  it("does not warn when the fullscreen banner window is entirely after the opener recap window", () => {
    const plan: VdTextOverlayPlan = {
      openerRecap: { enabled: true, durationSec: 4 },
    };
    const issues = validateTextOverlayPlan(plan, {
      fullscreenBannerWindows: [{ startSec: 10, endSec: 12 }],
    });
    expect(issues).toEqual([]);
  });

  it("warns when a fullscreen banner overlaps the end-card window (using the estimated video duration)", () => {
    const plan: VdTextOverlayPlan = {
      endCard: {
        enabled: true,
        durationSec: 3,
        showFollowLine: true,
        styleVariant: "center_card",
      },
    };
    const issues = validateTextOverlayPlan(plan, {
      fullscreenBannerWindows: [{ startSec: 58, endSec: 60 }],
      estimatedVideoDurationSeconds: 60,
    });
    expect(
      issues.some(i => i.code === "VD_TEXT_OVERLAY_FULLSCREEN_BANNER_OVERLAP")
    ).toBe(true);
  });

  it("skips the end-card overlap check entirely when no duration estimate is supplied", () => {
    const plan: VdTextOverlayPlan = {
      endCard: {
        enabled: true,
        durationSec: 3,
        showFollowLine: true,
        styleVariant: "center_card",
      },
    };
    const issues = validateTextOverlayPlan(plan, {
      fullscreenBannerWindows: [{ startSec: 0, endSec: 999 }],
    });
    expect(issues).toEqual([]);
  });

  it("flags more than the max card count as an error", () => {
    const cards = Array.from({ length: 25 }, (_, i) => ({
      id: `card-${i}`,
      kind: "custom" as const,
      anchor: { shotNumber: 1 },
      text: "x",
      durationSec: 2,
      enabled: false,
    }));
    const issues = validateTextOverlayPlan({ cards });
    expect(issues.some(i => i.code === "VD_TEXT_OVERLAY_TOO_MANY_CARDS")).toBe(
      true
    );
  });
});

describe("parseTextOverlayPlan", () => {
  it("returns null for null/undefined", () => {
    expect(parseTextOverlayPlan(null)).toBeNull();
    expect(parseTextOverlayPlan(undefined)).toBeNull();
  });

  it("returns null (never throws) for a malformed record", () => {
    expect(parseTextOverlayPlan({ endCard: { enabled: "yes" } })).toBeNull();
    expect(parseTextOverlayPlan("not an object")).toBeNull();
  });

  it("parses a well-formed plan and applies zod defaults", () => {
    const parsed = parseTextOverlayPlan({ endCard: { enabled: true } });
    expect(parsed?.endCard).toEqual({
      enabled: true,
      durationSec: VD_END_CARD_DURATION_BOUNDS.default,
      showFollowLine: true,
      styleVariant: "center_card",
    });
  });

  it("round-trips through vdTextOverlayPlanSchema directly", () => {
    const input = {
      cards: [
        {
          id: "c1",
          kind: "custom",
          anchor: { shotNumber: 1 },
          text: "hi",
          durationSec: 2,
          enabled: true,
        },
      ],
    };
    expect(vdTextOverlayPlanSchema.safeParse(input).success).toBe(true);
  });
});

describe("parseSeriesWatermarkConfig", () => {
  it("returns null for null/undefined", () => {
    expect(parseSeriesWatermarkConfig(null)).toBeNull();
  });

  it("returns null (never throws) for a malformed record", () => {
    expect(parseSeriesWatermarkConfig({ type: "not-a-type" })).toBeNull();
  });

  it("parses a well-formed text watermark and applies zod defaults", () => {
    const parsed = parseSeriesWatermarkConfig({
      enabled: true,
      type: "text",
      text: "@mychannel",
    });
    expect(parsed).toEqual({
      enabled: true,
      type: "text",
      text: "@mychannel",
      position: "top_right",
      opacity: 0.45,
      scalePct: 10,
      marginPx: 32,
    });
  });

  it("rejects opacity out of the 0.2-0.8 bound", () => {
    const parsed = vdSeriesWatermarkConfigSchema.safeParse({
      enabled: true,
      type: "text",
      opacity: 1.5,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects scalePct out of the 5-20 bound", () => {
    const parsed = vdSeriesWatermarkConfigSchema.safeParse({
      enabled: true,
      type: "image",
      scalePct: 50,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("listEnabledWatermarkSlots (dual watermark, planning/vd-dual-watermark/plan.md)", () => {
  it("returns [] for null/undefined config", () => {
    expect(listEnabledWatermarkSlots(null)).toEqual([]);
    expect(listEnabledWatermarkSlots(undefined)).toEqual([]);
  });

  it("legacy single-slot row: returns just the primary slot, secondary absent", () => {
    const config = parseSeriesWatermarkConfig({
      enabled: true,
      type: "text",
      text: "@mychannel",
    }) as VdSeriesWatermarkConfig;
    expect(config.secondary).toBeUndefined();

    const slots = listEnabledWatermarkSlots(config);
    expect(slots).toEqual([
      {
        slotId: "primary",
        slot: expect.objectContaining({ enabled: true, type: "text", text: "@mychannel" }),
      },
    ]);
  });

  it("both slots enabled: returns primary then secondary, in that order", () => {
    const config = parseSeriesWatermarkConfig({
      enabled: true,
      type: "text",
      text: "@series-brand",
      position: "top_left",
      secondary: {
        enabled: true,
        type: "image",
        imageUrl: "/api/storage/files/channel-logo.png",
        position: "bottom_right",
      },
    }) as VdSeriesWatermarkConfig;

    const slots = listEnabledWatermarkSlots(config);
    expect(slots.map(s => s.slotId)).toEqual(["primary", "secondary"]);
    expect(slots[0]!.slot).toEqual(
      expect.objectContaining({ type: "text", text: "@series-brand", position: "top_left" })
    );
    expect(slots[1]!.slot).toEqual(
      expect.objectContaining({
        type: "image",
        imageUrl: "/api/storage/files/channel-logo.png",
        position: "bottom_right",
      })
    );
  });

  it("secondary-only enabled: returns just the secondary slot when primary is disabled", () => {
    const config = parseSeriesWatermarkConfig({
      enabled: false,
      type: "text",
      text: "@series-brand",
      secondary: {
        enabled: true,
        type: "image",
        imageUrl: "/api/storage/files/channel-logo.png",
      },
    }) as VdSeriesWatermarkConfig;

    const slots = listEnabledWatermarkSlots(config);
    expect(slots).toEqual([
      {
        slotId: "secondary",
        slot: expect.objectContaining({
          enabled: true,
          type: "image",
          imageUrl: "/api/storage/files/channel-logo.png",
        }),
      },
    ]);
  });

  it("enabled: false on either slot drops it — both disabled returns []", () => {
    const config = parseSeriesWatermarkConfig({
      enabled: false,
      type: "text",
      text: "@series-brand",
      secondary: {
        enabled: false,
        type: "image",
        imageUrl: "/api/storage/files/channel-logo.png",
      },
    }) as VdSeriesWatermarkConfig;

    expect(listEnabledWatermarkSlots(config)).toEqual([]);
  });
});
