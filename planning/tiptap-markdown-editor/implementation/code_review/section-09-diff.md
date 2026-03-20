diff --git a/apps/web/client/src/components/editor/TiptapEditor.tsx b/apps/web/client/src/components/editor/TiptapEditor.tsx
index 48ada4b0..502bffc9 100644
--- a/apps/web/client/src/components/editor/TiptapEditor.tsx
+++ b/apps/web/client/src/components/editor/TiptapEditor.tsx
@@ -1,8 +1,11 @@
-import { useEffect } from "react";
+import { useEffect, useRef } from "react";
 import { useEditor, EditorContent } from "@tiptap/react";
 import { Placeholder } from "@tiptap/extension-placeholder";
 import type { Editor, Extension } from "@tiptap/core";
 import { getDefaultExtensions } from "./TiptapMarkdownBridge";
+import { handlePaste } from "./pasteHandlers";
+import { transformPastedHTML } from "./pasteHandlers";
+import { handleDrop } from "./dropHandler";
 import type { JSONContent } from "./types";
 import "./editor.css";
 
@@ -22,6 +25,8 @@ export default function TiptapEditor({
   placeholder = "",
   className,
 }: TiptapEditorProps) {
+  const editorRef = useRef<Editor | null>(null);
+
   const editor = useEditor({
     extensions: [
       ...getDefaultExtensions(),
@@ -33,8 +38,22 @@ export default function TiptapEditor({
     onUpdate: ({ editor: ed }) => {
       onUpdate?.(ed);
     },
+    editorProps: {
+      handlePaste: (view, event, slice) => {
+        return handlePaste(view, event, slice, editorRef.current!) || false;
+      },
+      handleDrop: (view, event, slice, moved) => {
+        return (
+          handleDrop(view, event, slice, moved, editorRef.current!) || false
+        );
+      },
+      transformPastedHTML: (html) => transformPastedHTML(html),
+    },
   });
 
+  // Keep ref in sync
+  editorRef.current = editor;
+
   useEffect(() => {
     if (editor) {
       editor.setEditable(editable);
diff --git a/apps/web/client/src/components/editor/__tests__/drag-drop.test.ts b/apps/web/client/src/components/editor/__tests__/drag-drop.test.ts
new file mode 100644
index 00000000..334718cf
--- /dev/null
+++ b/apps/web/client/src/components/editor/__tests__/drag-drop.test.ts
@@ -0,0 +1,155 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+vi.mock("../uploadMedia", () => ({
+  uploadMedia: vi.fn(),
+  classifyMediaType: (mime: string) => {
+    if (mime.startsWith("image/")) return "image";
+    if (mime.startsWith("video/")) return "video";
+    if (mime.startsWith("audio/")) return "audio";
+    return null;
+  },
+}));
+
+import { handleDrop } from "../dropHandler";
+import { uploadMedia } from "../uploadMedia";
+
+const mockUpload = vi.mocked(uploadMedia);
+
+function makeEditor() {
+  return {
+    isDestroyed: false,
+    chain: vi.fn().mockReturnThis(),
+    focus: vi.fn().mockReturnThis(),
+    insertContentAt: vi.fn().mockReturnThis(),
+    run: vi.fn().mockReturnValue(true),
+  } as any;
+}
+
+function makeView(pos = 42) {
+  return {
+    posAtCoords: vi.fn().mockReturnValue({ pos }),
+    state: { doc: { resolve: vi.fn() } },
+    dispatch: vi.fn(),
+  } as any;
+}
+
+function makeDragEvent(files: File[]): DragEvent {
+  return {
+    dataTransfer: {
+      files: Object.assign(files, {
+        item: (i: number) => files[i],
+        length: files.length,
+      }),
+    },
+    preventDefault: vi.fn(),
+    clientX: 100,
+    clientY: 200,
+  } as unknown as DragEvent;
+}
+
+describe("handleDrop", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("dropping an image file triggers upload + insert at drop position", async () => {
+    mockUpload.mockResolvedValue("https://cdn.example.com/photo.jpg");
+    const editor = makeEditor();
+    const view = makeView(42);
+    const file = new File(["img"], "photo.jpg", { type: "image/jpeg" });
+    const event = makeDragEvent([file]);
+
+    const result = handleDrop(view, event, null as any, false, editor);
+    expect(result).toBe(true);
+    expect(event.preventDefault).toHaveBeenCalled();
+
+    await vi.waitFor(() => {
+      expect(mockUpload).toHaveBeenCalledWith(file);
+    });
+
+    await vi.waitFor(() => {
+      expect(editor.chain).toHaveBeenCalled();
+      expect(editor.insertContentAt).toHaveBeenCalled();
+    });
+  });
+
+  it("dropping a non-media file is ignored", () => {
+    const editor = makeEditor();
+    const view = makeView();
+    const file = new File(["pdf"], "doc.pdf", {
+      type: "application/pdf",
+    });
+    const event = makeDragEvent([file]);
+
+    const result = handleDrop(view, event, null as any, false, editor);
+    expect(result).toBe(false);
+    expect(mockUpload).not.toHaveBeenCalled();
+  });
+
+  it("dropping multiple files inserts multiple nodes", async () => {
+    mockUpload
+      .mockResolvedValueOnce("https://cdn.example.com/img1.png")
+      .mockResolvedValueOnce("https://cdn.example.com/img2.png")
+      .mockResolvedValueOnce("https://cdn.example.com/clip.mp4");
+
+    const editor = makeEditor();
+    const view = makeView(10);
+    const files = [
+      new File(["a"], "img1.png", { type: "image/png" }),
+      new File(["b"], "img2.png", { type: "image/png" }),
+      new File(["c"], "clip.mp4", { type: "video/mp4" }),
+    ];
+    const event = makeDragEvent(files);
+
+    const result = handleDrop(view, event, null as any, false, editor);
+    expect(result).toBe(true);
+
+    await vi.waitFor(() => {
+      expect(mockUpload).toHaveBeenCalledTimes(3);
+    });
+  });
+
+  it("dropping a video file inserts a VideoNode", async () => {
+    mockUpload.mockResolvedValue("https://cdn.example.com/clip.mp4");
+    const editor = makeEditor();
+    const view = makeView(5);
+    const file = new File(["v"], "clip.mp4", { type: "video/mp4" });
+    const event = makeDragEvent([file]);
+
+    handleDrop(view, event, null as any, false, editor);
+
+    await vi.waitFor(() => {
+      expect(editor.insertContentAt).toHaveBeenCalledWith(
+        5,
+        expect.objectContaining({ type: "video" }),
+      );
+    });
+  });
+
+  it("dropping an audio file inserts an AudioNode", async () => {
+    mockUpload.mockResolvedValue("https://cdn.example.com/song.mp3");
+    const editor = makeEditor();
+    const view = makeView(8);
+    const file = new File(["a"], "song.mp3", { type: "audio/mpeg" });
+    const event = makeDragEvent([file]);
+
+    handleDrop(view, event, null as any, false, editor);
+
+    await vi.waitFor(() => {
+      expect(editor.insertContentAt).toHaveBeenCalledWith(
+        8,
+        expect.objectContaining({ type: "audio" }),
+      );
+    });
+  });
+
+  it("internal move (moved=true) returns false", () => {
+    const editor = makeEditor();
+    const view = makeView();
+    const file = new File(["x"], "img.png", { type: "image/png" });
+    const event = makeDragEvent([file]);
+
+    const result = handleDrop(view, event, null as any, true, editor);
+    expect(result).toBe(false);
+  });
+});
diff --git a/apps/web/client/src/components/editor/__tests__/paste-handlers.test.ts b/apps/web/client/src/components/editor/__tests__/paste-handlers.test.ts
new file mode 100644
index 00000000..62cff626
--- /dev/null
+++ b/apps/web/client/src/components/editor/__tests__/paste-handlers.test.ts
@@ -0,0 +1,180 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock DOMPurify for node environment (no DOM available)
+vi.mock("dompurify", () => ({
+  default: {
+    sanitize: (html: string, _config?: unknown) => {
+      // Simplified sanitizer: strip script/style/iframe/object/embed tags and event handlers
+      let cleaned = html;
+      cleaned = cleaned.replace(
+        /<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi,
+        "",
+      );
+      cleaned = cleaned.replace(
+        /<(script|style|iframe|object|embed)\b[^>]*\/?>/gi,
+        "",
+      );
+      cleaned = cleaned.replace(
+        /\s+(?:onerror|onload|onclick|onmouseover|onfocus)="[^"]*"/gi,
+        "",
+      );
+      return cleaned;
+    },
+  },
+}));
+
+// Mock uploadMedia before importing handlers
+vi.mock("../uploadMedia", () => ({
+  uploadMedia: vi.fn(),
+  classifyMediaType: vi.fn((mime: string) => {
+    if (mime.startsWith("image/")) return "image";
+    if (mime.startsWith("video/")) return "video";
+    if (mime.startsWith("audio/")) return "audio";
+    return null;
+  }),
+}));
+
+import { handlePaste, transformPastedHTML } from "../pasteHandlers";
+import { uploadMedia } from "../uploadMedia";
+
+const mockUpload = vi.mocked(uploadMedia);
+
+function makeEditor(overrides?: Partial<Record<string, unknown>>) {
+  return {
+    isDestroyed: false,
+    chain: vi.fn().mockReturnThis(),
+    focus: vi.fn().mockReturnThis(),
+    setImage: vi.fn().mockReturnThis(),
+    run: vi.fn().mockReturnValue(true),
+    ...overrides,
+  } as any;
+}
+
+function makeView() {
+  return {
+    state: { selection: { from: 0 } },
+    dispatch: vi.fn(),
+  } as any;
+}
+
+function makeClipboardEvent(items: DataTransferItem[]): ClipboardEvent {
+  const event = {
+    clipboardData: {
+      items,
+      files: [] as File[],
+      getData: vi.fn().mockReturnValue(""),
+    },
+    preventDefault: vi.fn(),
+  } as unknown as ClipboardEvent;
+  return event;
+}
+
+function makeImageItem(type = "image/png"): DataTransferItem {
+  const file = new File(["pixels"], "screenshot.png", { type });
+  return {
+    kind: "file",
+    type,
+    getAsFile: () => file,
+    getAsString: vi.fn(),
+    webkitGetAsEntry: vi.fn(),
+  } as unknown as DataTransferItem;
+}
+
+describe("handlePaste", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("pasting image from clipboard triggers upload + insert", async () => {
+    mockUpload.mockResolvedValue("https://cdn.example.com/img.png");
+    const editor = makeEditor();
+    const view = makeView();
+    const event = makeClipboardEvent([makeImageItem()]);
+
+    const result = handlePaste(view, event, null as any, editor);
+    expect(result).toBe(true);
+    expect(event.preventDefault).toHaveBeenCalled();
+
+    // Wait for the async upload to complete
+    await vi.waitFor(() => {
+      expect(mockUpload).toHaveBeenCalledTimes(1);
+    });
+
+    await vi.waitFor(() => {
+      expect(editor.chain).toHaveBeenCalled();
+    });
+  });
+
+  it("returns false when no image items in clipboard", () => {
+    const editor = makeEditor();
+    const view = makeView();
+    const textItem = {
+      kind: "string",
+      type: "text/html",
+      getAsFile: () => null,
+      getAsString: vi.fn(),
+      webkitGetAsEntry: vi.fn(),
+    } as unknown as DataTransferItem;
+    const event = makeClipboardEvent([textItem]);
+
+    const result = handlePaste(view, event, null as any, editor);
+    expect(result).toBe(false);
+    expect(mockUpload).not.toHaveBeenCalled();
+  });
+
+  it("pasting plain text returns false for default handling", () => {
+    const editor = makeEditor();
+    const view = makeView();
+    const event = makeClipboardEvent([]);
+
+    const result = handlePaste(view, event, null as any, editor);
+    expect(result).toBe(false);
+  });
+});
+
+describe("transformPastedHTML", () => {
+  it("strips Word-specific markup (o:p, mso-*, w:sdt)", () => {
+    const wordHtml = `
+      <p><o:p></o:p><strong>bold</strong></p>
+      <w:sdt>junk</w:sdt>
+      <span style="mso-bidi-font-size:12pt">text</span>
+    `;
+    const result = transformPastedHTML(wordHtml);
+    expect(result).not.toContain("<o:p>");
+    expect(result).not.toContain("<w:sdt>");
+    expect(result).not.toContain("mso-");
+    expect(result).toContain("<strong>");
+  });
+
+  it("preserves basic formatting (bold, italic, links)", () => {
+    const html =
+      '<p><strong>bold</strong> and <em>italic</em> with <a href="https://example.com">link</a></p>';
+    const result = transformPastedHTML(html);
+    expect(result).toContain("<strong>");
+    expect(result).toContain("<em>");
+    expect(result).toContain("<a");
+    expect(result).toContain("https://example.com");
+  });
+
+  it("strips <script> tags", () => {
+    const html = "<p>text</p><script>alert('xss')</script>";
+    const result = transformPastedHTML(html);
+    expect(result).toContain("text");
+    expect(result).not.toContain("<script>");
+    expect(result).not.toContain("alert");
+  });
+
+  it("strips dangerous img src protocols", () => {
+    const html = `<img src="javascript:alert('xss')"><img src="https://ok.com/img.png">`;
+    const result = transformPastedHTML(html);
+    expect(result).not.toContain("javascript:");
+    // Valid image should be preserved
+    expect(result).toContain("https://ok.com/img.png");
+  });
+
+  it("strips event handler attributes", () => {
+    const html = '<img src="https://ok.com/img.png" onerror="alert(1)">';
+    const result = transformPastedHTML(html);
+    expect(result).not.toContain("onerror");
+  });
+});
diff --git a/apps/web/client/src/components/editor/dropHandler.ts b/apps/web/client/src/components/editor/dropHandler.ts
new file mode 100644
index 00000000..87c64768
--- /dev/null
+++ b/apps/web/client/src/components/editor/dropHandler.ts
@@ -0,0 +1,69 @@
+import type { EditorView } from "@tiptap/pm/view";
+import type { Slice } from "@tiptap/pm/model";
+import type { Editor } from "@tiptap/core";
+import { toast } from "sonner";
+import { uploadMedia, classifyMediaType } from "./uploadMedia";
+
+/**
+ * Tiptap editorProps.handleDrop handler.
+ * Intercepts file drag-and-drop events, uploads media files,
+ * and inserts appropriate nodes at the drop position.
+ */
+export function handleDrop(
+  view: EditorView,
+  event: DragEvent,
+  _slice: Slice,
+  moved: boolean,
+  editor: Editor,
+): boolean {
+  // Internal drag-and-drop is handled by ProseMirror
+  if (moved) return false;
+
+  const files = event.dataTransfer?.files;
+  if (!files || files.length === 0) return false;
+
+  // Filter to supported media files
+  const mediaFiles: { file: File; type: "image" | "video" | "audio" }[] = [];
+  for (let i = 0; i < files.length; i++) {
+    const file = files[i];
+    const mediaType = classifyMediaType(file.type);
+    if (mediaType) {
+      mediaFiles.push({ file, type: mediaType });
+    }
+  }
+
+  if (mediaFiles.length === 0) return false;
+
+  event.preventDefault();
+
+  // Determine drop position
+  const coords = view.posAtCoords({
+    left: event.clientX,
+    top: event.clientY,
+  });
+  const pos = coords?.pos ?? view.state.selection.from;
+
+  // Upload each file sequentially to preserve order
+  (async () => {
+    for (const { file, type } of mediaFiles) {
+      try {
+        const url = await uploadMedia(file);
+        if (editor.isDestroyed) return;
+
+        const nodeType = type;
+        const attrs: Record<string, string> = { src: url };
+        if (nodeType === "image") attrs.alt = file.name;
+
+        editor
+          .chain()
+          .focus()
+          .insertContentAt(pos, { type: nodeType, attrs })
+          .run();
+      } catch {
+        toast.error(`Failed to upload ${file.name}`);
+      }
+    }
+  })();
+
+  return true;
+}
diff --git a/apps/web/client/src/components/editor/pasteHandlers.ts b/apps/web/client/src/components/editor/pasteHandlers.ts
new file mode 100644
index 00000000..3b3e6e3d
--- /dev/null
+++ b/apps/web/client/src/components/editor/pasteHandlers.ts
@@ -0,0 +1,123 @@
+import type { EditorView } from "@tiptap/pm/view";
+import type { Slice } from "@tiptap/pm/model";
+import type { Editor } from "@tiptap/core";
+import DOMPurify from "dompurify";
+import { toast } from "sonner";
+import { uploadMedia, classifyMediaType } from "./uploadMedia";
+import { sanitizeMediaSrc } from "./extensions/mediaSerializationRules";
+
+/**
+ * Tiptap editorProps.handlePaste handler.
+ * Intercepts clipboard image pastes, uploads them, and inserts image nodes.
+ * Returns true if the paste was handled, false to fall through to defaults.
+ */
+export function handlePaste(
+  view: EditorView,
+  event: ClipboardEvent,
+  _slice: Slice,
+  editor: Editor,
+): boolean {
+  const items = event.clipboardData?.items;
+  if (!items) return false;
+
+  const imageItems: DataTransferItem[] = [];
+  for (let i = 0; i < items.length; i++) {
+    const item = items[i];
+    if (item.kind === "file" && classifyMediaType(item.type) === "image") {
+      imageItems.push(item);
+    }
+  }
+
+  if (imageItems.length === 0) return false;
+
+  event.preventDefault();
+
+  // Upload async — handlePaste must return synchronously
+  for (const item of imageItems) {
+    const file = item.getAsFile();
+    if (!file) continue;
+
+    uploadMedia(file)
+      .then((url) => {
+        if (editor.isDestroyed) return;
+        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
+      })
+      .catch(() => {
+        toast.error(`Failed to upload ${file.name}`);
+      });
+  }
+
+  return true;
+}
+
+// Regex patterns for Word/Office cleanup
+const XML_NS_TAG = /<\/?[a-zA-Z]+:[a-zA-Z]+[^>]*>/g;
+const MSO_STYLE_ATTR = /\s*style="[^"]*mso-[^"]*"/gi;
+const EMPTY_SPAN = /<span\s*>\s*([\s\S]*?)\s*<\/span>/gi;
+
+const PURIFY_CONFIG: DOMPurify.Config = {
+  ALLOWED_TAGS: [
+    "p",
+    "br",
+    "h1",
+    "h2",
+    "h3",
+    "h4",
+    "h5",
+    "h6",
+    "strong",
+    "b",
+    "em",
+    "i",
+    "u",
+    "a",
+    "ul",
+    "ol",
+    "li",
+    "blockquote",
+    "pre",
+    "code",
+    "table",
+    "thead",
+    "tbody",
+    "tr",
+    "th",
+    "td",
+    "img",
+    "hr",
+  ],
+  ALLOWED_ATTR: ["href", "src", "alt", "title", "colspan", "rowspan"],
+  ALLOW_DATA_ATTR: false,
+  FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
+  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
+};
+
+/**
+ * Tiptap editorProps.transformPastedHTML handler.
+ * Sanitizes rich HTML pasted from Word/Google Docs.
+ */
+export function transformPastedHTML(html: string): string {
+  // 1. Strip XML-namespaced tags (Word's <o:p>, <w:sdt>, etc.)
+  let cleaned = html.replace(XML_NS_TAG, "");
+
+  // 2. Strip style attributes containing mso-* properties
+  cleaned = cleaned.replace(MSO_STYLE_ATTR, "");
+
+  // 3. Collapse empty spans
+  cleaned = cleaned.replace(EMPTY_SPAN, "$1");
+
+  // 4. DOMPurify sanitize
+  cleaned = DOMPurify.sanitize(cleaned, PURIFY_CONFIG);
+
+  // 5. Post-process: sanitize img src URLs
+  cleaned = cleaned.replace(
+    /<img\s+([^>]*?)src="([^"]*)"([^>]*?)>/gi,
+    (_match, pre, src, post) => {
+      const safeSrc = sanitizeMediaSrc(src);
+      if (!safeSrc) return "";
+      return `<img ${pre}src="${safeSrc}"${post}>`;
+    },
+  );
+
+  return cleaned;
+}
diff --git a/apps/web/client/src/components/editor/uploadMedia.ts b/apps/web/client/src/components/editor/uploadMedia.ts
index 2bdf9e75..2226ae00 100644
--- a/apps/web/client/src/components/editor/uploadMedia.ts
+++ b/apps/web/client/src/components/editor/uploadMedia.ts
@@ -37,7 +37,8 @@ export function readFileAsBase64(file: File): Promise<string> {
     const reader = new FileReader();
     reader.onload = () => {
       const result = reader.result as string;
-      resolve(result);
+      // Strip the data:<mime>;base64, prefix — server expects raw base64
+      resolve(result.split(",")[1] ?? result);
     };
     reader.onerror = () => reject(new Error("Failed to read file"));
     reader.readAsDataURL(file);
@@ -47,3 +48,38 @@ export function readFileAsBase64(file: File): Promise<string> {
 export function getAcceptString(mediaType: "image" | "video" | "audio"): string {
   return (ACCEPTED_TYPES[mediaType] || []).join(",");
 }
+
+/**
+ * Determine the media node type for a given MIME type.
+ * Returns null if the MIME type is not a supported media format.
+ */
+export function classifyMediaType(
+  mimeType: string,
+): "image" | "video" | "audio" | null {
+  if (mimeType.startsWith("image/")) return "image";
+  if (mimeType.startsWith("video/")) return "video";
+  if (mimeType.startsWith("audio/")) return "audio";
+  return null;
+}
+
+/**
+ * Upload a media file to the server and return its public URL.
+ * Reuses the existing /api/media-jobs/upload endpoint.
+ */
+export async function uploadMedia(file: File): Promise<string> {
+  const formData = new FormData();
+  formData.append("file", file);
+
+  const res = await fetch("/api/media-jobs/upload", {
+    method: "POST",
+    body: formData,
+    credentials: "include",
+  });
+
+  if (!res.ok) {
+    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
+  }
+
+  const data = (await res.json()) as { url: string };
+  return data.url;
+}
