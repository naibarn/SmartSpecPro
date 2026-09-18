// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticatedMediaImage,
  AuthenticatedMediaVideo,
  fetchAuthenticatedMedia,
  getAuthenticatedMediaUrl,
} from "./AuthenticatedMediaImage";

describe("AuthenticatedMediaImage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes a bare storage key to the protected storage route", () => {
    expect(
      getAuthenticatedMediaUrl("library/uploads/tenant-1/1/image.png")
    ).toBe("/api/storage/files/library/uploads/tenant-1/1/image.png");
    expect(getAuthenticatedMediaUrl("/api/storage/files/a.png")).toBe(
      "/api/storage/files/a.png"
    );
  });

  it("renders managed media through the native image loader", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <AuthenticatedMediaImage
        src="library/uploads/tenant-1/1/image.png"
        alt="Library image"
        className="preview"
        loading="lazy"
      />
    );

    expect(screen.getByAltText("Library image")).toHaveAttribute(
      "src",
      "/api/storage/files/library/uploads/tenant-1/1/image.png"
    );
    expect(screen.getByAltText("Library image")).toHaveAttribute(
      "loading",
      "lazy"
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("defers image decoding and loading unless a caller opts into another policy", () => {
    render(
      <AuthenticatedMediaImage
        src="library/uploads/tenant-1/1/image.png"
        alt="Deferred image"
      />
    );

    expect(screen.getByAltText("Deferred image")).toHaveAttribute(
      "loading",
      "lazy"
    );
    expect(screen.getByAltText("Deferred image")).toHaveAttribute(
      "decoding",
      "async"
    );
  });

  it("shows a readable fallback after bounded retries are exhausted", () => {
    vi.useFakeTimers();
    render(
      <AuthenticatedMediaImage
        src="/api/storage/files/missing.png"
        alt="Missing image"
        errorLabel="ไม่พบภาพ"
      />
    );

    fireEvent.error(screen.getByAltText("Missing image"));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    fireEvent.error(screen.getByAltText("Missing image"));
    act(() => {
      vi.advanceTimersByTime(750);
    });
    fireEvent.error(screen.getByAltText("Missing image"));
    expect(
      screen.getByRole("img", { name: "Missing image" })
    ).toHaveTextContent("ไม่พบภาพ");
  });

  it("retries failed images a bounded number of times and supports manual retry", () => {
    vi.useFakeTimers();
    render(
      <AuthenticatedMediaImage
        src="/api/storage/files/intermittent.png"
        alt="Intermittent image"
      />
    );

    fireEvent.error(screen.getByAltText("Intermittent image"));
    expect(screen.getByText("กำลังโหลดภาพ...")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByAltText("Intermittent image")).toHaveAttribute(
      "src",
      "/api/storage/files/intermittent.png?mediaRetry=1"
    );

    fireEvent.error(screen.getByAltText("Intermittent image"));
    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(screen.getByAltText("Intermittent image")).toHaveAttribute(
      "src",
      "/api/storage/files/intermittent.png?mediaRetry=2"
    );

    fireEvent.error(screen.getByAltText("Intermittent image"));
    expect(
      screen.getByRole("button", { name: "ลองโหลดใหม่" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ลองโหลดใหม่" }));
    expect(screen.getByAltText("Intermittent image")).toHaveAttribute(
      "src",
      "/api/storage/files/intermittent.png?mediaRetry=3"
    );
  });

  it("keeps public external URLs as normal image sources", () => {
    render(
      <AuthenticatedMediaImage
        src="https://cdn.example.com/image.png"
        alt="CDN image"
      />
    );
    expect(screen.getByAltText("CDN image")).toHaveAttribute(
      "src",
      "https://cdn.example.com/image.png"
    );
  });

  it("converts R2 object URLs to the protected storage route", () => {
    expect(
      getAuthenticatedMediaUrl(
        "https://account.r2.cloudflarestorage.com/bucket/images/location.png"
      )
    ).toBe("/api/storage/files/images/location.png");
  });

  it("replaces an expired external URL with a readable fallback", () => {
    vi.useFakeTimers();
    render(
      <AuthenticatedMediaImage
        src="https://cdn.example.com/expired.png"
        alt="Expired image"
      />
    );
    fireEvent.error(screen.getByAltText("Expired image"));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    fireEvent.error(screen.getByAltText("Expired image"));
    act(() => {
      vi.advanceTimersByTime(750);
    });
    fireEvent.error(screen.getByAltText("Expired image"));
    expect(screen.getByTitle("ไม่พบภาพ")).toBeInTheDocument();
  });

  it("fetches the normalized URL from the shared helper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("image", { status: 200 }))
    );
    await fetchAuthenticatedMedia("library/uploads/a.png");
    expect(fetch).toHaveBeenCalledWith(
      "/api/storage/files/library/uploads/a.png",
      expect.objectContaining({ credentials: "include" })
    );
  });
});

describe("AuthenticatedMediaVideo", () => {
  it("renders managed video through the protected storage route", () => {
    render(
      <AuthenticatedMediaVideo
        src="presentation/tenant-1/deck-7/video/slot-1/video.mp4"
        aria-label="Generated video"
        controls
      />
    );

    expect(screen.getByLabelText("Generated video")).toHaveAttribute(
      "src",
      "/api/storage/files/presentation/tenant-1/deck-7/video/slot-1/video.mp4"
    );
  });

  it("shows an explicit error state when video loading fails", () => {
    render(
      <AuthenticatedMediaVideo
        src="/api/storage/files/missing.mp4"
        aria-label="Missing video"
        errorLabel="ไม่สามารถโหลดวีดีโอได้"
      />
    );

    fireEvent.error(screen.getByLabelText("Missing video"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "ไม่สามารถโหลดวีดีโอได้"
    );
  });
});
