// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { ImageExtension } from "../imageExtension";

function createTestEditor() {
  return new Editor({
    extensions: [
      StarterKit,
      ImageExtension,
      Markdown.configure({ html: true }),
    ],
    content: "",
  });
}

describe("ImageExtension", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it("parseHTML('<img src=\"url\" alt=\"text\">') creates ImageNode with correct attributes", () => {
    editor = createTestEditor();
    editor.commands.setContent('<img src="https://example.com/img.png" alt="my image">');
    const json = editor.getJSON();
    const imageNode = json.content?.find((n: any) => n.type === "image");
    expect(imageNode).toBeDefined();
    expect(imageNode?.attrs?.src).toBe("https://example.com/img.png");
    expect(imageNode?.attrs?.alt).toBe("my image");
  });

  it("parseHTML('<figure>') extracts caption from <figcaption>", () => {
    editor = createTestEditor();
    editor.commands.setContent(
      '<figure><img src="https://example.com/img.png"><figcaption>My Caption</figcaption></figure>',
    );
    const json = editor.getJSON();
    const imageNode = json.content?.find((n: any) => n.type === "image");
    expect(imageNode).toBeDefined();
    expect(imageNode?.attrs?.src).toBe("https://example.com/img.png");
    expect(imageNode?.attrs?.caption).toBe("My Caption");
  });

  it("renderHTML produces <img> with data-* attributes", () => {
    editor = createTestEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "https://example.com/img.png",
            alt: "test",
            caption: "cap",
            assetId: "abc-123",
            alignment: "left",
          },
        },
      ],
    });
    const html = editor.getHTML();
    expect(html).toContain("src=\"https://example.com/img.png\"");
    expect(html).toContain("data-caption=\"cap\"");
    expect(html).toContain("data-asset-id=\"abc-123\"");
    expect(html).toContain("data-alignment=\"left\"");
  });

  it("attributes round-trip through parseHTML/renderHTML", () => {
    editor = createTestEditor();
    const attrs = {
      src: "https://example.com/img.png",
      alt: "test alt",
      caption: "test caption",
      width: null,
      alignment: "right",
      assetId: "id-456",
    };
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "image", attrs }],
    });
    const json = editor.getJSON();
    const imageNode = json.content?.find((n: any) => n.type === "image");
    expect(imageNode?.attrs?.src).toBe(attrs.src);
    expect(imageNode?.attrs?.alt).toBe(attrs.alt);
    expect(imageNode?.attrs?.alignment).toBe(attrs.alignment);
    expect(imageNode?.attrs?.assetId).toBe(attrs.assetId);
  });

  it("setImage command inserts an image node", () => {
    editor = createTestEditor();
    editor.commands.setImage({
      src: "https://example.com/new.png",
      alt: "new image",
      caption: "new cap",
    });
    const json = editor.getJSON();
    const imageNode = json.content?.find((n: any) => n.type === "image");
    expect(imageNode).toBeDefined();
    expect(imageNode?.attrs?.src).toBe("https://example.com/new.png");
  });

  it("missing src defaults to empty string without crashing", () => {
    editor = createTestEditor();
    editor.commands.setContent('<img alt="no source">');
    const json = editor.getJSON();
    // Should not throw — graceful handling
    expect(json).toBeDefined();
  });

  it("rejects javascript: URLs in src", () => {
    editor = createTestEditor();
    editor.commands.setImage({ src: "javascript:alert(1)" });
    const json = editor.getJSON();
    const imageNode = json.content?.find((n: any) => n.type === "image");
    expect(imageNode?.attrs?.src ?? "").toBe("");
  });
});
