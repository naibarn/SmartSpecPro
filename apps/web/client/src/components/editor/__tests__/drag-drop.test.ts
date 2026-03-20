import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../uploadMedia", () => ({
  uploadMedia: vi.fn(),
  classifyMediaType: (mime: string) => {
    if (mime === "image/svg+xml") return null;
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return null;
  },
}));

import { handleDrop } from "../dropHandler";
import { uploadMedia } from "../uploadMedia";

const mockUpload = vi.mocked(uploadMedia);

function makeEditor() {
  return {
    isDestroyed: false,
    chain: vi.fn().mockReturnThis(),
    focus: vi.fn().mockReturnThis(),
    insertContentAt: vi.fn().mockReturnThis(),
    run: vi.fn().mockReturnValue(true),
  } as any;
}

function makeView(pos = 42) {
  return {
    posAtCoords: vi.fn().mockReturnValue({ pos }),
    state: { doc: { resolve: vi.fn() } },
    dispatch: vi.fn(),
  } as any;
}

function makeDragEvent(files: File[]): DragEvent {
  return {
    dataTransfer: {
      files: Object.assign(files, {
        item: (i: number) => files[i],
        length: files.length,
      }),
    },
    preventDefault: vi.fn(),
    clientX: 100,
    clientY: 200,
  } as unknown as DragEvent;
}

describe("handleDrop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dropping an image file triggers upload + insert at drop position", async () => {
    mockUpload.mockResolvedValue("https://cdn.example.com/photo.jpg");
    const editor = makeEditor();
    const view = makeView(42);
    const file = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    const event = makeDragEvent([file]);

    const result = handleDrop(view, event, null as any, false, editor);
    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(file);
    });

    await vi.waitFor(() => {
      expect(editor.chain).toHaveBeenCalled();
      expect(editor.insertContentAt).toHaveBeenCalled();
    });
  });

  it("dropping a non-media file is ignored", () => {
    const editor = makeEditor();
    const view = makeView();
    const file = new File(["pdf"], "doc.pdf", {
      type: "application/pdf",
    });
    const event = makeDragEvent([file]);

    const result = handleDrop(view, event, null as any, false, editor);
    expect(result).toBe(false);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("dropping multiple files inserts multiple nodes", async () => {
    mockUpload
      .mockResolvedValueOnce("https://cdn.example.com/img1.png")
      .mockResolvedValueOnce("https://cdn.example.com/img2.png")
      .mockResolvedValueOnce("https://cdn.example.com/clip.mp4");

    const editor = makeEditor();
    const view = makeView(10);
    const files = [
      new File(["a"], "img1.png", { type: "image/png" }),
      new File(["b"], "img2.png", { type: "image/png" }),
      new File(["c"], "clip.mp4", { type: "video/mp4" }),
    ];
    const event = makeDragEvent(files);

    const result = handleDrop(view, event, null as any, false, editor);
    expect(result).toBe(true);

    await vi.waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(3);
    });
  });

  it("dropping a video file inserts a VideoNode", async () => {
    mockUpload.mockResolvedValue("https://cdn.example.com/clip.mp4");
    const editor = makeEditor();
    const view = makeView(5);
    const file = new File(["v"], "clip.mp4", { type: "video/mp4" });
    const event = makeDragEvent([file]);

    handleDrop(view, event, null as any, false, editor);

    await vi.waitFor(() => {
      expect(editor.insertContentAt).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ type: "video" }),
      );
    });
  });

  it("dropping an audio file inserts an AudioNode", async () => {
    mockUpload.mockResolvedValue("https://cdn.example.com/song.mp3");
    const editor = makeEditor();
    const view = makeView(8);
    const file = new File(["a"], "song.mp3", { type: "audio/mpeg" });
    const event = makeDragEvent([file]);

    handleDrop(view, event, null as any, false, editor);

    await vi.waitFor(() => {
      expect(editor.insertContentAt).toHaveBeenCalledWith(
        8,
        expect.objectContaining({ type: "audio" }),
      );
    });
  });

  it("internal move (moved=true) returns false and does not upload", () => {
    const editor = makeEditor();
    const view = makeView();
    const file = new File(["x"], "img.png", { type: "image/png" });
    const event = makeDragEvent([file]);

    const result = handleDrop(view, event, null as any, true, editor);
    expect(result).toBe(false);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("dropping an SVG file is ignored (XSS prevention)", () => {
    const editor = makeEditor();
    const view = makeView();
    const file = new File(["<svg>"], "icon.svg", {
      type: "image/svg+xml",
    });
    const event = makeDragEvent([file]);

    const result = handleDrop(view, event, null as any, false, editor);
    expect(result).toBe(false);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
