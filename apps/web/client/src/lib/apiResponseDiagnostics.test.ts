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
