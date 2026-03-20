// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { VideoExtension } from "../videoExtension";

function createTestEditor() {
  return new Editor({
    extensions: [
      StarterKit,
      VideoExtension,
      Markdown.configure({ html: true }),
    ],
    content: "",
  });
}

describe("VideoExtension", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it("parseHTML('<video src=\"url\" controls>') creates VideoNode", () => {
    editor = createTestEditor();
    editor.commands.setContent('<video src="https://example.com/video.mp4" controls></video>');
    const json = editor.getJSON();
    const videoNode = json.content?.find((n: any) => n.type === "video");
    expect(videoNode).toBeDefined();
    expect(videoNode?.attrs?.src).toBe("https://example.com/video.mp4");
  });

  it("parseHTML preserves data-poster and data-caption", () => {
    editor = createTestEditor();
    editor.commands.setContent(
      '<video src="https://example.com/v.mp4" data-poster="https://example.com/thumb.jpg" data-caption="My video" controls></video>',
    );
    const json = editor.getJSON();
    const videoNode = json.content?.find((n: any) => n.type === "video");
    expect(videoNode?.attrs?.poster).toBe("https://example.com/thumb.jpg");
    expect(videoNode?.attrs?.caption).toBe("My video");
  });

  it("parseHTML preserves data-asset-id", () => {
    editor = createTestEditor();
    editor.commands.setContent(
      '<video src="https://example.com/v.mp4" data-asset-id="abc-123" controls></video>',
    );
    const json = editor.getJSON();
    const videoNode = json.content?.find((n: any) => n.type === "video");
    expect(videoNode?.attrs?.assetId).toBe("abc-123");
  });

  it("parseHTML handles legacy format with style attr gracefully", () => {
    editor = createTestEditor();
    editor.commands.setContent(
      '<video src="https://example.com/v.mp4" controls width="100%" style="border-radius:8px;max-width:720px;"></video>',
    );
    const json = editor.getJSON();
    const videoNode = json.content?.find((n: any) => n.type === "video");
    expect(videoNode).toBeDefined();
    expect(videoNode?.attrs?.src).toBe("https://example.com/v.mp4");
    // style is ignored, width is preserved
    expect(videoNode?.attrs?.width).toBe("100%");
  });

  it("renderHTML produces <video> with controls and data-* attrs", () => {
    editor = createTestEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "video",
          attrs: {
            src: "https://example.com/v.mp4",
            poster: "https://example.com/thumb.jpg",
            caption: "cap",
            assetId: "id-1",
            controls: true,
          },
        },
      ],
    });
    const html = editor.getHTML();
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).toContain("data-poster=\"https://example.com/thumb.jpg\"");
    expect(html).toContain("data-caption=\"cap\"");
    expect(html).toContain("data-asset-id=\"id-1\"");
  });

  it("setVideo command inserts a video node with sanitized src", () => {
    editor = createTestEditor();
    editor.commands.setVideo({
      src: "https://example.com/v.mp4",
      poster: "https://example.com/thumb.jpg",
      caption: "test",
    });
    const json = editor.getJSON();
    const videoNode = json.content?.find((n: any) => n.type === "video");
    expect(videoNode).toBeDefined();
    expect(videoNode?.attrs?.src).toBe("https://example.com/v.mp4");
    expect(videoNode?.attrs?.poster).toBe("https://example.com/thumb.jpg");
  });

  it("legacy video with no data-* attrs parses without error", () => {
    editor = createTestEditor();
    editor.commands.setContent(
      '<video src="https://example.com/old.mp4" controls></video>',
    );
    const json = editor.getJSON();
    const videoNode = json.content?.find((n: any) => n.type === "video");
    expect(videoNode).toBeDefined();
    expect(videoNode?.attrs?.poster).toBeNull();
    expect(videoNode?.attrs?.caption).toBeNull();
    expect(videoNode?.attrs?.assetId).toBeNull();
  });

  it("rejects javascript: in poster URL", () => {
    editor = createTestEditor();
    editor.commands.setVideo({
      src: "https://example.com/v.mp4",
      poster: "javascript:alert(1)",
    });
    const json = editor.getJSON();
    const videoNode = json.content?.find((n: any) => n.type === "video");
    // sanitizeMediaSrc returns "" for rejected URLs
    expect(videoNode?.attrs?.poster).toBe("");
  });
});
