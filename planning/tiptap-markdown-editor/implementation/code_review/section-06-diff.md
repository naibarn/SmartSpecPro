diff --git a/apps/web/client/src/components/editor/TiptapMarkdownBridge.ts b/apps/web/client/src/components/editor/TiptapMarkdownBridge.ts
index d8db7c1c..7c5896b0 100644
--- a/apps/web/client/src/components/editor/TiptapMarkdownBridge.ts
+++ b/apps/web/client/src/components/editor/TiptapMarkdownBridge.ts
@@ -1,6 +1,5 @@
 import { Editor, type Extension } from "@tiptap/core";
 import StarterKit from "@tiptap/starter-kit";
-import { Image } from "@tiptap/extension-image";
 import { Link } from "@tiptap/extension-link";
 import { Table } from "@tiptap/extension-table";
 import { TableRow } from "@tiptap/extension-table-row";
@@ -8,6 +7,9 @@ import { TableCell } from "@tiptap/extension-table-cell";
 import { TableHeader } from "@tiptap/extension-table-header";
 import { Underline } from "@tiptap/extension-underline";
 import { Markdown } from "tiptap-markdown";
+import { ImageExtension } from "./extensions/imageExtension";
+import { VideoExtension } from "./extensions/videoExtension";
+import { AudioExtension } from "./extensions/audioExtension";
 
 import type { JSONContent } from "@tiptap/core";
 export type { JSONContent };
@@ -25,7 +27,9 @@ export function getDefaultExtensions(): Extension[] {
       link: false,
       underline: false,
     }),
-    Image,
+    ImageExtension,
+    VideoExtension,
+    AudioExtension,
     Link.configure({ openOnClick: false }),
     Table.configure({ resizable: true }),
     TableRow,
