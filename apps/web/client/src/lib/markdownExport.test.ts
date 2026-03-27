/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMarkdownDocxDocumentXml,
  buildMarkdownHtmlDocument,
  buildMarkdownPlainText,
  exportMarkdownAsDocx,
  getMarkdownExportFileName,
} from "./markdownExport";

describe("markdownExport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("builds stable export filenames", () => {
    expect(getMarkdownExportFileName("Notes.md", "html")).toBe("Notes.html");
    expect(getMarkdownExportFileName("Quarterly Report", "txt")).toBe("Quarterly Report.txt");
  });

  it("builds an HTML export document", () => {
    const html = buildMarkdownHtmlDocument("# Hello\n\nThis is **bold**.");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<main>");
  });

  it("builds structured plain text output", () => {
    const text = buildMarkdownPlainText("# Hello\n\n- Item one\n- Item two");
    expect(text).toContain("# Hello");
    expect(text).toContain("- Item one");
    expect(text).toContain("- Item two");
  });

  it("builds a docx document xml payload", () => {
    const xml = buildMarkdownDocxDocumentXml("# Hello\n\n> Quote");
    expect(xml).toContain("<w:document");
    expect(xml).toContain("Hello");
    expect(xml).toContain("&gt; Quote");
  });

  it("exports a docx zip blob with Word parts", async () => {
    const createObjectURLMock = vi.fn(() => "blob:docx");
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURLMock,
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURLMock,
      configurable: true,
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    exportMarkdownAsDocx("# Hello", "Notes.md");

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const blob = createObjectURLMock.mock.calls[0]?.[0] as Blob | undefined;
    expect(blob).toBeDefined();
    expect(blob?.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(blob?.size ?? 0).toBeGreaterThan(0);

    vi.runAllTimers();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:docx");
  });
});
