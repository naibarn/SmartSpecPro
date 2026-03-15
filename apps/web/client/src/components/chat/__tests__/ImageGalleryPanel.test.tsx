import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { mockDeleteMutate, mockPinMutate } = vi.hoisted(() => ({
  mockDeleteMutate: vi.fn(),
  mockPinMutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    memory: {
      deleteImageFromMemory: { useMutation: vi.fn(() => ({ mutate: mockDeleteMutate, isPending: false })) },
      pinImageToMemory: { useMutation: vi.fn(() => ({ mutate: mockPinMutate, isPending: false })) },
    },
  },
}));

import { ImageGalleryPanel } from "../ImageGalleryPanel";

const IMAGES = [
  { assetId: 1, fileUrl: "https://example.com/1.jpg", caption: "First image", tags: ["cat", "pet"], role: "memory" as const },
  { assetId: 2, fileUrl: "https://example.com/2.jpg", caption: "Second image", tags: [], role: "current" as const },
  { assetId: 3, fileUrl: "https://example.com/3.jpg", caption: "Third image", role: "memory" as const },
];

function renderPanel(images = IMAGES, open = true) {
  const onToggle = vi.fn();
  const onImageRemoved = vi.fn();
  const { container } = render(
    <ImageGalleryPanel
      images={images}
      conversationId={100}
      open={open}
      onToggle={onToggle}
      onImageRemoved={onImageRemoved}
    />
  );
  return { container, onToggle, onImageRemoved };
}

describe("ImageGalleryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders thumbnails for referenced images", () => {
    renderPanel();
    const imgs = screen.getAllByRole("img");
    // At minimum we expect thumbnail images to render
    expect(imgs.length).toBeGreaterThanOrEqual(IMAGES.length);
  });

  it("shows caption for each image", () => {
    renderPanel();
    expect(screen.getByText("First image")).toBeTruthy();
    expect(screen.getByText("Second image")).toBeTruthy();
  });

  it("includes Remove from memory button for each image", () => {
    renderPanel();
    const removeBtns = screen.getAllByTitle(/remove/i);
    expect(removeBtns.length).toBe(IMAGES.length);
  });

  it("calls deleteImageFromMemory mutation on remove click", () => {
    renderPanel();
    const removeBtns = screen.getAllByTitle(/remove/i);
    fireEvent.click(removeBtns[0]);
    expect(mockDeleteMutate).toHaveBeenCalledWith(expect.objectContaining({ assetId: 1 }));
  });

  it("calls pinImageToMemory mutation on pin click", () => {
    renderPanel();
    const pinBtns = screen.getAllByTitle(/pin/i);
    fireEvent.click(pinBtns[0]);
    expect(mockPinMutate).toHaveBeenCalledWith(expect.objectContaining({ assetId: 1 }));
  });

  it("renders nothing when images array is empty", () => {
    const { container } = renderPanel([]);
    expect(container.firstChild).toBeNull();
  });

  it("panel can be collapsed and expanded via toggle button", () => {
    const { onToggle } = renderPanel(IMAGES, true);
    const toggleBtn = screen.getByRole("button", { name: /close|collapse|gallery/i });
    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalled();
  });
});
