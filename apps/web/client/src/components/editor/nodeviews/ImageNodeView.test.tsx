// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ImageNodeView from "./ImageNodeView";

function makeNodeViewProps(overrides: Record<string, any> = {}) {
  const attrs = {
    src: "https://example.com/photo.jpg",
    alt: "A photo",
    caption: null as string | null,
    alignment: "center",
    width: null as string | null,
    assetId: null as string | null,
    ...overrides,
  };

  return {
    node: {
      attrs,
      type: { name: "image" },
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

describe("ImageNodeView", () => {
  it("renders <img> with correct src and alt", () => {
    const props = makeNodeViewProps({ src: "https://example.com/photo.jpg", alt: "A photo" });
    render(<ImageNodeView {...props} />);

    const img = screen.getByRole("img");
    expect(img).toBeDefined();
    expect(img.getAttribute("src")).toBe("https://example.com/photo.jpg");
    expect(img.getAttribute("alt")).toBe("A photo");
  });

  it("shows caption below image when caption attr set", () => {
    const props = makeNodeViewProps({ caption: "Figure 1" });
    render(<ImageNodeView {...props} />);

    expect(screen.getByText("Figure 1")).toBeDefined();
  });

  it("click shows MediaSelectionOverlay with action buttons", () => {
    const props = makeNodeViewProps();
    render(<ImageNodeView {...props} />);

    // Overlay not visible initially
    expect(screen.queryByTestId("media-selection-overlay")).toBeNull();

    // Click on image wrapper
    const img = screen.getByRole("img");
    fireEvent.click(img.parentElement!);

    // Overlay now visible
    expect(screen.getByTestId("media-selection-overlay")).toBeDefined();
    expect(screen.getByLabelText("Remove")).toBeDefined();
    expect(screen.getByTestId("edit-alt-btn")).toBeDefined();
  });

  it('"Remove" button calls deleteNode()', () => {
    const props = makeNodeViewProps();
    render(<ImageNodeView {...props} />);

    // Show overlay
    const img = screen.getByRole("img");
    fireEvent.click(img.parentElement!);

    // Click remove
    fireEvent.click(screen.getByTestId("remove-btn"));
    expect(props.deleteNode).toHaveBeenCalled();
  });

  it('"Edit Alt" opens inline alt text editor', () => {
    const props = makeNodeViewProps({ alt: "Old alt" });
    render(<ImageNodeView {...props} />);

    // Show overlay and click Edit Alt
    const img = screen.getByRole("img");
    fireEvent.click(img.parentElement!);
    fireEvent.click(screen.getByTestId("edit-alt-btn"));

    // Alt editor appears with pre-filled value
    const altInput = screen.getByTestId("alt-editor").querySelector("input")!;
    expect(altInput).toBeDefined();
    expect(altInput.value).toBe("Old alt");

    // Type new value and confirm via blur
    fireEvent.change(altInput, { target: { value: "New alt text" } });
    fireEvent.blur(altInput);

    expect(props.updateAttributes).toHaveBeenCalledWith({ alt: "New alt text" });
  });

  it("does not show overlay in view mode", () => {
    const props = makeNodeViewProps({ _editable: false });
    render(<ImageNodeView {...props} />);

    const img = screen.getByRole("img");
    fireEvent.click(img.parentElement!);

    // Overlay should not appear
    expect(screen.queryByTestId("media-selection-overlay")).toBeNull();
  });

  it("blocks unsafe javascript: URLs", () => {
    const props = makeNodeViewProps({ src: "javascript:alert(1)" });
    render(<ImageNodeView {...props} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Unsafe URL blocked")).toBeDefined();
  });
});
