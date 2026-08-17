import { describe, expect, it } from "vitest";
import {
  buildEpisodeCoverPrompt,
  readEpisodeCoverVariants,
  readEpisodeCoverState,
  resolveEpisodeCoverReferenceCount,
  selectEpisodePreviewCoverSlot,
  selectEpisodeCoverReferences,
  toEpisodeCoverDisplay,
  upsertEpisodeCoverVariant,
} from "./episodeCover";

describe("episode cover prompt", () => {
  it("emits the exact approved Thai template without extra instructions", () => {
    expect(
      buildEpisodeCoverPrompt({
        seriesTitle: "คาเฟ่รีโนเวทเพื่อรัก ตอนรักลับในตึก",
        episodeNumber: 14,
        episodeTitle: "แผลเป็นและความจริง",
        synopsis: "ไอริณทำแผลให้ภูมิและได้รู้เรื่องราวในอดีตที่ภูมิพยายามปกป้องเธอมาตลอด",
        plotBeats: [
          "ภูมิเล่าว่าแผลที่มือเกิดจากการแย่งชิงเอกสารสิทธิ์ตึกกับคนของกฤต",
          "ไอริณซาบซึ้งในความรักของพี่ชาย",
          "ภาคินสัญญาว่าจะใช้ทักษะสถาปนิกพิสูจน์ความจริงเรื่องโครงสร้างตึกให้ได้",
        ],
      }),
    ).toBe(`ช่วยหน้าปก ซีรีย์

คาเฟ่รีโนเวทเพื่อรัก ตอนรักลับในตึก

**ตอนย่อยที่ 14  · แผลเป็นและความจริง**

**เรื่องย่อ**

ไอริณทำแผลให้ภูมิและได้รู้เรื่องราวในอดีตที่ภูมิพยายามปกป้องเธอมาตลอด

**จุดดำเนินเรื่อง**

ภูมิเล่าว่าแผลที่มือเกิดจากการแย่งชิงเอกสารสิทธิ์ตึกกับคนของกฤต
ไอริณซาบซึ้งในความรักของพี่ชาย
ภาคินสัญญาว่าจะใช้ทักษะสถาปนิกพิสูจน์ความจริงเรื่องโครงสร้างตึกให้ได้`);
  });

  it("omits empty sections without inventing text", () => {
    expect(
      buildEpisodeCoverPrompt({
        seriesTitle: "เรื่องหลัก",
        episodeNumber: 1,
        episodeTitle: "ตอนแรก",
      }),
    ).toBe("ช่วยหน้าปก ซีรีย์\n\nเรื่องหลัก\n\n**ตอนย่อยที่ 1  · ตอนแรก**");
  });

  it("adds generic, slot-specific composition directions without story-specific assumptions", () => {
    const prompts = ([1, 2, 3, 4] as const).map(coverSlotId =>
      buildEpisodeCoverPrompt({
        seriesTitle: "เรื่องหลัก",
        episodeNumber: 1,
        episodeTitle: "ตอนแรก",
        synopsis: "ตัวละครเผชิญเหตุการณ์สำคัญ",
        coverSlotId,
      })
    );

    expect(new Set(prompts).size).toBe(4);
    expect(prompts[0]).toContain("เน้นตัวละครหรือความสัมพันธ์หลัก");
    expect(prompts[1]).toContain("เปิดบริบทสถานที่และบรรยากาศ");
    expect(prompts[2]).toContain("เน้นการกระทำ ปฏิสัมพันธ์ หรือความขัดแย้ง");
    expect(prompts[3]).toContain("มุมกล้องหรือการจัดเฟรมแบบภาพยนตร์ที่แตกต่าง");
    for (const prompt of prompts) {
      expect(prompt).not.toContain("คาเฟ่");
      expect(prompt).not.toContain("ขอแต่งงาน");
    }
  });
});

