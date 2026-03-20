import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SafeMarkdown } from "@/components/chat/SafeMarkdown";

describe("SafeMarkdown media data-* attribute handling", () => {
  it("preserves data-poster as poster attribute on video", () => {
    const html =
      '<video src="https://example.com/v.mp4" data-poster="https://example.com/thumb.jpg" controls></video>';
    render(<SafeMarkdown>{html}</SafeMarkdown>);
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    expect(video!.getAttribute("poster")).toBe(
      "https://example.com/thumb.jpg",
    );
  });

  it("preserves data-caption as visible text below video", () => {
    const html =
      '<video src="https://example.com/v.mp4" data-caption="My caption" controls></video>';
    render(<SafeMarkdown>{html}</SafeMarkdown>);
    expect(screen.getByText("My caption")).toBeTruthy();
  });

  it("preserves data-asset-id as data attribute on video", () => {
    const html =
      '<video src="https://example.com/v.mp4" data-asset-id="abc-123" controls></video>';
    render(<SafeMarkdown>{html}</SafeMarkdown>);
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    expect(video!.getAttribute("data-asset-id")).toBe("abc-123");
  });

  it("strips non-whitelisted data attributes", () => {
    const html =
      '<video src="https://example.com/v.mp4" data-malicious="evil" controls></video>';
    render(<SafeMarkdown>{html}</SafeMarkdown>);
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    expect(video!.getAttribute("data-malicious")).toBeNull();
  });

  it("renders caption as text below video player", () => {
    const html =
      '<video src="https://example.com/v.mp4" data-caption="Test caption" controls></video>';
    const { container } = render(<SafeMarkdown>{html}</SafeMarkdown>);
    expect(screen.getByText("Test caption")).toBeTruthy();
    // Caption should be in a <p> or similar element after the video
    const video = container.querySelector("video");
    const figure = video?.closest("figure");
    expect(figure).toBeTruthy();
    const captionEl = figure!.querySelector("p");
    expect(captionEl).toBeTruthy();
    expect(captionEl!.textContent).toBe("Test caption");
  });

  it("sanitizes javascript: protocol in data-poster", () => {
    const html =
      '<video src="https://example.com/v.mp4" data-poster="javascript:alert(1)" controls></video>';
    render(<SafeMarkdown>{html}</SafeMarkdown>);
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    // poster should be absent (not rendered at all)
    expect(video!.hasAttribute("poster")).toBe(false);
  });

  it("renders existing documents without data-* attrs correctly", () => {
    const html =
      '<video src="https://example.com/v.mp4" controls></video>';
    render(<SafeMarkdown>{html}</SafeMarkdown>);
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    expect(video!.getAttribute("src")).toBe("https://example.com/v.mp4");
    expect(video!.hasAttribute("controls")).toBe(true);
    // No caption should appear
    expect(document.querySelector("figure p")).toBeNull();
  });

  it("renders audio tag with data-caption", () => {
    const html =
      '<audio src="https://example.com/a.mp3" data-caption="Audio title" controls></audio>';
    render(<SafeMarkdown>{html}</SafeMarkdown>);
    expect(screen.getByText("Audio title")).toBeTruthy();
  });

  it("renders mixed content with text and video correctly", () => {
    const html =
      'Some text before\n\n<video src="https://example.com/v.mp4" data-caption="Cap" controls></video>\n\nSome text after';
    render(<SafeMarkdown>{html}</SafeMarkdown>);
    expect(screen.getByText(/Some text before/)).toBeTruthy();
    expect(screen.getByText("Cap")).toBeTruthy();
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    expect(screen.getByText(/Some text after/)).toBeTruthy();
  });
});
