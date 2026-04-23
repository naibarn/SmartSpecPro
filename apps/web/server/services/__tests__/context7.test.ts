import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchDocsForMessage } from "../context7";

describe("context7", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns docs with context hints for prompt injection", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      if (body?.params?.name === "resolve-library-id") {
        return {
          ok: true,
          json: async () => ({
            result: {
              content: [
                {
                  type: "text",
                  text: [
                    "Context7-compatible library ID: /react/react",
                    "Title: React",
                    "Description: UI library",
                    "Code Snippets: 120",
                    "Benchmark Score: 99.1",
                  ].join("\n"),
                },
              ],
            },
          }),
        } as Response;
      }

      if (body?.params?.name === "query-docs") {
        return {
          ok: true,
          json: async () => ({
            result: {
              content: [
                {
                  type: "text",
                  text: "React docs say use hooks responsibly and keep components small.",
                },
              ],
            },
          }),
        } as Response;
      }

      return { ok: false, json: async () => ({}) } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDocsForMessage("docs for React hooks", "context7-key");

    expect(result?.libraryName).toBe("React");
    expect(result?.docs).toContain("use hooks responsibly");
    expect(result?.contextState?.toolResults?.[0].content).toContain("React docs");
  });
});