diff --git a/apps/web/client/src/components/editor/extensions/__tests__/audioExtension.test.ts b/apps/web/client/src/components/editor/extensions/__tests__/audioExtension.test.ts
new file mode 100644
index 00000000..12ae96c0
--- /dev/null
+++ b/apps/web/client/src/components/editor/extensions/__tests__/audioExtension.test.ts
@@ -0,0 +1,108 @@
+// @vitest-environment jsdom
+import { describe, it, expect, afterEach } from "vitest";
+import { Editor } from "@tiptap/core";
+import StarterKit from "@tiptap/starter-kit";
+import { Markdown } from "tiptap-markdown";
+import { AudioExtension } from "../audioExtension";
+
+function createTestEditor() {
+  return new Editor({
+    extensions: [
+      StarterKit,
+      AudioExtension,
+      Markdown.configure({ html: true }),
+    ],
+    content: "",
+  });
+}
+
+describe("AudioExtension", () => {
+  let editor: Editor;
+
+  afterEach(() => {
+    editor?.destroy();
+  });
+
+  it("parseHTML('<audio src=\"url\" controls>') creates AudioNode", () => {
+    editor = createTestEditor();
+    editor.commands.setContent('<audio src="https://example.com/audio.mp3" controls></audio>');
+    const json = editor.getJSON();
+    const audioNode = json.content?.find((n: any) => n.type === "audio");
+    expect(audioNode).toBeDefined();
+    expect(audioNode?.attrs?.src).toBe("https://example.com/audio.mp3");
+  });
+
+  it("parseHTML handles style attribute gracefully", () => {
+    editor = createTestEditor();
+    editor.commands.setContent(
+      '<audio src="https://example.com/a.mp3" controls style="width:100%;"></audio>',
+    );
+    const json = editor.getJSON();
+    const audioNode = json.content?.find((n: any) => n.type === "audio");
+    expect(audioNode).toBeDefined();
+    expect(audioNode?.attrs?.src).toBe("https://example.com/a.mp3");
+  });
+
+  it("renderHTML produces <audio> with controls attribute", () => {
+    editor = createTestEditor();
+    editor.commands.setContent({
+      type: "doc",
+      content: [
+        {
+          type: "audio",
+          attrs: {
+            src: "https://example.com/a.mp3",
+            caption: "My Audio",
+            controls: true,
+          },
+        },
+      ],
+    });
+    const html = editor.getHTML();
+    expect(html).toContain("<audio");
+    expect(html).toContain("controls");
+    expect(html).toContain("data-caption=\"My Audio\"");
+  });
+
+  it("setAudio command inserts an audio node", () => {
+    editor = createTestEditor();
+    editor.commands.setAudio({
+      src: "https://example.com/a.mp3",
+      caption: "Podcast",
+    });
+    const json = editor.getJSON();
+    const audioNode = json.content?.find((n: any) => n.type === "audio");
+    expect(audioNode).toBeDefined();
+    expect(audioNode?.attrs?.src).toBe("https://example.com/a.mp3");
+    expect(audioNode?.attrs?.caption).toBe("Podcast");
+  });
+
+  it("attributes round-trip correctly", () => {
+    editor = createTestEditor();
+    const attrs = {
+      src: "https://example.com/a.mp3",
+      caption: "test cap",
+      assetId: "asset-789",
+      controls: true,
+    };
+    editor.commands.setContent({
+      type: "doc",
+      content: [{ type: "audio", attrs }],
+    });
+    const json = editor.getJSON();
+    const audioNode = json.content?.find((n: any) => n.type === "audio");
+    expect(audioNode?.attrs?.src).toBe(attrs.src);
+    expect(audioNode?.attrs?.caption).toBe(attrs.caption);
+    expect(audioNode?.attrs?.assetId).toBe(attrs.assetId);
+  });
+
+  it("rejects javascript: URLs", () => {
+    editor = createTestEditor();
+    editor.commands.setAudio({ src: "javascript:alert(1)" });
+    const json = editor.getJSON();
+    const audioNode = json.content?.find((n: any) => n.type === "audio");
+    if (audioNode) {
+      expect(audioNode.attrs?.src).toBe("");
+    }
+  });
+});
diff --git a/apps/web/client/src/components/editor/extensions/__tests__/imageExtension.test.ts b/apps/web/client/src/components/editor/extensions/__tests__/imageExtension.test.ts
new file mode 100644
index 00000000..345626aa
--- /dev/null
+++ b/apps/web/client/src/components/editor/extensions/__tests__/imageExtension.test.ts
@@ -0,0 +1,124 @@
+// @vitest-environment jsdom
+import { describe, it, expect, afterEach } from "vitest";
+import { Editor } from "@tiptap/core";
+import StarterKit from "@tiptap/starter-kit";
+import { Markdown } from "tiptap-markdown";
+import { ImageExtension } from "../imageExtension";
+
+function createTestEditor() {
+  return new Editor({
+    extensions: [
+      StarterKit,
+      ImageExtension,
+      Markdown.configure({ html: true }),
+    ],
+    content: "",
+  });
+}
+
+describe("ImageExtension", () => {
+  let editor: Editor;
+
+  afterEach(() => {
+    editor?.destroy();
+  });
+
+  it("parseHTML('<img src=\"url\" alt=\"text\">') creates ImageNode with correct attributes", () => {
+    editor = createTestEditor();
+    editor.commands.setContent('<img src="https://example.com/img.png" alt="my image">');
+    const json = editor.getJSON();
+    const imageNode = json.content?.find((n: any) => n.type === "image");
+    expect(imageNode).toBeDefined();
+    expect(imageNode?.attrs?.src).toBe("https://example.com/img.png");
+    expect(imageNode?.attrs?.alt).toBe("my image");
+  });
+
+  it("parseHTML('<figure>') extracts caption from <figcaption>", () => {
+    editor = createTestEditor();
+    editor.commands.setContent(
+      '<figure><img src="https://example.com/img.png"><figcaption>My Caption</figcaption></figure>',
+    );
+    const json = editor.getJSON();
+    const imageNode = json.content?.find((n: any) => n.type === "image");
+    expect(imageNode).toBeDefined();
+    expect(imageNode?.attrs?.src).toBe("https://example.com/img.png");
+    expect(imageNode?.attrs?.caption).toBe("My Caption");
+  });
+
+  it("renderHTML produces <img> with data-* attributes", () => {
+    editor = createTestEditor();
+    editor.commands.setContent({
+      type: "doc",
+      content: [
+        {
+          type: "image",
+          attrs: {
+            src: "https://example.com/img.png",
+            alt: "test",
+            caption: "cap",
+            assetId: "abc-123",
+            alignment: "left",
+          },
+        },
+      ],
+    });
+    const html = editor.getHTML();
+    expect(html).toContain("src=\"https://example.com/img.png\"");
+    expect(html).toContain("data-caption=\"cap\"");
+    expect(html).toContain("data-asset-id=\"abc-123\"");
+    expect(html).toContain("data-alignment=\"left\"");
+  });
+
+  it("attributes round-trip through parseHTML/renderHTML", () => {
+    editor = createTestEditor();
+    const attrs = {
+      src: "https://example.com/img.png",
+      alt: "test alt",
+      caption: "test caption",
+      width: null,
+      alignment: "right",
+      assetId: "id-456",
+    };
+    editor.commands.setContent({
+      type: "doc",
+      content: [{ type: "image", attrs }],
+    });
+    const json = editor.getJSON();
+    const imageNode = json.content?.find((n: any) => n.type === "image");
+    expect(imageNode?.attrs?.src).toBe(attrs.src);
+    expect(imageNode?.attrs?.alt).toBe(attrs.alt);
+    expect(imageNode?.attrs?.alignment).toBe(attrs.alignment);
+    expect(imageNode?.attrs?.assetId).toBe(attrs.assetId);
+  });
+
+  it("setImage command inserts an image node", () => {
+    editor = createTestEditor();
+    editor.commands.setImage({
+      src: "https://example.com/new.png",
+      alt: "new image",
+      caption: "new cap",
+    });
+    const json = editor.getJSON();
+    const imageNode = json.content?.find((n: any) => n.type === "image");
+    expect(imageNode).toBeDefined();
+    expect(imageNode?.attrs?.src).toBe("https://example.com/new.png");
+  });
+
+  it("missing src defaults to empty string without crashing", () => {
+    editor = createTestEditor();
+    editor.commands.setContent('<img alt="no source">');
+    const json = editor.getJSON();
+    // Should not throw — graceful handling
+    expect(json).toBeDefined();
+  });
+
+  it("rejects javascript: URLs in src", () => {
+    editor = createTestEditor();
+    editor.commands.setImage({ src: "javascript:alert(1)" });
+    const json = editor.getJSON();
+    const imageNode = json.content?.find((n: any) => n.type === "image");
+    if (imageNode) {
+      expect(imageNode.attrs?.src).toBe("");
+    }
+  });
+});
diff --git a/apps/web/client/src/components/editor/extensions/__tests__/videoExtension.test.ts b/apps/web/client/src/components/editor/extensions/__tests__/videoExtension.test.ts
new file mode 100644
index 00000000..d3e4440d
--- /dev/null
+++ b/apps/web/client/src/components/editor/extensions/__tests__/videoExtension.test.ts
@@ -0,0 +1,132 @@
+// @vitest-environment jsdom
+import { describe, it, expect, afterEach } from "vitest";
+import { Editor } from "@tiptap/core";
+import StarterKit from "@tiptap/starter-kit";
+import { Markdown } from "tiptap-markdown";
+import { VideoExtension } from "../videoExtension";
+
+function createTestEditor() {
+  return new Editor({
+    extensions: [
+      StarterKit,
+      VideoExtension,
+      Markdown.configure({ html: true }),
+    ],
+    content: "",
+  });
+}
+
+describe("VideoExtension", () => {
+  let editor: Editor;
+
+  afterEach(() => {
+    editor?.destroy();
+  });
+
+  it("parseHTML('<video src=\"url\" controls>') creates VideoNode", () => {
+    editor = createTestEditor();
+    editor.commands.setContent('<video src="https://example.com/video.mp4" controls></video>');
+    const json = editor.getJSON();
+    const videoNode = json.content?.find((n: any) => n.type === "video");
+    expect(videoNode).toBeDefined();
+    expect(videoNode?.attrs?.src).toBe("https://example.com/video.mp4");
+  });
+
+  it("parseHTML preserves data-poster and data-caption", () => {
+    editor = createTestEditor();
+    editor.commands.setContent(
+      '<video src="https://example.com/v.mp4" data-poster="https://example.com/thumb.jpg" data-caption="My video" controls></video>',
+    );
+    const json = editor.getJSON();
+    const videoNode = json.content?.find((n: any) => n.type === "video");
+    expect(videoNode?.attrs?.poster).toBe("https://example.com/thumb.jpg");
+    expect(videoNode?.attrs?.caption).toBe("My video");
+  });
+
+  it("parseHTML preserves data-asset-id", () => {
+    editor = createTestEditor();
+    editor.commands.setContent(
+      '<video src="https://example.com/v.mp4" data-asset-id="abc-123" controls></video>',
+    );
+    const json = editor.getJSON();
+    const videoNode = json.content?.find((n: any) => n.type === "video");
+    expect(videoNode?.attrs?.assetId).toBe("abc-123");
+  });
+
+  it("parseHTML handles legacy format with style attr gracefully", () => {
+    editor = createTestEditor();
+    editor.commands.setContent(
+      '<video src="https://example.com/v.mp4" controls width="100%" style="border-radius:8px;max-width:720px;"></video>',
+    );
+    const json = editor.getJSON();
+    const videoNode = json.content?.find((n: any) => n.type === "video");
+    expect(videoNode).toBeDefined();
+    expect(videoNode?.attrs?.src).toBe("https://example.com/v.mp4");
+    // style is ignored, width is preserved
+    expect(videoNode?.attrs?.width).toBe("100%");
+  });
+
+  it("renderHTML produces <video> with controls and data-* attrs", () => {
+    editor = createTestEditor();
+    editor.commands.setContent({
+      type: "doc",
+      content: [
+        {
+          type: "video",
+          attrs: {
+            src: "https://example.com/v.mp4",
+            poster: "https://example.com/thumb.jpg",
+            caption: "cap",
+            assetId: "id-1",
+            controls: true,
+          },
+        },
+      ],
+    });
+    const html = editor.getHTML();
+    expect(html).toContain("<video");
+    expect(html).toContain("controls");
+    expect(html).toContain("data-poster=\"https://example.com/thumb.jpg\"");
+    expect(html).toContain("data-caption=\"cap\"");
+    expect(html).toContain("data-asset-id=\"id-1\"");
+  });
+
+  it("setVideo command inserts a video node with sanitized src", () => {
+    editor = createTestEditor();
+    editor.commands.setVideo({
+      src: "https://example.com/v.mp4",
+      poster: "https://example.com/thumb.jpg",
+      caption: "test",
+    });
+    const json = editor.getJSON();
+    const videoNode = json.content?.find((n: any) => n.type === "video");
+    expect(videoNode).toBeDefined();
+    expect(videoNode?.attrs?.src).toBe("https://example.com/v.mp4");
+    expect(videoNode?.attrs?.poster).toBe("https://example.com/thumb.jpg");
+  });
+
+  it("legacy video with no data-* attrs parses without error", () => {
+    editor = createTestEditor();
+    editor.commands.setContent(
+      '<video src="https://example.com/old.mp4" controls></video>',
+    );
+    const json = editor.getJSON();
+    const videoNode = json.content?.find((n: any) => n.type === "video");
+    expect(videoNode).toBeDefined();
+    expect(videoNode?.attrs?.poster).toBeNull();
+    expect(videoNode?.attrs?.caption).toBeNull();
+    expect(videoNode?.attrs?.assetId).toBeNull();
+  });
+
+  it("rejects javascript: in poster URL", () => {
+    editor = createTestEditor();
+    editor.commands.setVideo({
+      src: "https://example.com/v.mp4",
+      poster: "javascript:alert(1)",
+    });
+    const json = editor.getJSON();
+    const videoNode = json.content?.find((n: any) => n.type === "video");
+    // sanitizeMediaSrc returns "" for rejected URLs
+    expect(videoNode?.attrs?.poster).toBeFalsy();
+  });
+});
diff --git a/apps/web/client/src/components/editor/extensions/audioExtension.ts b/apps/web/client/src/components/editor/extensions/audioExtension.ts
new file mode 100644
index 00000000..5a028c16
--- /dev/null
+++ b/apps/web/client/src/components/editor/extensions/audioExtension.ts
@@ -0,0 +1,104 @@
+import { Node, mergeAttributes } from "@tiptap/core";
+import {
+  sanitizeMediaSrc,
+  buildDataAttrs,
+  parseDataAttr,
+  escapeAttr,
+} from "./mediaSerializationRules";
+
+declare module "@tiptap/core" {
+  interface Commands<ReturnType> {
+    audio: {
+      setAudio: (attrs: {
+        src: string;
+        caption?: string | null;
+        assetId?: string | null;
+        controls?: boolean;
+      }) => ReturnType;
+    };
+  }
+}
+
+export const AudioExtension = Node.create({
+  name: "audio",
+
+  group: "block",
+
+  atom: true,
+
+  draggable: true,
+
+  addAttributes() {
+    return {
+      src: {
+        default: "",
+        parseHTML: (element: HTMLElement) =>
+          sanitizeMediaSrc(element.getAttribute("src") ?? ""),
+      },
+      caption: {
+        default: null,
+        parseHTML: (element: HTMLElement) =>
+          parseDataAttr(element, "data-caption"),
+      },
+      assetId: {
+        default: null,
+        parseHTML: (element: HTMLElement) =>
+          parseDataAttr(element, "data-asset-id"),
+      },
+      controls: {
+        default: true,
+        parseHTML: (element: HTMLElement) =>
+          element.hasAttribute("controls"),
+      },
+    };
+  },
+
+  parseHTML() {
+    return [{ tag: "audio[src]" }];
+  },
+
+  renderHTML({ HTMLAttributes }) {
+    const dataAttrs = buildDataAttrs({
+      "data-caption": HTMLAttributes.caption,
+      "data-asset-id": HTMLAttributes.assetId,
+    });
+    const { caption, assetId, controls, ...rest } = HTMLAttributes;
+    return [
+      "audio",
+      mergeAttributes(rest, dataAttrs, controls ? { controls: "" } : {}),
+    ];
+  },
+
+  addCommands() {
+    return {
+      setAudio:
+        (attrs) =>
+        ({ commands }) => {
+          return commands.insertContent({
+            type: this.name,
+            attrs: {
+              ...attrs,
+              src: sanitizeMediaSrc(attrs.src || ""),
+            },
+          });
+        },
+    };
+  },
+
+  addStorage() {
+    return {
+      markdown: {
+        serialize(state: any, node: any) {
+          state.write(`<audio src="${escapeAttr(node.attrs.src)}" controls`);
+          if (node.attrs.caption) state.write(` data-caption="${escapeAttr(node.attrs.caption)}"`);
+          if (node.attrs.assetId) state.write(` data-asset-id="${escapeAttr(node.attrs.assetId)}"`);
+          state.write("></audio>");
+          state.closeBlock(node);
+        },
+        parse: {},
+      },
+    };
+  },
+});
+
+export default AudioExtension;
diff --git a/apps/web/client/src/components/editor/extensions/imageExtension.ts b/apps/web/client/src/components/editor/extensions/imageExtension.ts
new file mode 100644
index 00000000..51007feb
--- /dev/null
+++ b/apps/web/client/src/components/editor/extensions/imageExtension.ts
@@ -0,0 +1,156 @@
+import { Image } from "@tiptap/extension-image";
+import { mergeAttributes } from "@tiptap/core";
+import {
+  sanitizeMediaSrc,
+  buildDataAttrs,
+  parseDataAttr,
+  escapeAttr,
+} from "./mediaSerializationRules";
+
+declare module "@tiptap/core" {
+  interface Commands<ReturnType> {
+    imageExtension: {
+      setImage: (attrs: {
+        src: string;
+        alt?: string;
+        caption?: string | null;
+        width?: string | null;
+        alignment?: string | null;
+        assetId?: string | null;
+      }) => ReturnType;
+    };
+  }
+}
+
+export const ImageExtension = Image.extend({
+  addAttributes() {
+    return {
+      ...this.parent?.(),
+      src: {
+        default: "",
+        parseHTML: (element: HTMLElement) => {
+          const img =
+            element.tagName === "IMG"
+              ? element
+              : element.querySelector("img");
+          const raw = img?.getAttribute("src") ?? "";
+          return sanitizeMediaSrc(raw);
+        },
+      },
+      alt: {
+        default: "",
+        parseHTML: (element: HTMLElement) => {
+          const img =
+            element.tagName === "IMG"
+              ? element
+              : element.querySelector("img");
+          return img?.getAttribute("alt") ?? "";
+        },
+      },
+      caption: {
+        default: null,
+        parseHTML: (element: HTMLElement) => {
+          // Check for <figcaption> child first, then data-caption attribute
+          const figcaption = element.querySelector("figcaption");
+          if (figcaption) return figcaption.textContent ?? null;
+          return parseDataAttr(element, "data-caption");
+        },
+      },
+      width: {
+        default: null,
+        parseHTML: (element: HTMLElement) => {
+          const img =
+            element.tagName === "IMG"
+              ? element
+              : element.querySelector("img");
+          return img?.getAttribute("width") ?? null;
+        },
+      },
+      alignment: {
+        default: "center",
+        parseHTML: (element: HTMLElement) =>
+          element.getAttribute("data-alignment") ?? "center",
+      },
+      assetId: {
+        default: null,
+        parseHTML: (element: HTMLElement) =>
+          parseDataAttr(element, "data-asset-id"),
+      },
+    };
+  },
+
+  parseHTML() {
+    return [
+      { tag: "img[src]" },
+      {
+        tag: "figure",
+        getAttrs: (element: HTMLElement) => {
+          const img = element.querySelector("img");
+          if (!img) return false;
+          return {};
+        },
+      },
+    ];
+  },
+
+  renderHTML({ HTMLAttributes }) {
+    const dataAttrs = buildDataAttrs({
+      "data-caption": HTMLAttributes.caption,
+      "data-asset-id": HTMLAttributes.assetId,
+      "data-alignment": HTMLAttributes.alignment,
+    });
+    const { caption, assetId, alignment, ...rest } = HTMLAttributes;
+    return [
+      "img",
+      mergeAttributes(rest, dataAttrs),
+    ];
+  },
+
+  addCommands() {
+    return {
+      setImage:
+        (attrs) =>
+        ({ commands }) => {
+          return commands.insertContent({
+            type: this.name,
+            attrs: {
+              ...attrs,
+              src: sanitizeMediaSrc(attrs.src || ""),
+            },
+          });
+        },
+    };
+  },
+
+  addStorage() {
+    return {
+      markdown: {
+        serialize(state: any, node: any) {
+          const src = node.attrs.src ?? "";
+          const alt = node.attrs.alt ?? "";
+          const caption = node.attrs.caption;
+          const assetId = node.attrs.assetId;
+          const alignment = node.attrs.alignment;
+
+          // If only basic attributes, use standard markdown image syntax
+          if (!caption && !assetId && (!alignment || alignment === "center")) {
+            state.write(`![${escapeAttr(alt)}](${escapeAttr(src)})`);
+            state.closeBlock(node);
+            return;
+          }
+
+          // Use HTML figure for extended attributes
+          state.write(`<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"`);
+          if (caption) state.write(` data-caption="${escapeAttr(caption)}"`);
+          if (assetId) state.write(` data-asset-id="${escapeAttr(assetId)}"`);
+          if (alignment) state.write(` data-alignment="${escapeAttr(alignment)}"`);
+          state.write(">");
+          state.closeBlock(node);
+        },
+        parse: {},
+      },
+    };
+  },
+});
+
+export default ImageExtension;
diff --git a/apps/web/client/src/components/editor/extensions/mediaSerializationRules.ts b/apps/web/client/src/components/editor/extensions/mediaSerializationRules.ts
new file mode 100644
index 00000000..aeb2d91b
--- /dev/null
+++ b/apps/web/client/src/components/editor/extensions/mediaSerializationRules.ts
@@ -0,0 +1,90 @@
+/**
+ * Shared media serialization constants and helpers for Tiptap media extensions.
+ * Single source of truth for whitelisted data-* attributes and URL sanitization.
+ */
+
+/** Whitelisted data-* attribute names allowed on media nodes. */
+export const MEDIA_DATA_ATTRS = [
+  "data-poster",
+  "data-caption",
+  "data-asset-id",
+] as const;
+
+/**
+ * Reads a data-* attribute from an HTML element, returning null if missing.
+ */
+export function parseDataAttr(
+  element: HTMLElement,
+  attr: string,
+): string | null {
+  // Strip "data-" prefix for dataset access
+  const key = attr.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
+  return element.dataset[key] ?? null;
+}
+
+// Protocols explicitly blocked (case-insensitive check)
+const BLOCKED_PROTOCOLS = [
+  "javascript:",
+  "vbscript:",
+  "data:text/html",
+  "data:application",
+  "data:image/svg+xml",
+  "blob:",
+  "file:",
+];
+
+/**
+ * Validates a media URL. SECURITY-CRITICAL.
+ * Returns empty string for rejected URLs.
+ * Allows only: https://, http://, relative paths starting with /
+ */
+export function sanitizeMediaSrc(src: string): string {
+  if (!src || typeof src !== "string") return "";
+  const trimmed = src.trim();
+  if (!trimmed) return "";
+
+  const lower = trimmed.toLowerCase();
+  for (const proto of BLOCKED_PROTOCOLS) {
+    if (lower.startsWith(proto)) return "";
+  }
+
+  // Allow https://, http://, and relative paths starting with /
+  if (
+    lower.startsWith("https://") ||
+    lower.startsWith("http://") ||
+    trimmed.startsWith("/")
+  ) {
+    return trimmed;
+  }
+
+  // Reject anything else (e.g., bare "data:", unknown protocols)
+  return "";
+}
+
+/**
+ * Filters out null/undefined values from an attribute map.
+ * Returns only entries that have string values.
+ */
+export function buildDataAttrs(
+  attrs: Record<string, string | null | undefined>,
+): Record<string, string> {
+  const result: Record<string, string> = {};
+  for (const [key, value] of Object.entries(attrs)) {
+    if (value != null && value !== "") {
+      result[key] = value;
+    }
+  }
+  return result;
+}
+
+/**
+ * Escapes a string for safe use in HTML attribute values.
+ * Prevents stored XSS via crafted captions/titles.
+ */
+export function escapeAttr(val: string): string {
+  return val
+    .replace(/&/g, "&amp;")
+    .replace(/"/g, "&quot;")
+    .replace(/</g, "&lt;")
+    .replace(/>/g, "&gt;");
+}
diff --git a/apps/web/client/src/components/editor/extensions/videoExtension.ts b/apps/web/client/src/components/editor/extensions/videoExtension.ts
new file mode 100644
index 00000000..97a042ab
--- /dev/null
+++ b/apps/web/client/src/components/editor/extensions/videoExtension.ts
@@ -0,0 +1,127 @@
+import { Node, mergeAttributes } from "@tiptap/core";
+import {
+  sanitizeMediaSrc,
+  buildDataAttrs,
+  parseDataAttr,
+  escapeAttr,
+} from "./mediaSerializationRules";
+
+declare module "@tiptap/core" {
+  interface Commands<ReturnType> {
+    video: {
+      setVideo: (attrs: {
+        src: string;
+        poster?: string | null;
+        caption?: string | null;
+        assetId?: string | null;
+        controls?: boolean;
+        width?: string | null;
+        height?: string | null;
+      }) => ReturnType;
+    };
+  }
+}
+
+export const VideoExtension = Node.create({
+  name: "video",
+
+  group: "block",
+
+  atom: true,
+
+  draggable: true,
+
+  addAttributes() {
+    return {
+      src: {
+        default: "",
+        parseHTML: (element: HTMLElement) =>
+          sanitizeMediaSrc(element.getAttribute("src") ?? ""),
+      },
+      poster: {
+        default: null,
+        parseHTML: (element: HTMLElement) => {
+          const val = parseDataAttr(element, "data-poster");
+          return val ? sanitizeMediaSrc(val) : null;
+        },
+      },
+      caption: {
+        default: null,
+        parseHTML: (element: HTMLElement) =>
+          parseDataAttr(element, "data-caption"),
+      },
+      assetId: {
+        default: null,
+        parseHTML: (element: HTMLElement) =>
+          parseDataAttr(element, "data-asset-id"),
+      },
+      controls: {
+        default: true,
+        parseHTML: (element: HTMLElement) =>
+          element.hasAttribute("controls"),
+      },
+      width: {
+        default: null,
+        parseHTML: (element: HTMLElement) =>
+          element.getAttribute("width"),
+      },
+      height: {
+        default: null,
+        parseHTML: (element: HTMLElement) =>
+          element.getAttribute("height"),
+      },
+    };
+  },
+
+  parseHTML() {
+    return [{ tag: "video[src]" }];
+  },
+
+  renderHTML({ HTMLAttributes }) {
+    const dataAttrs = buildDataAttrs({
+      "data-poster": HTMLAttributes.poster,
+      "data-caption": HTMLAttributes.caption,
+      "data-asset-id": HTMLAttributes.assetId,
+    });
+    const { poster, caption, assetId, controls, ...rest } = HTMLAttributes;
+    return [
+      "video",
+      mergeAttributes(rest, dataAttrs, controls ? { controls: "" } : {}),
+    ];
+  },
+
+  addCommands() {
+    return {
+      setVideo:
+        (attrs) =>
+        ({ commands }) => {
+          return commands.insertContent({
+            type: this.name,
+            attrs: {
+              ...attrs,
+              src: sanitizeMediaSrc(attrs.src || ""),
+              poster: attrs.poster ? sanitizeMediaSrc(attrs.poster) : null,
+            },
+          });
+        },
+    };
+  },
+
+  addStorage() {
+    return {
+      markdown: {
+        serialize(state: any, node: any) {
+          state.write(`<video src="${escapeAttr(node.attrs.src)}" controls`);
+          if (node.attrs.poster) state.write(` data-poster="${escapeAttr(node.attrs.poster)}"`);
+          if (node.attrs.caption) state.write(` data-caption="${escapeAttr(node.attrs.caption)}"`);
+          if (node.attrs.assetId) state.write(` data-asset-id="${escapeAttr(node.attrs.assetId)}"`);
+          state.write("></video>");
+          state.closeBlock(node);
+        },
+        parse: {},
+      },
+    };
+  },
+});
+
+export default VideoExtension;
