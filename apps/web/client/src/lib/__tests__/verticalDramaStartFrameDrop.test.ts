import { describe, expect, it, vi } from "vitest";

import {
  getBase64DataUrlByteLength,
  replaceVerticalDramaStartFrame,
  resolveVerticalDramaStartFrameDrop,
} from "@/lib/verticalDramaStartFrameDrop";

describe("resolveVerticalDramaStartFrameDrop", () => {
  it("uploads a local image before returning its durable URL", async () => {
    const upload = vi.fn().mockResolvedValue({
      url: "https://cdn.example.com/uploaded.png",
      fileType: "image/png",
    });

    await expect(
      resolveVerticalDramaStartFrameDrop(
        {
          kind: "upload",
          fileName: "portrait.png",
          fileType: "image/png",
          fileBase64: "data:image/png;base64,cG9ydHJhaXQ=",
        },
        upload
      )
    ).resolves.toEqual({
      url: "https://cdn.example.com/uploaded.png",
      mimeType: "image/png",
    });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("bypasses upload for an existing durable URL", async () => {
    const upload = vi.fn();

    await expect(
      resolveVerticalDramaStartFrameDrop(
        { kind: "url", url: "https://cdn.example.com/existing.jpg" },
        upload
      )
    ).resolves.toEqual({
      url: "https://cdn.example.com/existing.jpg",
      mimeType: "image/jpeg",
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("stops before asset resolution when upload fails", async () => {
    const uploadError = new Error("upload failed");

    await expect(
      resolveVerticalDramaStartFrameDrop(
        {
          kind: "upload",
          fileName: "portrait.png",
          fileType: "image/png",
          fileBase64: "data:image/png;base64,cG9ydHJhaXQ=",
        },
        vi.fn().mockRejectedValue(uploadError)
      )
    ).rejects.toBe(uploadError);
  });

  it("runs upload, asset resolution, and approval in order", async () => {
    const calls: string[] = [];

    await replaceVerticalDramaStartFrame(
      {
        kind: "upload",
        fileName: "portrait.png",
        fileType: "image/png",
        fileBase64: "data:image/png;base64,cG9ydHJhaXQ=",
      },
      {
        upload: async () => {
          calls.push("upload");
          return { url: "/uploads/portrait.png", fileType: "image/png" };
        },
        resolveMediaAsset: async () => {
          calls.push("resolve");
          return { mediaAssetId: "asset-42" };
        },
        setApprovedMediaAsset: async mediaAssetId => {
          calls.push(`approve:${mediaAssetId}`);
        },
      }
    );

    expect(calls).toEqual(["upload", "resolve", "approve:asset-42"]);
  });

  it("does not optimistically recover from an approval rejection", async () => {
    const approvalError = new Error("approval failed");
    const setApprovedMediaAsset = vi.fn().mockRejectedValue(approvalError);

    await expect(
      replaceVerticalDramaStartFrame(
        { kind: "url", url: "/uploads/existing.jpg" },
        {
          upload: vi.fn(),
          resolveMediaAsset: vi
            .fn()
            .mockResolvedValue({ mediaAssetId: "asset-42" }),
          setApprovedMediaAsset,
        }
      )
    ).rejects.toBe(approvalError);
    expect(setApprovedMediaAsset).toHaveBeenCalledWith("asset-42");
  });

  it("calculates decoded data URL size for client-side limits", () => {
    expect(getBase64DataUrlByteLength("data:image/png;base64,YWJjZA==")).toBe(
      4
    );
    expect(getBase64DataUrlByteLength("data:image/png,not-base64")).toBeNull();
  });
});
