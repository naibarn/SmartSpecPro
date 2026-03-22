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
  validateAttachmentFile: (file: File) => {
    if (file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/")) {
      return "Use the media insert flow for images, videos, or audio files.";
    }
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
      "application/x-zip-compressed",
      "application/vnd.rar",
      "application/x-rar-compressed",
      "application/x-7z-compressed",
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
      "application/xml",
      "text/html",
    ];
    return allowed.includes(file.type) ? null : "Invalid file type.";
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
    setImage: vi.fn().mockReturnThis(),
    setVideo: vi.fn().mockReturnThis(),
    setAudio: vi.fn().mockReturnThis(),
    setAttachment: vi.fn().mockReturnThis(),
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
    mockUpload.mockResolvedValue({
      url: "https://cdn.example.com/photo.jpg",
      sourceUrl: "https://cdn.example.com/photo.jpg",
      assetId: "asset-1",
      title: "photo",
      itemType: "image",
      mimeType: "image/jpeg",
      thumbnailUrl: null,
      metadata: {},
    });
    const editor = makeEditor();
    const onInserted = vi.fn();
    const view = makeView(42);
    const file = new File(["img"], "photo.jpg", { type: "image/jpeg" });
    const event = makeDragEvent([file]);

    const result = handleDrop(view, event, null as any, false, editor, {
      onInserted,
    });
    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ metadata: undefined }),
      );
    });

    await vi.waitFor(() => {
      expect(editor.chain).toHaveBeenCalled();
      expect(editor.insertContentAt).toHaveBeenCalled();
    });

    expect(onInserted).toHaveBeenCalledWith(editor);
  });

  it("dropping a non-supported file is ignored", () => {
    const editor = makeEditor();
    const view = makeView();
    const file = new File(["bin"], "program.exe", {
      type: "application/x-msdownload",
    });
    const event = makeDragEvent([file]);

    const result = handleDrop(view, event, null as any, false, editor);
    expect(result).toBe(false);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("dropping multiple files inserts multiple nodes", async () => {
    mockUpload
      .mockResolvedValueOnce({
        url: "https://cdn.example.com/img1.png",
        sourceUrl: "https://cdn.example.com/img1.png",
        assetId: "asset-1",
        title: "img1",
        itemType: "image",
        mimeType: "image/png",
        thumbnailUrl: null,
        metadata: {},
      })
      .mockResolvedValueOnce({
        url: "https://cdn.example.com/img2.png",
        sourceUrl: "https://cdn.example.com/img2.png",
        assetId: "asset-2",
        title: "img2",
        itemType: "image",
        mimeType: "image/png",
        thumbnailUrl: null,
        metadata: {},
      })
      .mockResolvedValueOnce({
        url: "https://cdn.example.com/clip.mp4",
        sourceUrl: "https://cdn.example.com/clip.mp4",
        assetId: "asset-3",
        title: "clip",
        itemType: "video",
        mimeType: "video/mp4",
        thumbnailUrl: null,
        metadata: {},
      });

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
    mockUpload.mockResolvedValue({
      url: "https://cdn.example.com/clip.mp4",
      sourceUrl: "https://cdn.example.com/clip.mp4",
      assetId: "asset-1",
      title: "clip",
      itemType: "video",
      mimeType: "video/mp4",
      thumbnailUrl: null,
      metadata: {},
    });
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
    mockUpload.mockResolvedValue({
      url: "https://cdn.example.com/song.mp3",
      sourceUrl: "https://cdn.example.com/song.mp3",
      assetId: "asset-1",
      title: "song",
      itemType: "audio",
      mimeType: "audio/mpeg",
      thumbnailUrl: null,
      metadata: {},
    });
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

  it("dropping a PDF file inserts an attachment node", async () => {
    mockUpload.mockResolvedValue({
      url: "https://cdn.example.com/file.pdf",
      sourceUrl: "https://cdn.example.com/file.pdf",
      assetId: "asset-pdf",
      title: "file",
      itemType: "document",
      mimeType: "application/pdf",
      thumbnailUrl: null,
      metadata: {},
    });
    const editor = makeEditor();
    const view = makeView(12);
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const event = makeDragEvent([file]);

    handleDrop(view, event, null as any, false, editor);

    await vi.waitFor(() => {
      expect(editor.insertContentAt).toHaveBeenCalledWith(
        12,
        expect.objectContaining({ type: "attachment" }),
      );
    });
  });

  it("dropping a ZIP archive inserts an attachment node", async () => {
    mockUpload.mockResolvedValue({
      url: "https://cdn.example.com/archive.zip",
      sourceUrl: "https://cdn.example.com/archive.zip",
      assetId: "asset-zip",
      title: "archive",
      itemType: "file",
      mimeType: "application/zip",
      thumbnailUrl: null,
      metadata: {},
    });
    const editor = makeEditor();
    const view = makeView(18);
    const file = new File(["zip"], "archive.zip", { type: "application/zip" });
    const event = makeDragEvent([file]);

    handleDrop(view, event, null as any, false, editor);

    await vi.waitFor(() => {
      expect(editor.insertContentAt).toHaveBeenCalledWith(
        18,
        expect.objectContaining({ type: "attachment" }),
      );
    });
  });
});
