import { describe, expect, it } from "vitest";

import { redactRuntimeMetadata } from "../agentRuntime/redaction";

describe("redactRuntimeMetadata", () => {
  it("redacts JWTs", () => {
    const value = redactRuntimeMetadata({
      accessToken:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTYifQ.signature",
    });

    expect(String(value.accessToken)).toContain("[REDACTED]");
  });

  it("redacts bearer tokens", () => {
    const value = redactRuntimeMetadata({
      authorization: "Bearer secret-token-123",
    });

    expect(value.authorization).toBe("[REDACTED]");
  });

  it("redacts provider API keys", () => {
    const value = redactRuntimeMetadata({
      providerKey: "sk-proj-abcdefghi123456789",
    });

    expect(String(value.providerKey)).toContain("[REDACTED_KEY]");
  });

  it("redacts signed urls", () => {
    const value = redactRuntimeMetadata({
      artifactUrl:
        "https://storage.example.com/object?X-Amz-Signature=abcdef&X-Amz-Expires=60",
    });

    expect(value.artifactUrl).toBe("[REDACTED_SIGNED_URL]");
  });

  it("redacts cookie values", () => {
    const value = redactRuntimeMetadata({
      cookie: "__Secure-session=abc123; Path=/; HttpOnly",
    });

    expect(value.cookie).toBe("[REDACTED]");
  });

  it("redacts oauth refresh tokens", () => {
    const value = redactRuntimeMetadata({
      refresh_token: "refresh-token-123",
    });

    expect(value.refresh_token).toBe("[REDACTED]");
  });

  it("redacts nested connector credentials", () => {
    const value = redactRuntimeMetadata({
      connectorCredentials: {
        clientSecret: "super-secret",
        nestedToken: "token-123",
      },
    });

    expect(value.connectorCredentials).toBe("[REDACTED]");
  });

  it("truncates large raw document fragments", () => {
    const largeFragment = Array.from({ length: 20 })
      .map((_, index) => `line-${index + 1}: detailed raw document content`)
      .join("\n");

    const value = redactRuntimeMetadata({
      extractedDocument: largeFragment,
    });

    expect(String(value.extractedDocument)).toContain(
      "[TRUNCATED_DOCUMENT_FRAGMENT",
    );
  });
});
