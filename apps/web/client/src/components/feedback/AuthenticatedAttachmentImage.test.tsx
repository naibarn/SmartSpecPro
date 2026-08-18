// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  AuthenticatedAttachmentImage,
  fetchAuthenticatedAttachment,
  getAuthenticatedAttachmentUrl,
} from "./AuthenticatedAttachmentImage";

describe("AuthenticatedAttachmentImage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the protected URL with credentials and renders a blob URL", async () => {
    const blob = new Blob(["image-bytes"], { type: "image/jpeg" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(blob, { status: 200 }));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-image");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(
      <AuthenticatedAttachmentImage
        src="/api/storage/files/feedback/319/Screenshot_82.jpg"
        alt="Screenshot_82.jpg"
      />
    );

    await waitFor(() =>
      expect(screen.getByRole("img")).toHaveAttribute("src", "blob:test-image")
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/storage/files/feedback/319/Screenshot_82.jpg",
      { credentials: "include", cache: "no-store" }
    );
  });

  it("normalizes a legacy storage key into the protected proxy URL", () => {
    expect(getAuthenticatedAttachmentUrl("feedback/316/old.png")).toBe(
      "/api/storage/files/feedback/316/old.png"
    );
    expect(
      getAuthenticatedAttachmentUrl("/api/storage/files/feedback/316/old.png")
    ).toBe("/api/storage/files/feedback/316/old.png");
  });

  it("exposes a failed protected request as a non-broken placeholder", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 })
    );

    render(
      <AuthenticatedAttachmentImage
        src="/api/storage/files/feedback/missing.jpg"
        alt="missing attachment"
      />
    );

    await waitFor(() =>
      expect(screen.getByRole("img")).toHaveAttribute(
        "title",
        "ไม่สามารถโหลดภาพแนบได้"
      )
    );
    expect(
      screen.queryByRole("img", { name: "missing attachment" })
    ).toBeInTheDocument();
  });

  it("returns the response body for callers that need to open a file", async () => {
    const blob = new Blob(["file"], { type: "image/png" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(blob, { status: 200 })
    );

    const result = await fetchAuthenticatedAttachment("/protected/file.png");
    expect(result).toBeDefined();
    expect(result.size).toBeGreaterThan(0);
  });
});
