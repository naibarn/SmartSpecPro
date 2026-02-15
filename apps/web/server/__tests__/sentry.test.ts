import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sentry/node before importing sentry service (v10 API)
vi.mock("@sentry/node", () => {
  const scope = {
    setTag: vi.fn(),
    setUser: vi.fn(),
  };
  return {
    init: vi.fn(),
    captureException: vi.fn(),
    getIsolationScope: vi.fn(() => scope),
    getCurrentScope: vi.fn(() => scope),
    expressIntegration: vi.fn(),
    setupExpressErrorHandler: vi.fn(),
    close: vi.fn(),
  };
});

import { beforeSend } from "../services/sentry";
import type * as SentryTypes from "@sentry/node";

describe("Sentry Node.js Integration", () => {
  describe("PII Scrubbing (beforeSend)", () => {
    it("should scrub authorization and cookie headers", () => {
      const event = {
        request: {
          headers: {
            authorization: "Bearer secret-token-123",
            cookie: "session=abc123; user=data",
            "content-type": "application/json",
          },
        },
      } as unknown as SentryTypes.Event;

      const result = beforeSend(event);

      expect(result).not.toBeNull();
      expect(result!.request!.headers!["authorization"]).toBe("[FILTERED]");
      expect(result!.request!.headers!["cookie"]).toBe("[FILTERED]");
      expect(result!.request!.headers!["content-type"]).toBe("application/json");
    });

    it("should scrub x-proxy-token header", () => {
      const event = {
        request: {
          headers: {
            "x-proxy-token": "proxy-secret-value",
          },
        },
      } as unknown as SentryTypes.Event;

      const result = beforeSend(event);

      expect(result).not.toBeNull();
      expect(result!.request!.headers!["x-proxy-token"]).toBe("[FILTERED]");
    });

    it("should scrub sensitive body fields (password, token, secret, apiKey)", () => {
      const body = {
        username: "john",
        password: "my-secret-pass",
        token: "auth-token",
        secret: "shhh",
        apiKey: "key-123",
        normalField: "keep-this",
      };

      const event = {
        request: {
          data: JSON.stringify(body),
        },
      } as unknown as SentryTypes.Event;

      const result = beforeSend(event);

      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!.request!.data as string);
      expect(parsed.username).toBe("john");
      expect(parsed.password).toBe("[FILTERED]");
      expect(parsed.token).toBe("[FILTERED]");
      expect(parsed.secret).toBe("[FILTERED]");
      expect(parsed.apiKey).toBe("[FILTERED]");
      expect(parsed.normalField).toBe("keep-this");
    });

    it("should handle events without request data", () => {
      const event = {
        message: "test error",
      } as unknown as SentryTypes.Event;

      const result = beforeSend(event);

      expect(result).not.toBeNull();
      expect(result!.message).toBe("test error");
    });

    it("should handle non-JSON body data gracefully", () => {
      const event = {
        request: {
          data: "not-json-data",
        },
      } as unknown as SentryTypes.Event;

      const result = beforeSend(event);

      expect(result).not.toBeNull();
      expect(result!.request!.data).toBe("not-json-data");
    });
  });
});
