import { describe, expect, it } from "vitest";

import { decodeVisualSearchImageForTest } from "./marketplaceCapture";

const tinyJpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xdb]).toString("base64");

describe("marketplace visual product search validation", () => {
  it("accepts a valid jpeg query image", () => {
    const buffer = decodeVisualSearchImageForTest({
      imageBase64: tinyJpegBase64,
      mimeType: "image/jpeg",
    });

    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);
  });

  it("accepts a data-url prefixed query image", () => {
    const buffer = decodeVisualSearchImageForTest({
      imageBase64: `data:image/jpeg;base64,${tinyJpegBase64}`,
      mimeType: "image/jpeg",
    });

    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);
  });

  it("rejects malformed base64 before image search", () => {
    expect(() =>
      decodeVisualSearchImageForTest({
        imageBase64: "not-valid-base64!",
        mimeType: "image/jpeg",
      }),
    ).toThrow("ข้อมูลรูปภาพไม่ใช่ base64 ที่ถูกต้อง");
  });

  it("rejects image bytes that do not match the declared mime type", () => {
    expect(() =>
      decodeVisualSearchImageForTest({
        imageBase64: tinyJpegBase64,
        mimeType: "image/png",
      }),
    ).toThrow("ชนิดไฟล์รูปภาพไม่ตรงกับข้อมูลจริง");
  });

  it("rejects query images larger than 5MB", () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    oversized[0] = 0xff;
    oversized[1] = 0xd8;

    expect(() =>
      decodeVisualSearchImageForTest({
        imageBase64: oversized.toString("base64"),
        mimeType: "image/jpeg",
      }),
    ).toThrow("รูปภาพต้องมีขนาดไม่เกิน 5MB");
  });
});
