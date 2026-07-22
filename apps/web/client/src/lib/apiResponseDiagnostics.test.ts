import { describe, expect, it } from "vitest";

import {
  assertJsonApiResponse,
  buildUnexpectedHtmlResponseMessage,
  isHtmlApiErrorMessage,
} from "./apiResponseDiagnostics";

describe("apiResponseDiagnostics", () => {
  it("flags unexpected html parse errors", () => {
    expect(
      isHtmlApiErrorMessage("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"),
    ).toBe(true);
  });

  it("builds a session-expired html response message", () => {
    expect(
      buildUnexpectedHtmlResponseMessage({
        requestUrl: "https://smartaihub.app/trpc/library.getItem",
        status: 401,
        bodySnippet: "<!DOCTYPE html><html><body>Login</body></html>",
      }),
    ).toContain("session may have expired");
  });

  it("builds a timeout-specific html response message", () => {
    expect(
      buildUnexpectedHtmlResponseMessage({
        requestUrl: "https://smartaihub.app/trpc/chat.executeSkill",
        status: 524,
        bodySnippet: "<!DOCTYPE html><html><body>Cloudflare timeout</body></html>",
      }),
    ).toContain("lost its server/proxy connection");
  });

  it("explains that an HTML 502 mutation response may have completed", () => {
    const message = buildUnexpectedHtmlResponseMessage({
      requestUrl: "https://smartaihub.app/trpc/verticalDramaEpisodes.runStage",
      status: 502,
      contentType: "text/html; charset=utf-8",
      bodySnippet: "<!DOCTYPE html><html><body>Bad Gateway</body></html>",
    });

    expect(message).toContain("lost its server/proxy connection");
    expect(message).toContain("may still have completed");
    expect(message).not.toContain("web app shell");
  });

  it("throws a readable error when an api response is html", async () => {
    const response = new Response(
      "<!DOCTYPE html><html><body>App shell</body></html>",
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );

    await expect(
      assertJsonApiResponse(response, "https://smartaihub.app/trpc/library.getItem"),
    ).rejects.toThrow(/returned HTML instead of JSON/i);
  });

  it("includes response diagnostics for html api failures", async () => {
    const response = new Response(
      "<!DOCTYPE html><html><body>502 Bad Gateway</body></html>",
      {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "content-type": "text/html" },
      },
    );

    await expect(
      assertJsonApiResponse(response, "/trpc/chat.executeSkill"),
    ).rejects.toThrow(/status=502 Bad Gateway.*content-type=text\/html.*502 Bad Gateway/i);
  });
});
