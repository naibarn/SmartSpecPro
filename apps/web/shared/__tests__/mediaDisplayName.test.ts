import { describe, expect, it } from "vitest";

import {
  buildMediaContentDisposition,
  buildMediaDownloadFilename,
  resolveMediaDisplayName,
} from "../mediaDisplayName";

describe("media display names", () => {
  it("uses Vertical Drama series, episode, shot, and clip metadata", () => {
    const result = resolveMediaDisplayName({
      mediaType: "video",
      prompt: "remotion_render_mp4",
      parameters: {
        extra_params: {
          __media_series_title: "คาเฟ่รักในเวทีพิเศษ",
          __media_episode_number: 29,
          __media_shot_number: 1,
          __media_clip_number: 2,
        },
      },
    });

    expect(result.title).toBe("คาเฟ่รักในเวทีพิเศษ ตอนที่ 29-1 คลิป 2");
    expect(result.filename).toBe(
      "คาเฟ่รักในเวทีพิเศษ-ตอนที่-29-1-คลิป-2.mp4",
    );
  });

  it("prefers an explicit meaningful title over prompt and model metadata", () => {
    expect(
      resolveMediaDisplayName({
        mediaType: "image",
        explicitTitle: "ภาพปกตอนจบ",
        prompt: "A cinematic portrait",
        parameters: { model: "gpt-image-2" },
      }).title,
    ).toBe("ภาพปกตอนจบ");
  });

  it("uses a cleaned prompt for generic media", () => {
    expect(
      resolveMediaDisplayName({
        mediaType: "image",
        prompt: "A quiet cafe by the sea. cinematic lighting",
        parameters: { model: "gpt-image-2" },
      }).title,
    ).toBe("A quiet cafe by the sea");
  });

  it("does not expose technical renderer names when meaningful metadata is absent", () => {
    expect(
      resolveMediaDisplayName({
        mediaType: "video",
        prompt: "remotion_render_mp4 (remotion render)",
        sourceFilename: "remotion_render_mp4",
      }).title,
    ).toBe("วิดีโอที่สร้างใหม่");
  });

  it("sanitizes download filenames and preserves a trusted source extension", () => {
    expect(
      buildMediaDownloadFilename({
        title: "เรื่อง/ตอนที่ 1: ฉาก \"เปิด\"",
        mediaType: "video",
        sourceFilename: "output.webm",
      }),
    ).toBe("เรื่อง-ตอนที่-1-ฉาก-เปิด.webm");
  });

  it("builds a Unicode-safe attachment header with an ASCII fallback", () => {
    const header = buildMediaContentDisposition("คาเฟ่รัก ตอนที่ 1.mp4");
    expect(header).toContain('attachment; filename="');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).not.toMatch(/[\u0000-\u001f\u007f\"]\r?\n/);
  });
});
