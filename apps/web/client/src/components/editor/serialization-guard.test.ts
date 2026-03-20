// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import * as bridge from "./TiptapMarkdownBridge";
import {
  checkSerializationIntegrity,
  countNodes,
} from "./serialization-guard";
import type { JSONContent } from "@tiptap/core";

const { parse } = bridge;

describe("countNodes", () => {
  it("counts structural nodes excluding doc and text", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hello" }],
        },
      ],
    };
    // 1 paragraph (doc and text are excluded)
    expect(countNodes(doc)).toBe(1);
  });

  it("counts nested structures", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "item 1" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "item 2" }],
                },
              ],
            },
          ],
        },
      ],
    };
    // heading + bulletList + 2 listItems + 2 paragraphs = 6
    expect(countNodes(doc)).toBe(6);
  });
});

describe("checkSerializationIntegrity", () => {
  it("simple paragraph round-trips without warning", () => {
    const doc = parse("Hello world, this is a paragraph.");
    const result = checkSerializationIntegrity(doc);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeNull();
  });

  it("heading + list + blockquote round-trips without warning", () => {
    const md = [
      "## Section Title",
      "",
      "- Item one",
      "- Item two",
      "- Item three",
      "",
      "> A blockquote here",
    ].join("\n");
    const doc = parse(md);
    const result = checkSerializationIntegrity(doc);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeNull();
  });

  it("document with 12 paragraph nodes round-trips within 90% threshold", () => {
    const paragraphs = Array.from(
      { length: 12 },
      (_, i) => `Paragraph number ${i + 1} with some content.`,
    ).join("\n\n");
    const doc = parse(paragraphs);
    const result = checkSerializationIntegrity(doc);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeNull();
  });

  it("complex nested structure that loses nodes triggers warning", () => {
    // Mock TiptapMarkdownBridge to simulate a round-trip that loses nodes.
    // This tests the threshold logic: if >10% of nodes are lost, warn.

    // Create a doc with 10 paragraphs (10 structural nodes)
    const doc: JSONContent = {
      type: "doc",
      content: Array.from({ length: 10 }, (_, i) => ({
        type: "paragraph",
        content: [{ type: "text", text: `Line ${i + 1}` }],
      })),
    };

    // Mock parse to return a doc with only 5 nodes (50% loss → triggers warning)
    const spyParse = vi.spyOn(bridge, "parse").mockReturnValueOnce({
      type: "doc",
      content: Array.from({ length: 5 }, (_, i) => ({
        type: "paragraph",
        content: [{ type: "text", text: `Line ${i + 1}` }],
      })),
    });

    const result = checkSerializationIntegrity(doc);
    expect(result.ok).toBe(false);
    expect(result.warning).toBeTruthy();
    expect(typeof result.warning).toBe("string");
    expect(result.warning).toContain("5");

    spyParse.mockRestore();
  });

  it("empty document does not trigger false positive", () => {
    const doc = parse("");
    const result = checkSerializationIntegrity(doc);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeNull();
  });

  it("document with legacy HTML preserves content through guard", () => {
    const md = [
      '<video src="/uploads/vid.mp4" controls></video>',
      "",
      '<audio src="/uploads/aud.mp3" controls></audio>',
    ].join("\n");
    const doc = parse(md);
    const result = checkSerializationIntegrity(doc);
    expect(result.ok).toBe(true);
    expect(result.warning).toBeNull();
  });
});
