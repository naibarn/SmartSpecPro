// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VideoNodeView from "./VideoNodeView";

function makeNodeViewProps(overrides: Record<string, any> = {}) {
  const attrs = {
    src: "https://example.com/video.mp4",
    poster: null as string | null,
    caption: null as string | null,
    controls: true,
    width: null as string | null,
    height: null as string | null,
    assetId: null as string | null,
    ...overrides,
  };

  return {
    node: {
      attrs,
      type: { name: "video" },
      isLeaf: true,
      textContent: "",
      content: { size: 0 },
    },
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    editor: {
      isEditable: overrides._editable !== undefined ? overrides._editable : true,
      view: { dom: document.createElement("div") },
    },
    selected: overrides._selected ?? false,
    getPos: () => 0,
    extension: {},
    HTMLAttributes: {},
    decorations: [],
  } as any;
}

describe("VideoNodeView", () => {
  it("renders <video> element with controls", () => {
    const props = makeNodeViewProps();
    const { container } = render(<VideoNodeView {...props} />);

    const video = container.querySelector("video");
    expect(video).toBeDefined();
    expect(video!.getAttribute("src")).toBe("https://example.com/video.mp4");
    expect(video!.hasAttribute("controls")).toBe(true);
    expect(video!.className).toContain("max-h-[75vh]");
  });

  it("shows caption below video when caption attr set", () => {
    const props = makeNodeViewProps({ caption: "Demo video" });
    render(<VideoNodeView {...props} />);

    expect(screen.getByText("Demo video")).toBeDefined();
  });

  it("validates src URL (rejects javascript: protocol)", () => {
    const props = makeNodeViewProps({ src: "javascript:alert(1)" });
    const { container } = render(<VideoNodeView {...props} />);

    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByTestId("unsafe-url-warning")).toBeDefined();
  });

  it("poster attribute applied to <video>", () => {
    const props = makeNodeViewProps({
      poster: "https://example.com/thumb.jpg",
    });
    const { container } = render(<VideoNodeView {...props} />);

    const video = container.querySelector("video");
    expect(video!.getAttribute("poster")).toBe("https://example.com/thumb.jpg");
  });

  it("poster with javascript: protocol is rejected", () => {
    const props = makeNodeViewProps({
      poster: "javascript:alert(1)",
    });
    const { container } = render(<VideoNodeView {...props} />);

    const video = container.querySelector("video");
    // Video should still render (src is valid), but poster should be absent
    expect(video).toBeDefined();
    expect(video!.getAttribute("poster")).toBeNull();
  });

  it("click in edit mode shows selection overlay", () => {
    const props = makeNodeViewProps();
    render(<VideoNodeView {...props} />);

    // Click on wrapper (not the video element itself)
    const wrapper = screen.getByTestId("video-node-view");
    const wrapperDiv = wrapper.querySelector("div.relative")!;
    fireEvent.click(wrapperDiv);

    expect(screen.getByTestId("media-selection-overlay")).toBeDefined();
  });

  it("does not show overlay in view mode", () => {
    const props = makeNodeViewProps({ _editable: false });
    render(<VideoNodeView {...props} />);

    const wrapper = screen.getByTestId("video-node-view");
    const wrapperDiv = wrapper.querySelector("div.relative")!;
    fireEvent.click(wrapperDiv);

    expect(screen.queryByTestId("media-selection-overlay")).toBeNull();
  });
});
