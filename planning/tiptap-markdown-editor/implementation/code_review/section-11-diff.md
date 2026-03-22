diff --git a/apps/web/client/src/components/chat/SafeMarkdown.test.tsx b/apps/web/client/src/components/chat/SafeMarkdown.test.tsx
new file mode 100644
index 00000000..70091833
--- /dev/null
+++ b/apps/web/client/src/components/chat/SafeMarkdown.test.tsx
@@ -0,0 +1,93 @@
+import { render, screen } from "@testing-library/react";
+import { describe, it, expect } from "vitest";
+import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
+
+describe("SafeMarkdown media data-* attribute handling", () => {
+  it("preserves data-poster as poster attribute on video", () => {
+    const html =
+      '<video src="https://example.com/v.mp4" data-poster="https://example.com/thumb.jpg" controls></video>';
+    render(<SafeMarkdown>{html}</SafeMarkdown>);
+    const video = document.querySelector("video");
+    expect(video).toBeTruthy();
+    expect(video!.getAttribute("poster")).toBe(
+      "https://example.com/thumb.jpg",
+    );
+  });
+
+  it("preserves data-caption as visible text below video", () => {
+    const html =
+      '<video src="https://example.com/v.mp4" data-caption="My caption" controls></video>';
+    render(<SafeMarkdown>{html}</SafeMarkdown>);
+    expect(screen.getByText("My caption")).toBeTruthy();
+  });
+
+  it("preserves data-asset-id as data attribute on video", () => {
+    const html =
+      '<video src="https://example.com/v.mp4" data-asset-id="abc-123" controls></video>';
+    render(<SafeMarkdown>{html}</SafeMarkdown>);
+    const video = document.querySelector("video");
+    expect(video).toBeTruthy();
+    expect(video!.getAttribute("data-asset-id")).toBe("abc-123");
+  });
+
+  it("strips non-whitelisted data attributes", () => {
+    const html =
+      '<video src="https://example.com/v.mp4" data-malicious="evil" controls></video>';
+    render(<SafeMarkdown>{html}</SafeMarkdown>);
+    const video = document.querySelector("video");
+    expect(video).toBeTruthy();
+    expect(video!.getAttribute("data-malicious")).toBeNull();
+  });
+
+  it("renders caption as text below video player", () => {
+    const html =
+      '<video src="https://example.com/v.mp4" data-caption="Test caption" controls></video>';
+    const { container } = render(<SafeMarkdown>{html}</SafeMarkdown>);
+    expect(screen.getByText("Test caption")).toBeTruthy();
+    // Caption should be in a <p> or similar element after the video
+    const video = container.querySelector("video");
+    const figure = video?.closest("figure");
+    expect(figure).toBeTruthy();
+    const captionEl = figure!.querySelector("p");
+    expect(captionEl).toBeTruthy();
+    expect(captionEl!.textContent).toBe("Test caption");
+  });
+
+  it("sanitizes javascript: protocol in data-poster", () => {
+    const html =
+      '<video src="https://example.com/v.mp4" data-poster="javascript:alert(1)" controls></video>';
+    render(<SafeMarkdown>{html}</SafeMarkdown>);
+    const video = document.querySelector("video");
+    expect(video).toBeTruthy();
+    // poster should be absent (not rendered at all)
+    expect(video!.hasAttribute("poster")).toBe(false);
+  });
+
+  it("renders existing documents without data-* attrs correctly", () => {
+    const html =
+      '<video src="https://example.com/v.mp4" controls></video>';
+    render(<SafeMarkdown>{html}</SafeMarkdown>);
+    const video = document.querySelector("video");
+    expect(video).toBeTruthy();
+    expect(video!.getAttribute("src")).toBe("https://example.com/v.mp4");
+    expect(video!.hasAttribute("controls")).toBe(true);
+    // No caption should appear
+    expect(document.querySelector("figure p")).toBeNull();
+  });
+
+  it("renders audio tag with data-caption", () => {
+    const html =
+      '<audio src="https://example.com/a.mp3" data-caption="Audio title" controls></audio>';
+    render(<SafeMarkdown>{html}</SafeMarkdown>);
+    expect(screen.getByText("Audio title")).toBeTruthy();
+  });
+
+  it("renders mixed content with text and video correctly", () => {
+    const html =
+      'Some text before\n\n<video src="https://example.com/v.mp4" data-caption="Cap" controls></video>\n\nSome text after';
+    render(<SafeMarkdown>{html}</SafeMarkdown>);
+    expect(screen.getByText("Cap")).toBeTruthy();
+    const video = document.querySelector("video");
+    expect(video).toBeTruthy();
+  });
+});
diff --git a/apps/web/client/src/components/chat/SafeMarkdown.tsx b/apps/web/client/src/components/chat/SafeMarkdown.tsx
index 9df7bf67..9180cbe6 100644
--- a/apps/web/client/src/components/chat/SafeMarkdown.tsx
+++ b/apps/web/client/src/components/chat/SafeMarkdown.tsx
@@ -42,6 +42,7 @@ const ALLOWED_ATTR = [
   "colspan", "rowspan",
   "controls", "autoplay", "loop", "muted", "preload",
   "type", "width", "height",
+  "poster",
 ];
 
 // Sanitize content to prevent XSS
