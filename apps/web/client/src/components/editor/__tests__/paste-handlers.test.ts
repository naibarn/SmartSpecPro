import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DOMPurify for node environment (no DOM available)
vi.mock("dompurify", () => ({
  default: {
    sanitize: (html: string, _config?: unknown) => {
      // Simplified sanitizer: strip script/style/iframe/object/embed tags and event handlers
      let cleaned = html;
      cleaned = cleaned.replace(
        /<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi,
        "",
      );
      cleaned = cleaned.replace(
        /<(script|style|iframe|object|embed)\b[^>]*\/?>/gi,
        "",
      );
      cleaned = cleaned.replace(
        /\s+(?:onerror|onload|onclick|onmouseover|onfocus)="[^"]*"/gi,
        "",
      );
      return cleaned;
    },
  },
}));

// Mock uploadMedia before importing handlers
vi.mock("../uploadMedia", () => ({
  uploadMedia: vi.fn(),
  classifyMediaType: vi.fn((mime: string) => {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return null;
  }),
}));

import { handlePaste, transformPastedHTML } from "../pasteHandlers";
import { uploadMedia } from "../uploadMedia";

const mockUpload = vi.mocked(uploadMedia);

function makeEditor(overrides?: Partial<Record<string, unknown>>) {
  return {
    isDestroyed: false,
    chain: vi.fn().mockReturnThis(),
    focus: vi.fn().mockReturnThis(),
    setImage: vi.fn().mockReturnThis(),
    run: vi.fn().mockReturnValue(true),
    ...overrides,
  } as any;
}

function makeView() {
  return {
    state: { selection: { from: 0 } },
    dispatch: vi.fn(),
  } as any;
}

function makeClipboardEvent(items: DataTransferItem[]): ClipboardEvent {
  const event = {
    clipboardData: {
      items,
      files: [] as File[],
      getData: vi.fn().mockReturnValue(""),
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
  return event;
}

function makeImageItem(type = "image/png"): DataTransferItem {
  const file = new File(["pixels"], "screenshot.png", { type });
  return {
    kind: "file",
    type,
    getAsFile: () => file,
    getAsString: vi.fn(),
    webkitGetAsEntry: vi.fn(),
  } as unknown as DataTransferItem;
}

describe("handlePaste", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pasting image from clipboard triggers upload + insert", async () => {
    mockUpload.mockResolvedValue("https://cdn.example.com/img.png");
    const editor = makeEditor();
    const view = makeView();
    const event = makeClipboardEvent([makeImageItem()]);

    const result = handlePaste(view, event, null as any, editor);
    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();

    // Wait for the async upload to complete
    await vi.waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(1);
    });

    await vi.waitFor(() => {
      expect(editor.chain).toHaveBeenCalled();
    });
  });

  it("returns false when no image items in clipboard", () => {
    const editor = makeEditor();
    const view = makeView();
    const textItem = {
      kind: "string",
      type: "text/html",
      getAsFile: () => null,
      getAsString: vi.fn(),
      webkitGetAsEntry: vi.fn(),
    } as unknown as DataTransferItem;
    const event = makeClipboardEvent([textItem]);

    const result = handlePaste(view, event, null as any, editor);
    expect(result).toBe(false);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("pasting plain text returns false for default handling", () => {
    const editor = makeEditor();
    const view = makeView();
    const event = makeClipboardEvent([]);

    const result = handlePaste(view, event, null as any, editor);
    expect(result).toBe(false);
  });

  it("does not insert when editor is destroyed during upload", async () => {
    mockUpload.mockResolvedValue("https://cdn.example.com/img.png");
    const editor = makeEditor();
    const view = makeView();
    const event = makeClipboardEvent([makeImageItem()]);

    handlePaste(view, event, null as any, editor);

    // Simulate editor being destroyed before upload resolves
    editor.isDestroyed = true;

    await vi.waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(1);
    });

    // chain() should never be called when editor is destroyed
    expect(editor.chain).not.toHaveBeenCalled();
  });
});

describe("transformPastedHTML", () => {
  it("strips Word-specific markup (o:p, mso-*, w:sdt)", () => {
    const wordHtml = `
      <p><o:p></o:p><strong>bold</strong></p>
      <w:sdt>junk</w:sdt>
      <span style="mso-bidi-font-size:12pt">text</span>
    `;
    const result = transformPastedHTML(wordHtml);
    expect(result).not.toContain("<o:p>");
    expect(result).not.toContain("<w:sdt>");
    expect(result).not.toContain("mso-");
    expect(result).toContain("<strong>");
  });

  it("preserves basic formatting (bold, italic, links)", () => {
    const html =
      '<p><strong>bold</strong> and <em>italic</em> with <a href="https://example.com">link</a></p>';
    const result = transformPastedHTML(html);
    expect(result).toContain("<strong>");
    expect(result).toContain("<em>");
    expect(result).toContain("<a");
    expect(result).toContain("https://example.com");
  });

  it("strips <script> tags", () => {
    const html = "<p>text</p><script>alert('xss')</script>";
    const result = transformPastedHTML(html);
    expect(result).toContain("text");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  it("strips dangerous img src protocols", () => {
    const html = `<img src="javascript:alert('xss')"><img src="https://ok.com/img.png">`;
    const result = transformPastedHTML(html);
    expect(result).not.toContain("javascript:");
    // Valid image should be preserved
    expect(result).toContain("https://ok.com/img.png");
  });

  it("strips event handler attributes", () => {
    const html = '<img src="https://ok.com/img.png" onerror="alert(1)">';
    const result = transformPastedHTML(html);
    expect(result).not.toContain("onerror");
  });
});
