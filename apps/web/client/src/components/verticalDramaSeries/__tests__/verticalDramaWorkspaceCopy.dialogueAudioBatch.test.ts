import { describe, expect, it } from "vitest";

import { vdCopy, vdCopyWithParams } from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";

/**
 * Whole-episode dialogue TTS batch copy (W12-B, spec feature 131 §14/§7.4
 * voice chain wave) — see `VerticalDramaDialogueAudioPanel.tsx`'s new
 * `batch`-gated block.
 */
describe("Dialogue audio batch copy (W12-B)", () => {
  const keys = [
    "dialogueAudioSummaryTemplate",
    "dialogueAudioGenerateBatchCta",
    "dialogueAudioGenerateBatchConfirmTitle",
    "dialogueAudioGenerateBatchConfirmBody",
    "dialogueAudioNoPendingLines",
    "dialogueAudioBatchSubmittedTemplate",
    "dialogueAudioBatchFailuresTemplate",
    "dialogueAudioMissingCastTitle",
    "dialogueAudioMissingCastLink",
    "dialogueAudioStatusQueued",
    "dialogueAudioStatusGenerating",
    "dialogueAudioStatusReady",
    "dialogueAudioStatusFailed",
    "dialogueAudioStatusBlocked",
    "dialogueAudioRetryLine",
    "dialogueAudioPlayerLabelTemplate",
  ] as const;

  it("has a non-empty entry for every new key in both locales", () => {
    for (const key of keys) {
      expect(vdCopy("th")[key].length).toBeGreaterThan(0);
      expect(vdCopy("en")[key].length).toBeGreaterThan(0);
    }
  });

  it("matches the exact literal Copy Contract strings (Thai)", () => {
    expect(vdCopy("th").dialogueAudioMissingCastLink).toBe("ไปกำหนดเสียงที่แท็บตัวละคร");
    expect(vdCopy("th").dialogueAudioStatusQueued).toBe("รอคิว");
    expect(vdCopy("th").dialogueAudioStatusGenerating).toBe("กำลังสร้าง");
    expect(vdCopy("th").dialogueAudioStatusReady).toBe("พร้อมใช้งาน");
    expect(vdCopy("th").dialogueAudioStatusFailed).toBe("ล้มเหลว");
  });

  it("interpolates the ready/total summary template correctly (Thai)", () => {
    const text = vdCopyWithParams(vdCopy("th").dialogueAudioSummaryTemplate, {
      ready: 3,
      total: 9,
    });
    expect(text).toBe("เสียงพูด: 3/9 บรรทัด");
  });

  it("interpolates the batch-submitted toast template correctly (Thai)", () => {
    const text = vdCopyWithParams(vdCopy("th").dialogueAudioBatchSubmittedTemplate, {
      submitted: 5,
      skipped: 2,
      credits: 12,
    });
    expect(text).toBe("ส่งสร้างเสียงพูด 5 บรรทัด (ข้าม 2 บรรทัดที่มีอยู่แล้ว) ~12 เครดิต");
  });
});
