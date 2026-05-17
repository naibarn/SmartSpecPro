/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { useImageUpload } from "./useImageUpload";

const { mockUploadMutateAsync } = vi.hoisted(() => ({
  mockUploadMutateAsync: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    ai: {
      upload: {
        useMutation: () => ({ mutateAsync: mockUploadMutateAsync }),
      },
    },
  },
}));

describe("useImageUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads image files through the existing tRPC ai.upload endpoint", async () => {
    mockUploadMutateAsync.mockResolvedValue({
      key: "chat/uploads/24/test.png",
      url: "/uploads/chat/uploads/24/test.png",
      fileType: "image/png",
    });

    const { result } = renderHook(() => useImageUpload());
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "test.png", {
      type: "image/png",
    });

    let uploadedUrl = "";
    await act(async () => {
      uploadedUrl = await result.current.upload(file, { retry: 1 });
    });

    expect(uploadedUrl).toBe("/uploads/chat/uploads/24/test.png");
    expect(mockUploadMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      fileName: "test.png",
      fileType: "image/png",
      fileBase64: expect.stringMatching(/^data:image\/png;base64,/),
    }));
  });
});