describe("approved Start Frame selection", () => {
  const candidates = Array.from({ length: 9 }, (_, index) => ({
    shotNumber: index + 1,
    approvedMediaAssetId: `asset-${index + 1}`,
    sourceIndex: index,
    visual: index === 6 ? "แผลที่มือในห้องทำแผล" : "ทางเดินในตึก",
    action: index === 6 ? "ไอริณทำแผลให้ภูมิ" : "เดินและมองเอกสาร",
    characters: index === 6 ? ["ไอริณ", "ภูมิ"] : ["ภาคิน"],
    location: index === 6 ? "ห้องทำแผล" : "ตึกเก่า",
  }));

  it("caps references at four and preserves shot order", () => {
    const result = selectEpisodeCoverReferences(
      candidates,
      "ไอริณทำแผลให้ภูมิในห้องทำแผล",
    );
    expect(result).toHaveLength(4);
    expect(result.map(item => item.shotNumber)).toEqual(
      [...result.map(item => item.shotNumber)].sort((a, b) => a - b),
    );
  });

  it("uses a deterministic evenly-spaced fallback when there is no overlap", () => {
    expect(
      selectEpisodeCoverReferences(
        candidates.map(candidate => ({ ...candidate, visual: "", action: "" })),
        "ข้อความที่ไม่ตรงกัน",
      ).map(item => item.shotNumber),
    ).toEqual([1, 4, 6, 9]);
  });
});

describe("cover state parsing", () => {
  it("normalizes malformed values and strips internal data from display", () => {
    const state = readEpisodeCoverState({
      status: "ready",
      mediaAssetId: "44",
      idempotencyKey: "secret",
      sourceShotNumbers: [1, 0, "2", 3],
    });
    expect(state).toMatchObject({ mediaAssetId: "44", idempotencyKey: "secret" });
    expect(state?.sourceShotNumbers).toEqual([1, 3]);
    expect(toEpisodeCoverDisplay(state, "https://cdn/cover.jpg")).toEqual({
      status: "ready",
      url: "https://cdn/cover.jpg",
      modelId: null,
      sourceShotNumbers: [1, 3],
      error: null,
      pendingTaskId: null,
    });
    expect(readEpisodeCoverState({ status: "unknown" })).toBeNull();
  });

  it("keeps the previous cover visible during a replacement", () => {
    expect(
      toEpisodeCoverDisplay(
        { status: "generating", mediaAssetId: "44", modelId: "new-model" },
        "https://cdn/previous-cover.jpg",
      ),
    ).toMatchObject({
      status: "generating",
      url: "https://cdn/previous-cover.jpg",
      pendingTaskId: null,
    });
  });

  it("keeps legacy cover data and adds independent variant slots", () => {
    const envelope = upsertEpisodeCoverVariant(
      { status: "ready", mediaAssetId: "44" },
      3,
      { status: "ready", mediaAssetId: "99", source: "upload" }
    );
    expect(readEpisodeCoverState(envelope, 1)).toMatchObject({
      mediaAssetId: "44",
    });
    expect(readEpisodeCoverState(envelope, 3)).toMatchObject({
      mediaAssetId: "99",
    });
    expect(readEpisodeCoverVariants(envelope)).toHaveLength(2);
  });

  it("uses one, two, three, and deterministic random references per cover slot", () => {
    expect(resolveEpisodeCoverReferenceCount(1, 4, "seed")).toMatchObject({
      strategy: "one",
      count: 1,
    });
    expect(resolveEpisodeCoverReferenceCount(2, 4, "seed")).toMatchObject({
      strategy: "two",
      count: 2,
    });
    expect(resolveEpisodeCoverReferenceCount(3, 4, "seed")).toMatchObject({
      strategy: "three",
      count: 3,
    });
    expect(resolveEpisodeCoverReferenceCount(4, 4, "seed")).toEqual(
      resolveEpisodeCoverReferenceCount(4, 4, "seed")
    );
  });

  it("prefers unused ready covers and reuses them only after all are used", () => {
    expect(selectEpisodePreviewCoverSlot([1, 2, 3], [1], "a")).not.toBe(1);
    expect(selectEpisodePreviewCoverSlot([2], [2], "a")).toBe(2);
    expect(selectEpisodePreviewCoverSlot([], [], "a")).toBeNull();
  });
});
