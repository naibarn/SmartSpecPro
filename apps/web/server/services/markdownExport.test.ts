import AdmZip from "adm-zip";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
  buildMarkdownDocxDocumentXml,
  buildMarkdownHtmlDocument,
  buildMarkdownPlainText,
  exportMarkdownArtifact,
  getMarkdownExportFileName,
} from "./markdownExport";

describe("markdownExport service", () => {
  beforeEach(() => {
    process.env.SMARTSPEC_PROXY_TOKEN = "test-proxy-token";
    process.env.PYTHON_BACKEND_URL = "http://python.test";
  });

  afterEach(() => {
    delete process.env.SMARTSPEC_PROXY_TOKEN;
    delete process.env.PYTHON_BACKEND_URL;
    vi.unstubAllGlobals();
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

  it("exports a docx artifact from the server", async () => {
    const artifact = await exportMarkdownArtifact({
      markdown: "# Hello",
      title: "Notes.md",
      format: "docx",
    });

    expect(artifact.fileName).toBe("Notes.docx");
    expect(artifact.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const zip = new AdmZip(Buffer.from(artifact.dataBase64, "base64"));
    expect(zip.getEntry("word/document.xml")).toBeTruthy();
  });

  it("requests PDF rendering from the backend and returns a PDF artifact", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(String(_url)).toBe("http://python.test/api/internal/library/render-pdf");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-proxy-token")).toBe("test-proxy-token");
      return {
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode("%PDF-1.4 fake pdf").buffer,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const artifact = await exportMarkdownArtifact({
      markdown: "# Hello",
      title: "Notes.md",
      format: "pdf",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(artifact.fileName).toBe("Notes.pdf");
    expect(artifact.mimeType).toBe("application/pdf");
    expect(Buffer.from(artifact.dataBase64, "base64").toString("utf8")).toContain("%PDF-1.4");
  });
});
