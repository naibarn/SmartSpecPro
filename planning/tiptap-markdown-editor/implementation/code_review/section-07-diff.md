diff --git a/apps/web/client/src/components/editor/extensions/audioExtension.ts b/apps/web/client/src/components/editor/extensions/audioExtension.ts
index 5a028c16..050f3307 100644
--- a/apps/web/client/src/components/editor/extensions/audioExtension.ts
+++ b/apps/web/client/src/components/editor/extensions/audioExtension.ts
@@ -1,10 +1,12 @@
 import { Node, mergeAttributes } from "@tiptap/core";
+import { ReactNodeViewRenderer } from "@tiptap/react";
 import {
   sanitizeMediaSrc,
   buildDataAttrs,
   parseDataAttr,
   escapeAttr,
 } from "./mediaSerializationRules";
+import AudioNodeView from "../nodeviews/AudioNodeView";
 
 declare module "@tiptap/core" {
   interface Commands<ReturnType> {
@@ -69,6 +71,10 @@ export const AudioExtension = Node.create({
     ];
   },
 
+  addNodeView() {
+    return ReactNodeViewRenderer(AudioNodeView);
+  },
+
   addCommands() {
     return {
       setAudio:
diff --git a/apps/web/client/src/components/editor/extensions/imageExtension.ts b/apps/web/client/src/components/editor/extensions/imageExtension.ts
index f6648eb4..62dde88b 100644
--- a/apps/web/client/src/components/editor/extensions/imageExtension.ts
+++ b/apps/web/client/src/components/editor/extensions/imageExtension.ts
@@ -1,11 +1,13 @@
 import { Image } from "@tiptap/extension-image";
 import { mergeAttributes } from "@tiptap/core";
+import { ReactNodeViewRenderer } from "@tiptap/react";
 import {
   sanitizeMediaSrc,
   buildDataAttrs,
   parseDataAttr,
   escapeAttr,
 } from "./mediaSerializationRules";
+import ImageNodeView from "../nodeviews/ImageNodeView";
 
 declare module "@tiptap/core" {
   interface Commands<ReturnType> {
@@ -106,6 +108,10 @@ export const ImageExtension = Image.extend({
     ];
   },
 
+  addNodeView() {
+    return ReactNodeViewRenderer(ImageNodeView);
+  },
+
   addCommands() {
     return {
       setImage:
diff --git a/apps/web/client/src/components/editor/extensions/videoExtension.ts b/apps/web/client/src/components/editor/extensions/videoExtension.ts
index 67d41a6e..6e8e2d4f 100644
--- a/apps/web/client/src/components/editor/extensions/videoExtension.ts
+++ b/apps/web/client/src/components/editor/extensions/videoExtension.ts
@@ -1,10 +1,12 @@
 import { Node, mergeAttributes } from "@tiptap/core";
+import { ReactNodeViewRenderer } from "@tiptap/react";
 import {
   sanitizeMediaSrc,
   buildDataAttrs,
   parseDataAttr,
   escapeAttr,
 } from "./mediaSerializationRules";
+import VideoNodeView from "../nodeviews/VideoNodeView";
 
 declare module "@tiptap/core" {
   interface Commands<ReturnType> {
@@ -90,6 +92,10 @@ export const VideoExtension = Node.create({
     ];
   },
 
+  addNodeView() {
+    return ReactNodeViewRenderer(VideoNodeView);
+  },
+
   addCommands() {
     return {
       setVideo:
diff --git a/apps/web/client/src/components/editor/nodeviews/AudioNodeView.tsx b/apps/web/client/src/components/editor/nodeviews/AudioNodeView.tsx
new file mode 100644
index 00000000..102d358c
--- /dev/null
+++ b/apps/web/client/src/components/editor/nodeviews/AudioNodeView.tsx
@@ -0,0 +1,96 @@
+import { useState, useCallback } from "react";
+import { NodeViewWrapper } from "@tiptap/react";
+import type { NodeViewProps } from "@tiptap/react";
+import { isSafeMediaUrl, sanitizeMediaUrl } from "./mediaUrlValidator";
+import MediaSelectionOverlay from "./MediaSelectionOverlay";
+
+export default function AudioNodeView({
+  node,
+  updateAttributes,
+  deleteNode,
+  editor,
+  selected,
+}: NodeViewProps) {
+  const [showOverlay, setShowOverlay] = useState(false);
+  const [editingCaption, setEditingCaption] = useState(false);
+  const [captionDraft, setCaptionDraft] = useState("");
+
+  const { src, caption, controls } = node.attrs;
+  const safeSrc = sanitizeMediaUrl(src || "");
+  const isEditable = editor.isEditable;
+
+  const handleClick = useCallback(() => {
+    if (isEditable) {
+      setShowOverlay(true);
+    }
+  }, [isEditable]);
+
+  const handleDismiss = useCallback(() => {
+    setShowOverlay(false);
+  }, []);
+
+  const handleEditCaption = useCallback(() => {
+    setCaptionDraft(caption || "");
+    setEditingCaption(true);
+    setShowOverlay(false);
+  }, [caption]);
+
+  const handleCaptionConfirm = useCallback(() => {
+    updateAttributes({ caption: captionDraft || null });
+    setEditingCaption(false);
+  }, [captionDraft, updateAttributes]);
+
+  return (
+    <NodeViewWrapper
+      as="figure"
+      className={`relative group my-4 ${selected ? "ring-2 ring-blue-500 rounded" : ""}`}
+      data-testid="audio-node-view"
+    >
+      <div className="relative" onClick={handleClick}>
+        {isSafeMediaUrl(src) ? (
+          <audio
+            src={safeSrc}
+            controls={controls !== false}
+            className="w-full"
+          />
+        ) : (
+          <div className="p-4 bg-red-50 text-red-600 rounded text-sm">
+            Unsafe URL blocked
+          </div>
+        )}
+
+        {isEditable && (
+          <MediaSelectionOverlay
+            visible={showOverlay}
+            onRemove={deleteNode}
+            onEditCaption={handleEditCaption}
+            onDismiss={handleDismiss}
+          />
+        )}
+      </div>
+
+      {editingCaption ? (
+        <figcaption className="mt-1">
+          <input
+            type="text"
+            className="w-full text-sm text-center border rounded px-2 py-1 text-muted-foreground"
+            value={captionDraft}
+            onChange={(e) => setCaptionDraft(e.target.value)}
+            onBlur={handleCaptionConfirm}
+            onKeyDown={(e) => {
+              if (e.key === "Enter") handleCaptionConfirm();
+            }}
+            placeholder="Caption"
+            autoFocus
+          />
+        </figcaption>
+      ) : caption ? (
+        <figcaption className="text-sm text-muted-foreground text-center mt-1">
+          {caption}
+        </figcaption>
+      ) : null}
+    </NodeViewWrapper>
+  );
+}
+
+export { AudioNodeView };
diff --git a/apps/web/client/src/components/editor/nodeviews/ImageNodeView.test.tsx b/apps/web/client/src/components/editor/nodeviews/ImageNodeView.test.tsx
new file mode 100644
index 00000000..4f012d32
--- /dev/null
+++ b/apps/web/client/src/components/editor/nodeviews/ImageNodeView.test.tsx
@@ -0,0 +1,126 @@
+// @vitest-environment jsdom
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent } from "@testing-library/react";
+import ImageNodeView from "./ImageNodeView";
+
+function makeNodeViewProps(overrides: Record<string, any> = {}) {
+  const attrs = {
+    src: "https://example.com/photo.jpg",
+    alt: "A photo",
+    caption: null as string | null,
+    alignment: "center",
+    width: null as string | null,
+    assetId: null as string | null,
+    ...overrides,
+  };
+
+  return {
+    node: {
+      attrs,
+      type: { name: "image" },
+      isLeaf: true,
+      textContent: "",
+      content: { size: 0 },
+    },
+    updateAttributes: vi.fn(),
+    deleteNode: vi.fn(),
+    editor: {
+      isEditable: overrides._editable !== undefined ? overrides._editable : true,
+      view: { dom: document.createElement("div") },
+    },
+    selected: overrides._selected ?? false,
+    getPos: () => 0,
+    extension: {},
+    HTMLAttributes: {},
+    decorations: [],
+  } as any;
+}
+
+describe("ImageNodeView", () => {
+  it("renders <img> with correct src and alt", () => {
+    const props = makeNodeViewProps({ src: "https://example.com/photo.jpg", alt: "A photo" });
+    render(<ImageNodeView {...props} />);
+
+    const img = screen.getByRole("img");
+    expect(img).toBeDefined();
+    expect(img.getAttribute("src")).toBe("https://example.com/photo.jpg");
+    expect(img.getAttribute("alt")).toBe("A photo");
+  });
+
+  it("shows caption below image when caption attr set", () => {
+    const props = makeNodeViewProps({ caption: "Figure 1" });
+    render(<ImageNodeView {...props} />);
+
+    expect(screen.getByText("Figure 1")).toBeDefined();
+  });
+
+  it("click shows MediaSelectionOverlay with action buttons", () => {
+    const props = makeNodeViewProps();
+    render(<ImageNodeView {...props} />);
+
+    // Overlay not visible initially
+    expect(screen.queryByTestId("media-selection-overlay")).toBeNull();
+
+    // Click on image wrapper
+    const img = screen.getByRole("img");
+    fireEvent.click(img.parentElement!);
+
+    // Overlay now visible
+    expect(screen.getByTestId("media-selection-overlay")).toBeDefined();
+    expect(screen.getByLabelText("Remove")).toBeDefined();
+    expect(screen.getByTestId("edit-alt-btn")).toBeDefined();
+  });
+
+  it('"Remove" button calls deleteNode()', () => {
+    const props = makeNodeViewProps();
+    render(<ImageNodeView {...props} />);
+
+    // Show overlay
+    const img = screen.getByRole("img");
+    fireEvent.click(img.parentElement!);
+
+    // Click remove
+    fireEvent.click(screen.getByTestId("remove-btn"));
+    expect(props.deleteNode).toHaveBeenCalled();
+  });
+
+  it('"Edit Alt" opens inline alt text editor', () => {
+    const props = makeNodeViewProps({ alt: "Old alt" });
+    render(<ImageNodeView {...props} />);
+
+    // Show overlay and click Edit Alt
+    const img = screen.getByRole("img");
+    fireEvent.click(img.parentElement!);
+    fireEvent.click(screen.getByTestId("edit-alt-btn"));
+
+    // Alt editor appears with pre-filled value
+    const altInput = screen.getByTestId("alt-editor").querySelector("input")!;
+    expect(altInput).toBeDefined();
+    expect(altInput.value).toBe("Old alt");
+
+    // Type new value and confirm
+    fireEvent.change(altInput, { target: { value: "New alt text" } });
+    fireEvent.keyDown(altInput, { key: "Enter" });
+
+    expect(props.updateAttributes).toHaveBeenCalledWith({ alt: "New alt text" });
+  });
+
+  it("does not show overlay in view mode", () => {
+    const props = makeNodeViewProps({ _editable: false });
+    render(<ImageNodeView {...props} />);
+
+    const img = screen.getByRole("img");
+    fireEvent.click(img.parentElement!);
+
+    // Overlay should not appear
+    expect(screen.queryByTestId("media-selection-overlay")).toBeNull();
+  });
+
+  it("blocks unsafe javascript: URLs", () => {
+    const props = makeNodeViewProps({ src: "javascript:alert(1)" });
+    render(<ImageNodeView {...props} />);
+
+    expect(screen.queryByRole("img")).toBeNull();
+    expect(screen.getByText("Unsafe URL blocked")).toBeDefined();
+  });
+});
diff --git a/apps/web/client/src/components/editor/nodeviews/ImageNodeView.tsx b/apps/web/client/src/components/editor/nodeviews/ImageNodeView.tsx
new file mode 100644
index 00000000..6b1e5fbe
--- /dev/null
+++ b/apps/web/client/src/components/editor/nodeviews/ImageNodeView.tsx
@@ -0,0 +1,145 @@
+import { useState, useCallback } from "react";
+import { NodeViewWrapper } from "@tiptap/react";
+import type { NodeViewProps } from "@tiptap/react";
+import { isSafeMediaUrl, sanitizeMediaUrl } from "./mediaUrlValidator";
+import MediaSelectionOverlay from "./MediaSelectionOverlay";
+
+const ALIGNMENT_CLASSES: Record<string, string> = {
+  left: "text-left",
+  center: "text-center mx-auto",
+  right: "text-right ml-auto",
+};
+
+export default function ImageNodeView({
+  node,
+  updateAttributes,
+  deleteNode,
+  editor,
+  selected,
+}: NodeViewProps) {
+  const [showOverlay, setShowOverlay] = useState(false);
+  const [editingAlt, setEditingAlt] = useState(false);
+  const [editingCaption, setEditingCaption] = useState(false);
+  const [altDraft, setAltDraft] = useState("");
+  const [captionDraft, setCaptionDraft] = useState("");
+
+  const { src, alt, caption, alignment, width } = node.attrs;
+  const safeSrc = sanitizeMediaUrl(src || "");
+  const isEditable = editor.isEditable;
+
+  const handleClick = useCallback(() => {
+    if (isEditable) {
+      setShowOverlay(true);
+    }
+  }, [isEditable]);
+
+  const handleDismiss = useCallback(() => {
+    setShowOverlay(false);
+  }, []);
+
+  const handleEditAlt = useCallback(() => {
+    setAltDraft(alt || "");
+    setEditingAlt(true);
+    setShowOverlay(false);
+  }, [alt]);
+
+  const handleAltConfirm = useCallback(() => {
+    updateAttributes({ alt: altDraft });
+    setEditingAlt(false);
+  }, [altDraft, updateAttributes]);
+
+  const handleEditCaption = useCallback(() => {
+    setCaptionDraft(caption || "");
+    setEditingCaption(true);
+    setShowOverlay(false);
+  }, [caption]);
+
+  const handleCaptionConfirm = useCallback(() => {
+    updateAttributes({ caption: captionDraft || null });
+    setEditingCaption(false);
+  }, [captionDraft, updateAttributes]);
+
+  const handleAlignChange = useCallback(
+    (align: string) => {
+      updateAttributes({ alignment: align });
+    },
+    [updateAttributes],
+  );
+
+  const alignClass = ALIGNMENT_CLASSES[alignment || "center"] || ALIGNMENT_CLASSES.center;
+
+  return (
+    <NodeViewWrapper
+      as="figure"
+      className={`relative group my-4 ${alignClass} ${selected ? "ring-2 ring-blue-500 rounded" : ""}`}
+      data-testid="image-node-view"
+    >
+      <div className="relative inline-block" onClick={handleClick}>
+        {isSafeMediaUrl(src) ? (
+          <img
+            src={safeSrc}
+            alt={alt || ""}
+            className="max-w-full h-auto rounded"
+            style={width ? { width } : undefined}
+            draggable={false}
+          />
+        ) : (
+          <div className="p-4 bg-red-50 text-red-600 rounded text-sm">
+            Unsafe URL blocked
+          </div>
+        )}
+
+        {isEditable && (
+          <MediaSelectionOverlay
+            visible={showOverlay}
+            onRemove={deleteNode}
+            onEditAlt={handleEditAlt}
+            onEditCaption={handleEditCaption}
+            onAlignChange={handleAlignChange}
+            onDismiss={handleDismiss}
+          />
+        )}
+      </div>
+
+      {editingAlt && (
+        <div className="mt-1" data-testid="alt-editor">
+          <input
+            type="text"
+            className="w-full text-sm border rounded px-2 py-1"
+            value={altDraft}
+            onChange={(e) => setAltDraft(e.target.value)}
+            onBlur={handleAltConfirm}
+            onKeyDown={(e) => {
+              if (e.key === "Enter") handleAltConfirm();
+            }}
+            placeholder="Alt text"
+            autoFocus
+          />
+        </div>
+      )}
+
+      {editingCaption ? (
+        <figcaption className="mt-1">
+          <input
+            type="text"
+            className="w-full text-sm text-center border rounded px-2 py-1 text-muted-foreground"
+            value={captionDraft}
+            onChange={(e) => setCaptionDraft(e.target.value)}
+            onBlur={handleCaptionConfirm}
+            onKeyDown={(e) => {
+              if (e.key === "Enter") handleCaptionConfirm();
+            }}
+            placeholder="Caption"
+            autoFocus
+          />
+        </figcaption>
+      ) : caption ? (
+        <figcaption className="text-sm text-muted-foreground text-center mt-1">
+          {caption}
+        </figcaption>
+      ) : null}
+    </NodeViewWrapper>
+  );
+}
+
+export { ImageNodeView };
diff --git a/apps/web/client/src/components/editor/nodeviews/MediaSelectionOverlay.tsx b/apps/web/client/src/components/editor/nodeviews/MediaSelectionOverlay.tsx
new file mode 100644
index 00000000..289c56a6
--- /dev/null
+++ b/apps/web/client/src/components/editor/nodeviews/MediaSelectionOverlay.tsx
@@ -0,0 +1,162 @@
+import { useEffect, useRef } from "react";
+import {
+  Trash2,
+  ImageIcon,
+  AlignLeft,
+  AlignCenter,
+  AlignRight,
+  Type,
+  Replace,
+} from "lucide-react";
+
+interface MediaSelectionOverlayProps {
+  visible: boolean;
+  onRemove: () => void;
+  onEditCaption?: () => void;
+  onEditAlt?: () => void;
+  onReplace?: () => void;
+  onAlignChange?: (align: string) => void;
+  onDismiss: () => void;
+}
+
+export default function MediaSelectionOverlay({
+  visible,
+  onRemove,
+  onEditCaption,
+  onEditAlt,
+  onReplace,
+  onAlignChange,
+  onDismiss,
+}: MediaSelectionOverlayProps) {
+  const overlayRef = useRef<HTMLDivElement>(null);
+
+  useEffect(() => {
+    if (!visible) return;
+    function handleKeyDown(e: KeyboardEvent) {
+      if (e.key === "Escape") {
+        e.preventDefault();
+        onDismiss();
+      }
+    }
+    function handleClickOutside(e: MouseEvent) {
+      if (
+        overlayRef.current &&
+        !overlayRef.current.contains(e.target as Node)
+      ) {
+        onDismiss();
+      }
+    }
+    document.addEventListener("keydown", handleKeyDown);
+    document.addEventListener("mousedown", handleClickOutside, true);
+    return () => {
+      document.removeEventListener("keydown", handleKeyDown);
+      document.removeEventListener("mousedown", handleClickOutside, true);
+    };
+  }, [visible, onDismiss]);
+
+  if (!visible) return null;
+
+  const btnClass =
+    "p-1.5 rounded bg-white/90 hover:bg-white shadow-sm text-gray-700 hover:text-gray-900 transition-colors";
+
+  return (
+    <div
+      ref={overlayRef}
+      className="absolute inset-0 bg-black/20 flex items-start justify-end p-2 gap-1 z-10 rounded"
+      data-testid="media-selection-overlay"
+    >
+      {onReplace && (
+        <button
+          type="button"
+          className={btnClass}
+          onClick={(e) => {
+            e.stopPropagation();
+            onReplace();
+          }}
+          aria-label="Replace"
+        >
+          <Replace className="w-4 h-4" />
+        </button>
+      )}
+      {onEditAlt && (
+        <button
+          type="button"
+          className={btnClass}
+          onClick={(e) => {
+            e.stopPropagation();
+            onEditAlt();
+          }}
+          aria-label="Edit Alt"
+          data-testid="edit-alt-btn"
+        >
+          <Type className="w-4 h-4" />
+        </button>
+      )}
+      {onEditCaption && (
+        <button
+          type="button"
+          className={btnClass}
+          onClick={(e) => {
+            e.stopPropagation();
+            onEditCaption();
+          }}
+          aria-label="Edit caption"
+        >
+          <ImageIcon className="w-4 h-4" />
+        </button>
+      )}
+      {onAlignChange && (
+        <>
+          <button
+            type="button"
+            className={btnClass}
+            onClick={(e) => {
+              e.stopPropagation();
+              onAlignChange("left");
+            }}
+            aria-label="Align left"
+          >
+            <AlignLeft className="w-4 h-4" />
+          </button>
+          <button
+            type="button"
+            className={btnClass}
+            onClick={(e) => {
+              e.stopPropagation();
+              onAlignChange("center");
+            }}
+            aria-label="Align center"
+          >
+            <AlignCenter className="w-4 h-4" />
+          </button>
+          <button
+            type="button"
+            className={btnClass}
+            onClick={(e) => {
+              e.stopPropagation();
+              onAlignChange("right");
+            }}
+            aria-label="Align right"
+          >
+            <AlignRight className="w-4 h-4" />
+          </button>
+        </>
+      )}
+      <button
+        type="button"
+        className={`${btnClass} hover:text-red-600`}
+        onClick={(e) => {
+          e.stopPropagation();
+          onRemove();
+        }}
+        aria-label="Remove"
+        data-testid="remove-btn"
+      >
+        <Trash2 className="w-4 h-4" />
+      </button>
+    </div>
+  );
+}
+
+export { MediaSelectionOverlay };
+export type { MediaSelectionOverlayProps };
diff --git a/apps/web/client/src/components/editor/nodeviews/VideoNodeView.test.tsx b/apps/web/client/src/components/editor/nodeviews/VideoNodeView.test.tsx
new file mode 100644
index 00000000..19c3e171
--- /dev/null
+++ b/apps/web/client/src/components/editor/nodeviews/VideoNodeView.test.tsx
@@ -0,0 +1,110 @@
+// @vitest-environment jsdom
+import { describe, it, expect, vi } from "vitest";
+import { render, screen, fireEvent } from "@testing-library/react";
+import VideoNodeView from "./VideoNodeView";
+
+function makeNodeViewProps(overrides: Record<string, any> = {}) {
+  const attrs = {
+    src: "https://example.com/video.mp4",
+    poster: null as string | null,
+    caption: null as string | null,
+    controls: true,
+    width: null as string | null,
+    height: null as string | null,
+    assetId: null as string | null,
+    ...overrides,
+  };
+
+  return {
+    node: {
+      attrs,
+      type: { name: "video" },
+      isLeaf: true,
+      textContent: "",
+      content: { size: 0 },
+    },
+    updateAttributes: vi.fn(),
+    deleteNode: vi.fn(),
+    editor: {
+      isEditable: overrides._editable !== undefined ? overrides._editable : true,
+      view: { dom: document.createElement("div") },
+    },
+    selected: overrides._selected ?? false,
+    getPos: () => 0,
+    extension: {},
+    HTMLAttributes: {},
+    decorations: [],
+  } as any;
+}
+
+describe("VideoNodeView", () => {
+  it("renders <video> element with controls", () => {
+    const props = makeNodeViewProps();
+    const { container } = render(<VideoNodeView {...props} />);
+
+    const video = container.querySelector("video");
+    expect(video).toBeDefined();
+    expect(video!.getAttribute("src")).toBe("https://example.com/video.mp4");
+    expect(video!.hasAttribute("controls")).toBe(true);
+  });
+
+  it("shows caption below video when caption attr set", () => {
+    const props = makeNodeViewProps({ caption: "Demo video" });
+    render(<VideoNodeView {...props} />);
+
+    expect(screen.getByText("Demo video")).toBeDefined();
+  });
+
+  it("validates src URL (rejects javascript: protocol)", () => {
+    const props = makeNodeViewProps({ src: "javascript:alert(1)" });
+    const { container } = render(<VideoNodeView {...props} />);
+
+    expect(container.querySelector("video")).toBeNull();
+    expect(screen.getByTestId("unsafe-url-warning")).toBeDefined();
+  });
+
+  it("poster attribute applied to <video>", () => {
+    const props = makeNodeViewProps({
+      poster: "https://example.com/thumb.jpg",
+    });
+    const { container } = render(<VideoNodeView {...props} />);
+
+    const video = container.querySelector("video");
+    expect(video!.getAttribute("poster")).toBe("https://example.com/thumb.jpg");
+  });
+
+  it("poster with javascript: protocol is rejected", () => {
+    const props = makeNodeViewProps({
+      poster: "javascript:alert(1)",
+    });
+    const { container } = render(<VideoNodeView {...props} />);
+
+    const video = container.querySelector("video");
+    // Video should still render (src is valid), but poster should be absent
+    expect(video).toBeDefined();
+    expect(video!.getAttribute("poster")).toBeNull();
+  });
+
+  it("click in edit mode shows selection overlay", () => {
+    const props = makeNodeViewProps();
+    render(<VideoNodeView {...props} />);
+
+    // Click on wrapper (not the video element itself)
+    const wrapper = screen.getByTestId("video-node-view");
+    const wrapperDiv = wrapper.querySelector("div.relative")!;
+    fireEvent.click(wrapperDiv);
+
+    expect(screen.getByTestId("media-selection-overlay")).toBeDefined();
+  });
+
+  it("does not show overlay in view mode", () => {
+    const props = makeNodeViewProps({ _editable: false });
+    render(<VideoNodeView {...props} />);
+
+    const wrapper = screen.getByTestId("video-node-view");
+    const wrapperDiv = wrapper.querySelector("div.relative")!;
+    fireEvent.click(wrapperDiv);
+
+    expect(screen.queryByTestId("media-selection-overlay")).toBeNull();
+  });
+});
diff --git a/apps/web/client/src/components/editor/nodeviews/VideoNodeView.tsx b/apps/web/client/src/components/editor/nodeviews/VideoNodeView.tsx
new file mode 100644
index 00000000..c26d59a3
--- /dev/null
+++ b/apps/web/client/src/components/editor/nodeviews/VideoNodeView.tsx
@@ -0,0 +1,115 @@
+import { useState, useCallback } from "react";
+import { NodeViewWrapper } from "@tiptap/react";
+import type { NodeViewProps } from "@tiptap/react";
+import { isSafeMediaUrl, sanitizeMediaUrl } from "./mediaUrlValidator";
+import MediaSelectionOverlay from "./MediaSelectionOverlay";
+
+export default function VideoNodeView({
+  node,
+  updateAttributes,
+  deleteNode,
+  editor,
+  selected,
+}: NodeViewProps) {
+  const [showOverlay, setShowOverlay] = useState(false);
+  const [editingCaption, setEditingCaption] = useState(false);
+  const [captionDraft, setCaptionDraft] = useState("");
+
+  const { src, poster, caption, controls, width, height } = node.attrs;
+  const safeSrc = sanitizeMediaUrl(src || "");
+  const safePoster = poster ? sanitizeMediaUrl(poster) : undefined;
+  const isEditable = editor.isEditable;
+
+  const handleWrapperClick = useCallback(
+    (e: React.MouseEvent) => {
+      // Don't trigger overlay when clicking on native video controls
+      const target = e.target as HTMLElement;
+      if (target.tagName === "VIDEO") return;
+      if (isEditable) {
+        setShowOverlay(true);
+      }
+    },
+    [isEditable],
+  );
+
+  const handleDismiss = useCallback(() => {
+    setShowOverlay(false);
+  }, []);
+
+  const handleEditCaption = useCallback(() => {
+    setCaptionDraft(caption || "");
+    setEditingCaption(true);
+    setShowOverlay(false);
+  }, [caption]);
+
+  const handleCaptionConfirm = useCallback(() => {
+    updateAttributes({ caption: captionDraft || null });
+    setEditingCaption(false);
+  }, [captionDraft, updateAttributes]);
+
+  const srcSafe = isSafeMediaUrl(src);
+  const posterSafe = !poster || isSafeMediaUrl(poster);
+
+  return (
+    <NodeViewWrapper
+      as="figure"
+      className={`relative group my-4 ${selected ? "ring-2 ring-blue-500 rounded" : ""}`}
+      data-testid="video-node-view"
+    >
+      <div className="relative" onClick={handleWrapperClick}>
+        {srcSafe ? (
+          <video
+            src={safeSrc}
+            poster={posterSafe && safePoster ? safePoster : undefined}
+            controls={controls !== false}
+            className="w-full rounded"
+            style={{
+              ...(width ? { width } : {}),
+              ...(height ? { height } : {}),
+            }}
+            draggable={false}
+          />
+        ) : (
+          <div
+            className="p-4 bg-red-50 text-red-600 rounded text-sm"
+            data-testid="unsafe-url-warning"
+          >
+            Unsafe URL blocked
+          </div>
+        )}
+
+        {isEditable && (
+          <MediaSelectionOverlay
+            visible={showOverlay}
+            onRemove={deleteNode}
+            onEditCaption={handleEditCaption}
+            onDismiss={handleDismiss}
+          />
+        )}
+      </div>
+
+      {editingCaption ? (
+        <figcaption className="mt-1">
+          <input
+            type="text"
+            className="w-full text-sm text-center border rounded px-2 py-1 text-muted-foreground"
+            value={captionDraft}
+            onChange={(e) => setCaptionDraft(e.target.value)}
+            onBlur={handleCaptionConfirm}
+            onKeyDown={(e) => {
+              if (e.key === "Enter") handleCaptionConfirm();
+            }}
+            placeholder="Caption"
+            autoFocus
+          />
+        </figcaption>
+      ) : caption ? (
+        <figcaption className="text-sm text-muted-foreground text-center mt-1">
+          {caption}
+        </figcaption>
+      ) : null}
+    </NodeViewWrapper>
+  );
+}
+
+export { VideoNodeView };
diff --git a/apps/web/client/src/components/editor/nodeviews/mediaUrlValidator.ts b/apps/web/client/src/components/editor/nodeviews/mediaUrlValidator.ts
new file mode 100644
index 00000000..b94498aa
--- /dev/null
+++ b/apps/web/client/src/components/editor/nodeviews/mediaUrlValidator.ts
@@ -0,0 +1,14 @@
+/**
+ * Thin re-export of sanitizeMediaSrc for node view components.
+ * The core validation logic lives in mediaSerializationRules.ts.
+ */
+export { sanitizeMediaSrc as sanitizeMediaUrl } from "../extensions/mediaSerializationRules";
+import { sanitizeMediaSrc } from "../extensions/mediaSerializationRules";
+
+/**
+ * Returns true if the URL is safe for use in media src/poster attributes.
+ */
+export function isSafeMediaUrl(url: string | null | undefined): boolean {
+  if (!url) return false;
+  return sanitizeMediaSrc(url) !== "";
+}
