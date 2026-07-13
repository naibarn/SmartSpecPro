import { describe, expect, it } from "vitest";
import { TRPCClientError } from "@trpc/client";

import {
  RETRYABLE_MUTATION_MAX_ATTEMPTS,
  RETRYABLE_QUERY_MAX_ATTEMPTS,
  retryDelayMs,
  shouldRetryMutation,
  shouldRetryQuery,
} from "../requestResilience";

/**
 * Builds a real TRPCClientError the same way the library itself does when
 * the httpLink transport receives a JSON-RPC error envelope from the
 * server (`TRPCClientError.from`), carrying the given `data` — the shape
 * systemErrorMonitor's `classifyError` actually reads (`data.code`,
 * `data.httpStatus`). `TRPCClientError.from()`'s cause parameter accepts a
 * plain `object`, and everything downstream in requestResilience.ts takes
 * `error: unknown`, so the router generic is left for TS to default itself
 * (no need to pin it to a concrete router type here).
 */
function makeTrpcClientError(data: { code: string; httpStatus?: number }) {
  return TRPCClientError.from({
    error: {
      code: -32603,
      message: `mock ${data.code}`,
      data,
    },
  });
}

/** A pure network-connection failure: the request never reached the server. */
function makeNetworkError(): TypeError {
  return new TypeError("Failed to fetch");
}

describe("requestResilience", () => {
  describe("shouldRetryQuery", () => {
    it("is configured for 4 retry attempts", () => {
      expect(RETRYABLE_QUERY_MAX_ATTEMPTS).toBe(4);
    });

    it("retries a network TypeError while failureCount < 4, and stops at 4", () => {
      const error = makeNetworkError();
      for (let failureCount = 0; failureCount < RETRYABLE_QUERY_MAX_ATTEMPTS; failureCount++) {
        expect(shouldRetryQuery(failureCount, error)).toBe(true);
      }
      expect(shouldRetryQuery(RETRYABLE_QUERY_MAX_ATTEMPTS, error)).toBe(false);
    });

    it("does not retry a 4xx TRPCClientError", () => {
      const error = makeTrpcClientError({ code: "BAD_REQUEST", httpStatus: 400 });
      expect(shouldRetryQuery(0, error)).toBe(false);
    });

    it("retries a 5xx / INTERNAL_SERVER_ERROR TRPCClientError as transient", () => {
      const error = makeTrpcClientError({
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
      });
      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(shouldRetryQuery(RETRYABLE_QUERY_MAX_ATTEMPTS - 1, error)).toBe(true);
      expect(shouldRetryQuery(RETRYABLE_QUERY_MAX_ATTEMPTS, error)).toBe(false);
    });

    it("does not retry an UNAUTHORIZED TRPCClientError", () => {
      const error = makeTrpcClientError({ code: "UNAUTHORIZED", httpStatus: 401 });
      expect(shouldRetryQuery(0, error)).toBe(false);
    });
  });

  describe("shouldRetryMutation", () => {
    it("is configured for 5 retry attempts", () => {
      expect(RETRYABLE_MUTATION_MAX_ATTEMPTS).toBe(5);
    });

    it("retries a network TypeError while failureCount < 5, and stops at 5", () => {
      const error = makeNetworkError();
      for (
        let failureCount = 0;
        failureCount < RETRYABLE_MUTATION_MAX_ATTEMPTS;
        failureCount++
      ) {
        expect(shouldRetryMutation(failureCount, error)).toBe(true);
      }
      expect(shouldRetryMutation(RETRYABLE_MUTATION_MAX_ATTEMPTS, error)).toBe(false);
    });

    it("does not retry a 5xx TRPCClientError (the write may have already landed)", () => {
      const error = makeTrpcClientError({
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
      });
      expect(shouldRetryMutation(0, error)).toBe(false);
    });

    it("does not retry a 4xx TRPCClientError", () => {
      const error = makeTrpcClientError({ code: "BAD_REQUEST", httpStatus: 400 });
      expect(shouldRetryMutation(0, error)).toBe(false);
    });
  });

  describe("retryDelayMs", () => {
    it("returns capped exponential backoff", () => {
      expect(retryDelayMs(0)).toBe(1000);
      expect(retryDelayMs(1)).toBe(2000);
      expect(retryDelayMs(2)).toBe(4000);
      expect(retryDelayMs(3)).toBe(5000);
      expect(retryDelayMs(10)).toBe(5000);
    });
  });
});
