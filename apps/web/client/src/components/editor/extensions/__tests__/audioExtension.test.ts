// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { AudioExtension } from "../audioExtension";

function createTestEditor() {
  return new Editor({
    extensions: [
      StarterKit,
      AudioExtension,
      Markdown.configure({ html: true }),
    ],
    content: "",
  });
}

describe("AudioExtension", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it("parseHTML('<audio src=\"url\" controls>') creates AudioNode", () => {
    editor = createTestEditor();
    editor.commands.setContent('<audio src="https://example.com/audio.mp3" controls></audio>');
    const json = editor.getJSON();
    const audioNode = json.content?.find((n: any) => n.type === "audio");
    expect(audioNode).toBeDefined();
    expect(audioNode?.attrs?.src).toBe("https://example.com/audio.mp3");
  });

  it("parseHTML handles style attribute gracefully", () => {
    editor = createTestEditor();
    editor.commands.setContent(
      '<audio src="https://example.com/a.mp3" controls style="width:100%;"></audio>',
    );
    const json = editor.getJSON();
    const audioNode = json.content?.find((n: any) => n.type === "audio");
    expect(audioNode).toBeDefined();
    expect(audioNode?.attrs?.src).toBe("https://example.com/a.mp3");
  });

  it("renderHTML produces <audio> with controls attribute", () => {
    editor = createTestEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "audio",
          attrs: {
            src: "https://example.com/a.mp3",
            caption: "My Audio",
            controls: true,
          },
        },
      ],
    });
    const html = editor.getHTML();
    expect(html).toContain("<audio");
    expect(html).toContain("controls");
    expect(html).toContain("data-caption=\"My Audio\"");
  });

  it("setAudio command inserts an audio node", () => {
    editor = createTestEditor();
    editor.commands.setAudio({
      src: "https://example.com/a.mp3",
      caption: "Podcast",
    });
    const json = editor.getJSON();
    const audioNode = json.content?.find((n: any) => n.type === "audio");
    expect(audioNode).toBeDefined();
    expect(audioNode?.attrs?.src).toBe("https://example.com/a.mp3");
    expect(audioNode?.attrs?.caption).toBe("Podcast");
  });

  it("attributes round-trip correctly", () => {
    editor = createTestEditor();
    const attrs = {
      src: "https://example.com/a.mp3",
      caption: "test cap",
      assetId: "asset-789",
      controls: true,
    };
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "audio", attrs }],
    });
    const json = editor.getJSON();
    const audioNode = json.content?.find((n: any) => n.type === "audio");
    expect(audioNode?.attrs?.src).toBe(attrs.src);
    expect(audioNode?.attrs?.caption).toBe(attrs.caption);
    expect(audioNode?.attrs?.assetId).toBe(attrs.assetId);
  });

  it("rejects javascript: URLs", () => {
    editor = createTestEditor();
    editor.commands.setAudio({ src: "javascript:alert(1)" });
    const json = editor.getJSON();
    const audioNode = json.content?.find((n: any) => n.type === "audio");
    expect(audioNode?.attrs?.src ?? "").toBe("");
  });
});
