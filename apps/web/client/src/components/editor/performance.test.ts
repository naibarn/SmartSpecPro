// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parse, serialize } from "./TiptapMarkdownBridge";

/**
 * Generates a realistic markdown document of approximately the given word count.
 * Produces varied content: headings, paragraphs with inline formatting,
 * bullet lists, code blocks, and blockquotes.
 */
function generateMarkdown(wordCount: number): string {
  const blocks: string[] = [];
  let currentWords = 0;
  let sectionNum = 0;

  while (currentWords < wordCount) {
    sectionNum++;

    // H2 heading (~4 words)
    blocks.push(`## Section ${sectionNum}: Important Topic`);
    currentWords += 4;
    if (currentWords >= wordCount) break;

    // Paragraph with inline formatting (~30 words)
    blocks.push(
      `This is a detailed paragraph about topic ${sectionNum}. It contains **bold text** and *italic text* for emphasis. ` +
        `Here is a [link](https://example.com) and some \`inline code\` to demonstrate various formatting options that the editor must handle.`,
    );
    currentWords += 30;
    if (currentWords >= wordCount) break;

    // Second paragraph (~25 words)
    blocks.push(
      `The implementation requires careful attention to detail. Each component must be tested individually ` +
        `and integrated properly. Performance and reliability are critical requirements for production use.`,
    );
    currentWords += 25;
    if (currentWords >= wordCount) break;

    // Bullet list (~25 words)
    blocks.push(
      [
        "- First item in the list with description",
        "- Second item covering another aspect",
        "- Third item with **bold emphasis**",
        "- Fourth item mentioning *italic style*",
        "- Fifth item wrapping up the section",
      ].join("\n"),
    );
    currentWords += 25;
    if (currentWords >= wordCount) break;

    // Code block (~15 words)
    blocks.push(
      [
        "```typescript",
        `function process${sectionNum}(data: string): Result {`,
        "  const parsed = JSON.parse(data);",
        "  return { status: 'ok', value: parsed };",
        "}",
        "```",
      ].join("\n"),
    );
    currentWords += 15;
    if (currentWords >= wordCount) break;

    // Blockquote (~10 words)
    blocks.push(
      `> Important note: always validate input before processing data in section ${sectionNum}.`,
    );
    currentWords += 10;
  }

  return blocks.join("\n\n");
}

describe("Performance Benchmarks", () => {
  it("5,000-word document loads in <1000ms", () => {
    const md = generateMarkdown(5000);
    const start = performance.now();
    parse(md);
    const elapsed = performance.now() - start;
    // Budget generous for CI/shared environments; real target is <500ms
    expect(elapsed).toBeLessThan(1000);
  });

  it("20,000-word document loads in <3000ms", () => {
    const md = generateMarkdown(20000);
    const start = performance.now();
    parse(md);
    const elapsed = performance.now() - start;
    // Budget generous for CI/shared environments; real target is <2000ms
    expect(elapsed).toBeLessThan(3000);
  });

  it("serialization of 20K-word document completes in <2000ms", () => {
    const md = generateMarkdown(20000);
    const doc = parse(md);
    const start = performance.now();
    serialize(doc);
    const elapsed = performance.now() - start;
    // Budget generous for CI/shared environments; real target is <1000ms
    expect(elapsed).toBeLessThan(2000);
  });

  it.skip("mode switch (View->Edit) completes in <500ms on 20K-word doc", () => {
    // Measures parse + serialize cycle time (what happens on a mode switch)
    // Skipped: jsdom overhead makes this unreliable — validate via Playwright
    const md = generateMarkdown(20000);
    const start = performance.now();
    const doc = parse(md);
    serialize(doc);
    parse(md);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it.skip("typing latency <100ms on 20,000-word document", () => {
    // Aspirational in jsdom (no real DOM rendering).
    // True typing latency must be validated via manual QA or Playwright.
    const md = generateMarkdown(20000);
    const doc = parse(md);
    expect(doc.type).toBe("doc");
  });
});