@@ -67,7 +68,7 @@ function sanitizeContent(content: string): string {
     ALLOWED_TAGS,
     ALLOWED_ATTR,
     ALLOW_DATA_ATTR: false,
-    ADD_ATTR: ["target"],
+    ADD_ATTR: ["target", "data-poster", "data-caption", "data-asset-id"],
     FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input"],
     FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
   });
@@ -204,14 +205,29 @@ function splitContentAndImages(content: string): Array<{ type: "text"; value: st
 // as native React elements (bypassing Streamdown's internal sanitizer).
 type MediaPart =
   | { kind: "text"; value: string }
-  | { kind: "video"; src: string }
-  | { kind: "audio"; src: string };
+  | { kind: "video"; src: string; poster?: string; caption?: string; assetId?: string }
+  | { kind: "audio"; src: string; caption?: string; assetId?: string };
 
-const MEDIA_TAG_REGEX = /<(video|audio)\b[^>]*\bsrc="([^"]*)"[^>]*>(?:<\/\1>)?/g;
+const MEDIA_TAG_REGEX = /<(video|audio)\b([^>]*)>(?:<\/\1>)?/g;
+
+function extractAttr(attrs: string, name: string): string | undefined {
+  const re = new RegExp(`\\b${name}=["']([^"']*)["']`);
+  const m = re.exec(attrs);
+  return m ? m[1] : undefined;
+}
+
+function isUrlSafe(url: string): boolean {
+  const lower = url.trim().toLowerCase();
+  return (
+    lower.startsWith("http://") ||
+    lower.startsWith("https://") ||
+    lower.startsWith("/")
+  );
+}
 
 function splitByMedia(content: string): MediaPart[] | null {
   // Fast path: no video/audio tags
-  if (!/<(video|audio)\b[^>]*\bsrc="/.test(content)) return null;
+  if (!/<(video|audio)\b/.test(content)) return null;
 
   const parts: MediaPart[] = [];
   const regex = new RegExp(MEDIA_TAG_REGEX.source, "g");
@@ -223,8 +239,28 @@ function splitByMedia(content: string): MediaPart[] | null {
       parts.push({ kind: "text", value: content.slice(lastIndex, match.index) });
     }
     const tag = match[1] as "video" | "audio";
-    const src = match[2];
-    if (src) parts.push({ kind: tag, src });
+    const attrString = match[2];
+    const src = extractAttr(attrString, "src");
+    if (!src) {
+      lastIndex = match.index + match[0].length;
+      continue;
+    }
+
+    const poster = extractAttr(attrString, "data-poster");
+    const caption = extractAttr(attrString, "data-caption");
+    const assetId = extractAttr(attrString, "data-asset-id");
+
+    if (tag === "video") {
+      parts.push({
+        kind: "video",
+        src,
+        poster: poster && isUrlSafe(poster) ? poster : undefined,
+        caption,
+        assetId,
+      });
+    } else {
+      parts.push({ kind: "audio", src, caption, assetId });
+    }
     lastIndex = match.index + match[0].length;
   }
 
@@ -232,7 +268,7 @@ function splitByMedia(content: string): MediaPart[] | null {
     parts.push({ kind: "text", value: content.slice(lastIndex) });
   }
 
-  return parts;
+  return parts.length > 0 ? parts : null;
 }
 
 export function SafeMarkdown({ children, className, onImageClick }: SafeMarkdownProps) {
@@ -272,30 +308,51 @@ export function SafeMarkdown({ children, className, onImageClick }: SafeMarkdown
       <div className={className}>
         {mediaParts.map((part, i) => {
           if (part.kind === "video") {
-            return (
+            const videoEl = (
               <video
-                key={i}
+                key={part.caption ? undefined : i}
                 src={part.src}
                 controls
+                poster={part.poster}
+                data-asset-id={part.assetId}
                 style={{
                   display: "block",
                   width: "100%",
                   maxWidth: "720px",
                   borderRadius: "8px",
-                  margin: "8px 0",
+                  margin: part.caption ? "0" : "8px 0",
                 }}
               />
             );
+            if (part.caption) {
+              return (
+                <figure key={i} style={{ margin: "8px 0" }}>
+                  {videoEl}
+                  <p className="text-sm text-muted-foreground mt-1">{part.caption}</p>
+                </figure>
+              );
+            }
+            return videoEl;
           }
           if (part.kind === "audio") {
-            return (
+            const audioEl = (
               <audio
-                key={i}
+                key={part.caption ? undefined : i}
                 src={part.src}
                 controls
-                style={{ display: "block", width: "100%", margin: "4px 0" }}
+                data-asset-id={part.assetId}
+                style={{ display: "block", width: "100%", margin: part.caption ? "0" : "4px 0" }}
               />
             );
+            if (part.caption) {
+              return (
+                <figure key={i} style={{ margin: "4px 0" }}>
+                  {audioEl}
+                  <p className="text-sm text-muted-foreground mt-1">{part.caption}</p>
+                </figure>
+              );
+            }
+            return audioEl;
           }
           // Text part — sanitize and render through Streamdown
           if (!part.value.trim()) return null;
