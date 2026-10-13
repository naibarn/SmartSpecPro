import { describe, expect, it } from "vitest";
import { toPythonBackendPath } from "./pythonBackendProxy";

describe("Python backend API path translation", () => {
  it("maps OpenAI-compatible browser routes to the Python v1 router", () => {
    expect(toPythonBackendPath("/api/v1/chat/completions")).toBe(
      "/v1/chat/completions",
    );
  });

  it("preserves the existing Python API prefix for non-OpenAI routes", () => {
    expect(toPythonBackendPath("/api/v1/media/tasks?limit=10")).toBe(
      "/api/v1/media/tasks?limit=10",
    );
  });

  it("preserves query strings", () => {
    expect(toPythonBackendPath("/api/v1/models?tenant=uat")).toBe(
      "/v1/models?tenant=uat",
    );
  });

  it("rejects paths outside the supported API prefix", () => {
    expect(() => toPythonBackendPath("/api/admin/users")).toThrow(
      "Unsupported Python backend API path",
    );
    expect(() => toPythonBackendPath("/api/v1x/models")).toThrow(
      "Unsupported Python backend API path",
    );
  });
});
