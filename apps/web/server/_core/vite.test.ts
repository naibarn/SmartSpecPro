import { describe, expect, it } from "vitest";

import { isApiRequestPath } from "./apiPathGuard";

describe("vite api fallback guard", () => {
  it("classifies tRPC and API paths as API requests", () => {
    expect(isApiRequestPath("/trpc/chat.executeSkill")).toBe(true);
    expect(isApiRequestPath("/trpc/chat.executeSkill?batch=1")).toBe(true);
    expect(isApiRequestPath("/api/oauth/google/authorize")).toBe(true);
  });

  it("does not classify app routes or static assets as API requests", () => {
    expect(isApiRequestPath("/chat?c=71")).toBe(false);
    expect(isApiRequestPath("/assets/index.js")).toBe(false);
  });
});
