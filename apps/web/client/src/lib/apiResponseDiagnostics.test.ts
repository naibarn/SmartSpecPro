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
});
