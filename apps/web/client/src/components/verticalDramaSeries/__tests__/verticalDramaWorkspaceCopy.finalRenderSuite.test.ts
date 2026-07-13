import { describe, expect, it } from "vitest";

import {
  VD_FINAL_RENDER_SUBTITLE_PRESET_IDS,
  vdAdBannerExclusionReasonLabel,
  vdCopy,
  vdCopyWithParams,
  vdFinalRenderSubtitlePresetLabel,
  vdSeasonRenderSkipReasonLabel,
} from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";

/**
 * Task #21 / W12.5 "Final Render Suite" phase B (dialogue audio + subtitles
 * for the whole-episode compiled video, plus season batch render) copy —
 * `VerticalDramaEpisodeWorkspace.tsx`'s new options section +
 * `VerticalDramaSeriesDetailPage.tsx`'s new season-render dialog. Mirrors
 * `verticalDramaWorkspaceCopy.adBannerPlan.test.ts`'s exact convention.
 */
describe("Final Render Suite copy (task #21 phase B)", () => {
  const keys = [
    "finalRenderOptionsTitle",
    "finalRenderIncludeDialogueAudioLabel",
    "finalRenderLoudnessNormalizeLabel",
    "finalRenderSubtitlePresetLabel",
    "finalRenderSubtitlePresetNone",
    "finalRenderResultTitle",
    "finalRenderResultSubtitleLinesTemplate",
    "finalRenderResultAudioSegmentsTemplate",
    "finalRenderResultExcludedBannersTitle",
    "finalRenderStartedSummaryTemplate",
    "finalRenderExcludedAdBannersToastTemplate",
    "adBannerExclusionUnknownReasonFallback",
    "seasonRenderButton",
    "seasonRenderDialogTitle",
    "seasonRenderDialogExplainer",
    "seasonRenderDialogConfirm",
    "seasonRenderSubmittedSummaryTemplate",
    "seasonRenderSkippedSummaryTemplate",
    "seasonRenderNoneSubmittedToast",
    "seasonRenderStartedToast",
    "seasonRenderFailedToast",
  ] as const;

  it("has a non-empty entry for every new key in both locales", () => {
    for (const key of keys) {
      expect(vdCopy("th")[key].length).toBeGreaterThan(0);
      expect(vdCopy("en")[key].length).toBeGreaterThan(0);
    }
  });

  it("matches the exact literal Copy Contract strings (Thai) given by the task brief", () => {
    expect(vdCopy("th").finalRenderIncludeDialogueAudioLabel).toBe(
      "รวมเสียงพูดที่สร้างไว้"
    );
    expect(vdCopy("th").finalRenderLoudnessNormalizeLabel).toBe(
      "ปรับความดังมาตรฐาน (loudness)"
    );
    expect(vdCopy("th").finalRenderSubtitlePresetNone).toBe(
      "ไม่ฝังซับไตเติล"
    );
    expect(vdCopy("th").seasonRenderButton).toBe("เรนเดอร์ทั้งซีซั่น");
    expect(vdCopy("th").seasonRenderDialogExplainer).toBe(
      "ระบบจะเรนเดอร์ทีละตอนย่อยตามลำดับ ตอนย่อยที่ไม่พร้อมจะถูกข้าม (แบนเนอร์ใช้ได้เฉพาะการเรนเดอร์รายตอนย่อยในเวอร์ชันนี้)"
    );
  });

  it("interpolates the started-summary template correctly (Thai + English)", () => {
    expect(
      vdCopyWithParams(vdCopy("th").finalRenderStartedSummaryTemplate, {
        subtitleLines: 12,
        audioSegments: 4,
      })
    ).toBe("เริ่มประกอบวิดีโอรวมตอนย่อยแล้ว — ซับไตเติล 12 บรรทัด, เสียงพูด 4 ช่วง");
    expect(
      vdCopyWithParams(vdCopy("en").finalRenderStartedSummaryTemplate, {
        subtitleLines: 12,
        audioSegments: 4,
      })
    ).toBe(
      "Started assembling the full Sub-episode video — 12 subtitle line(s), 4 audio segment(s)"
    );
  });

  it("interpolates the season submitted/skipped summary templates", () => {
    expect(
      vdCopyWithParams(vdCopy("th").seasonRenderSubmittedSummaryTemplate, {
        n: 3,
        episodes: "1, 2, 3",
      })
    ).toBe("คิวแล้ว 3 ตอนย่อย: 1, 2, 3");
    expect(
      vdCopyWithParams(vdCopy("en").seasonRenderSkippedSummaryTemplate, {
        n: 2,
      })
    ).toBe("Skipped 2 Sub-episode(s)");
  });

  describe("VD_FINAL_RENDER_SUBTITLE_PRESET_IDS + vdFinalRenderSubtitlePresetLabel", () => {
    it("has exactly the 9 style preset ids from the task brief, in order", () => {
      expect(VD_FINAL_RENDER_SUBTITLE_PRESET_IDS).toEqual([
        "classic_box",
        "minimal_shadow",
        "creator_pop",
        "karaoke_word",
        "highlight_bar",
        "lower_third",
        "cinematic_wide",
        "neon_glow",
        "review_bubble",
      ]);
    });

    it("has a non-empty Thai + English label for every preset id", () => {
      for (const id of VD_FINAL_RENDER_SUBTITLE_PRESET_IDS) {
        expect(vdFinalRenderSubtitlePresetLabel(id, "th").length).toBeGreaterThan(0);
        expect(vdFinalRenderSubtitlePresetLabel(id, "en").length).toBeGreaterThan(0);
      }
    });

    it("matches the exact Thai descriptors given by the task brief", () => {
      expect(vdFinalRenderSubtitlePresetLabel("classic_box", "th")).toBe(
        "กล่องคลาสสิก"
      );
      expect(vdFinalRenderSubtitlePresetLabel("minimal_shadow", "th")).toBe(
        "เงาบางเบา"
      );
      expect(vdFinalRenderSubtitlePresetLabel("creator_pop", "th")).toBe(
        "ครีเอเตอร์"
      );
      expect(vdFinalRenderSubtitlePresetLabel("karaoke_word", "th")).toBe(
        "คาราโอเกะ"
      );
      expect(vdFinalRenderSubtitlePresetLabel("highlight_bar", "th")).toBe(
        "แถบไฮไลต์"
      );
      expect(vdFinalRenderSubtitlePresetLabel("lower_third", "th")).toBe(
        "แถบล่างซ้าย"
      );
      expect(vdFinalRenderSubtitlePresetLabel("cinematic_wide", "th")).toBe(
        "ซีเนม่า"
      );
      expect(vdFinalRenderSubtitlePresetLabel("neon_glow", "th")).toBe(
        "นีออน"
      );
      expect(vdFinalRenderSubtitlePresetLabel("review_bubble", "th")).toBe(
        "บับเบิลรีวิว"
      );
    });
  });

  describe("vdAdBannerExclusionReasonLabel", () => {
    it("resolves both known exclusion codes to a short Thai/English label", () => {
      expect(
        vdAdBannerExclusionReasonLabel(
          "VD_EPISODE_AD_BANNER_DESIGN_NOT_READY",
          "th"
        )
      ).toBe("ดีไซน์ยังไม่พร้อม");
      expect(
        vdAdBannerExclusionReasonLabel(
          "VD_EPISODE_AD_BANNER_APPROVAL_REQUIRED",
          "th"
        )
      ).toBe("ต้องรออนุมัติก่อน");
      expect(
        vdAdBannerExclusionReasonLabel(
          "VD_EPISODE_AD_BANNER_DESIGN_NOT_READY",
          "en"
        )
      ).toBe("Design not ready");
    });

    it("falls back to the generic localized (never-raw-code) string for an unknown code", () => {
      expect(vdAdBannerExclusionReasonLabel("SOME_FUTURE_CODE", "th")).toBe(
        vdCopy("th").adBannerExclusionUnknownReasonFallback
      );
      expect(vdAdBannerExclusionReasonLabel("SOME_FUTURE_CODE", "th")).not.toBe(
        "SOME_FUTURE_CODE"
      );
    });
  });

  describe("vdSeasonRenderSkipReasonLabel", () => {
    it("maps the no-clips-at-all precondition message to a short Thai label", () => {
      expect(
        vdSeasonRenderSkipReasonLabel(
          "No video clips exist for this Sub-episode yet — generate the video motion prompt pack and render clips first.",
          "th"
        )
      ).toBe("ยังไม่มีคลิปวิดีโอ — ต้องสร้างชุดพรอมป์วิดีโอและเรนเดอร์คลิปก่อน");
    });

    it("maps the vertical_drama_assembly_missing_clips: prefix regardless of the dynamic shot list it carries", () => {
      const raw =
        "vertical_drama_assembly_missing_clips: shot(s)/clip(s) 3, 4 have no completed video yet. Generate those clips first, or pass allowPartial to concatenate only the completed clips in order.";
      expect(vdSeasonRenderSkipReasonLabel(raw, "th")).toBe(
        "มีช็อต/คลิปที่ยังไม่มีวิดีโอสมบูรณ์"
      );
    });

    it("maps the vertical_drama_assembly_no_clips: prefix", () => {
      const raw =
        "vertical_drama_assembly_no_clips: no completed video clips exist for this episode yet.";
      expect(vdSeasonRenderSkipReasonLabel(raw, "en")).toBe(
        "No completed video clips exist yet"
      );
    });

    it("passes an unrecognized reason through UNCHANGED (defensive — unknown reason shows raw)", () => {
      const raw = "some brand-new precondition message this file has never seen";
      expect(vdSeasonRenderSkipReasonLabel(raw, "th")).toBe(raw);
    });
  });
});
