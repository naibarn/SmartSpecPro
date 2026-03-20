// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parse, serialize, getDefaultExtensions } from "./TiptapMarkdownBridge";
import type { JSONContent } from "@tiptap/core";

function findNode(
  doc: JSONContent,
  type: string,
): JSONContent | undefined {
  if (doc.type === type) return doc;
  for (const child of doc.content ?? []) {
    const found = findNode(child, type);
    if (found) return found;
  }
  return undefined;
}

function findMark(
  doc: JSONContent,
  markType: string,
): JSONContent | undefined {
  if (doc.marks?.some((m) => m.type === markType)) return doc;
  for (const child of doc.content ?? []) {
    const found = findMark(child, markType);
    if (found) return found;
  }
  return undefined;
}

describe("TiptapMarkdownBridge.parse", () => {
  it("parses heading markdown into a heading node", () => {
    const doc = parse("# Heading");
    const heading = findNode(doc, "heading");
    expect(heading).toBeDefined();
    expect(heading!.attrs?.level).toBe(1);
  });

  it("parses bold text into marks", () => {
    const doc = parse("**bold** text");
    const bold = findMark(doc, "bold");
    expect(bold).toBeDefined();
    expect(bold!.text).toBe("bold");
  });

  it("parses bullet list into bulletList node", () => {
    const doc = parse("- item 1\n- item 2");
    const list = findNode(doc, "bulletList");
    expect(list).toBeDefined();
    expect(list!.content?.length).toBe(2);
  });

  it("parses blockquote into blockquote node", () => {
    const doc = parse("> quote");
    const bq = findNode(doc, "blockquote");
    expect(bq).toBeDefined();
  });

  it("parses fenced code block into codeBlock node", () => {
    const doc = parse("```python\ncode\n```");
    const cb = findNode(doc, "codeBlock");
    expect(cb).toBeDefined();
  });

  it("parses table markdown into table structure", () => {
    const doc = parse("| h1 | h2 |\n|---|---|\n| a | b |");
    const table = findNode(doc, "table");
    expect(table).toBeDefined();
    const rows = table!.content?.filter((n) => n.type === "tableRow");
    expect(rows!.length).toBeGreaterThanOrEqual(2);
  });

  it("parses horizontal rule into horizontalRule node", () => {
    const doc = parse("---");
    const hr = findNode(doc, "horizontalRule");
    expect(hr).toBeDefined();
  });

  it("parses image markdown into image node with src and alt", () => {
    const doc = parse("![alt text](https://example.com/img.png)");
    const img = findNode(doc, "image");
    expect(img).toBeDefined();
    expect(img!.attrs?.src).toBe("https://example.com/img.png");
    expect(img!.attrs?.alt).toBe("alt text");
  });

  // Video/audio tests depend on section 06 custom extensions
  it.skip("parses <video> HTML tag into video node", () => {
    const doc = parse(
      '<video src="https://example.com/v.mp4" controls></video>',
    );
    const video = findNode(doc, "video");
    expect(video).toBeDefined();
    expect(video!.attrs?.src).toBe("https://example.com/v.mp4");
  });

  it.skip("parses <video> with data-* attributes and preserves them", () => {
    const doc = parse(
      '<video src="url" data-poster="p.jpg" data-caption="My caption" data-asset-id="abc-123" controls></video>',
    );
    const video = findNode(doc, "video");
    expect(video).toBeDefined();
    expect(video!.attrs?.poster).toBe("p.jpg");
    expect(video!.attrs?.caption).toBe("My caption");
    expect(video!.attrs?.assetId).toBe("abc-123");
  });

  it.skip("parses <audio> HTML tag into audio node", () => {
    const doc = parse(
      '<audio src="https://example.com/a.mp3" controls></audio>',
    );
    const audio = findNode(doc, "audio");
    expect(audio).toBeDefined();
    expect(audio!.attrs?.src).toBe("https://example.com/a.mp3");
  });

  it("parses empty string into an empty document without crashing", () => {
    const doc = parse("");
    expect(doc.type).toBe("doc");
  });

  it("parses unknown HTML gracefully without crashing", () => {
    expect(() => parse("<div>unknown html</div>")).not.toThrow();
    const doc = parse("<div>unknown html</div>");
    expect(doc.type).toBe("doc");
  });
});

describe("TiptapMarkdownBridge.serialize", () => {
  it("serializes a heading document to markdown", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Heading" }],
        },
      ],
    };
    const md = serialize(doc);
    expect(md).toContain("# Heading");
  });

  it("serializes an image node to markdown image syntax", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "https://example.com/img.png", alt: "text" },
        },
      ],
    };
    const md = serialize(doc);
    expect(md).toContain("![text](https://example.com/img.png)");
  });

  // Video serialization depends on section 06
  it.skip("serializes a video node to <video> HTML with data-* attributes", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "video",
          attrs: {
            src: "https://example.com/v.mp4",
            poster: "p.jpg",
            caption: "My caption",
            assetId: "abc-123",
          },
        },
      ],
    };
    const md = serialize(doc);
    expect(md).toContain("<video");
    expect(md).toContain('data-poster="p.jpg"');
  });
});

describe("TiptapMarkdownBridge round-trip", () => {
  function roundTrip(markdown: string) {
    const doc1 = parse(markdown);
    const serialized = serialize(doc1);
    const doc2 = parse(serialized);
    return { doc1, doc2, serialized };
  }

  it("round-trips heading markdown", () => {
    const { doc1, doc2 } = roundTrip("# My Heading");
    const h1 = findNode(doc1, "heading");
    const h2 = findNode(doc2, "heading");
    expect(h1?.attrs?.level).toBe(h2?.attrs?.level);
    expect(h1?.content?.[0]?.text).toBe(h2?.content?.[0]?.text);
  });

  it("round-trips paragraph with inline formatting", () => {
    const { doc1, doc2 } = roundTrip(
      "This has **bold** and *italic* text",
    );
    expect(findMark(doc1, "bold")).toBeDefined();
    expect(findMark(doc2, "bold")).toBeDefined();
    expect(findMark(doc1, "italic")).toBeDefined();
    expect(findMark(doc2, "italic")).toBeDefined();
  });

  it("round-trips bullet list", () => {
    const { doc1, doc2 } = roundTrip("- one\n- two\n- three");
    const l1 = findNode(doc1, "bulletList");
    const l2 = findNode(doc2, "bulletList");
    expect(l1?.content?.length).toBe(l2?.content?.length);
  });

  it("round-trips blockquote", () => {
    const { doc1, doc2 } = roundTrip("> quoted text");
    expect(findNode(doc1, "blockquote")).toBeDefined();
    expect(findNode(doc2, "blockquote")).toBeDefined();
  });

  it("round-trips image markdown", () => {
    const { doc1, doc2 } = roundTrip(
      "![alt](https://example.com/img.png)",
    );
    const i1 = findNode(doc1, "image");
    const i2 = findNode(doc2, "image");
    expect(i1?.attrs?.src).toBe(i2?.attrs?.src);
    expect(i1?.attrs?.alt).toBe(i2?.attrs?.alt);
  });
});

describe("getDefaultExtensions", () => {
  it("returns a non-empty array of extensions", () => {
    const exts = getDefaultExtensions();
    expect(Array.isArray(exts)).toBe(true);
    expect(exts.length).toBeGreaterThan(0);
  });
});
