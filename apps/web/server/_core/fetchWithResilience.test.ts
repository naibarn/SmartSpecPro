import { describe, it, expect, vi } from "vitest";
import {
  fetchWithResilience,
  defaultRetryDelayMs,
  defaultPolicyForMethod,
  getErrorCode,
  isConnectError,
  isTransientNetworkError,
  CONNECT_ERROR_CODES,
} from "./fetchWithResilience";

/** Build a fetchImpl that resolves to a fixed-status Response every call. */
function fixedStatusFetchImpl(status: number, body = "{}") {
  return vi.fn(async () => new Response(body, { status }));
}

/** Build a fetchImpl whose promise only settles when its `signal` fires — mimics a hung connection. */
function signalAwareFetchImpl() {
  return vi.fn((_url: unknown, init: RequestInit | undefined) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal ?? undefined;
      if (!signal) return;
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  });
}

describe("fetchWithResilience", () => {
  it("1. succeeds on the first try — fetchImpl called once, body still readable", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const res = await fetchWithResilience("http://localhost:8000/health", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: () => 0,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("2. GET retries on 503 up to maxRetries then returns the final 503", async () => {
    const fetchImpl = fixedStatusFetchImpl(503, "server error");

    const res = await fetchWithResilience("http://localhost:8000/x", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: () => 0,
      maxRetries: 3,
    });

    expect(res.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  it("3. GET retries on ECONNREFUSED then succeeds on a later attempt", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call < 3) {
        throw new TypeError("fetch failed", {
          cause: { code: "ECONNREFUSED" },
        });
      }
      return new Response("{}", { status: 200 });
    });

    const res = await fetchWithResilience("http://localhost:8000/x", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: () => 0,
      maxRetries: 3,
    });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("4. GET returns 404 immediately, never retried", async () => {
    const fetchImpl = fixedStatusFetchImpl(404, "not found");

    const res = await fetchWithResilience("http://localhost:8000/x", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: () => 0,
      maxRetries: 3,
    });

    expect(res.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("4b. GET with a response missing a numeric status is returned as-is, not retried", async () => {
    // Real fetch always sets a numeric status, but a partial mock (or an exotic
    // Response) may not. A statusless response must be treated as a terminal
    // result — NOT misclassified as a retryable 5xx (`undefined < 500` is false,
    // which would otherwise trigger the transient-retry path and hang/timeout).
    const statuslessOk = { ok: true, json: async () => ({ state: "done" }) };
    const fetchImpl = vi.fn(async () => statuslessOk as unknown as Response);

    const res = await fetchWithResilience("http://localhost:8000/status", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: () => 0,
      maxRetries: 3,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res).toBe(statuslessOk as unknown as Response);
  });

  it("5. POST (default 'off') does NOT retry on 503", async () => {
    const fetchImpl = fixedStatusFetchImpl(503, "server error");

    const res = await fetchWithResilience("http://localhost:8000/x", {
      method: "POST",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: () => 0,
      maxRetries: 3,
    });

    expect(res.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("6. POST (default 'off') does NOT retry on a thrown ECONNREFUSED — rethrows", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    });

    await expect(
      fetchWithResilience("http://localhost:8000/x", {
        method: "POST",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        backoffMs: () => 0,
        maxRetries: 3,
      })
    ).rejects.toThrow("fetch failed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("7a. POST with retryPolicy 'connect-only' DOES retry on ECONNREFUSED", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call < 2) {
        throw new TypeError("fetch failed", {
          cause: { code: "ECONNREFUSED" },
        });
      }
      return new Response("{}", { status: 200 });
    });

    const res = await fetchWithResilience("http://localhost:8000/x", {
      method: "POST",
      retryPolicy: "connect-only",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: () => 0,
      maxRetries: 3,
    });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("7b. POST with retryPolicy 'connect-only' does NOT retry on 503", async () => {
    const fetchImpl = fixedStatusFetchImpl(503, "server error");

    const res = await fetchWithResilience("http://localhost:8000/x", {
      method: "POST",
      retryPolicy: "connect-only",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: () => 0,
      maxRetries: 3,
    });

    expect(res.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("8. POST with 'connect-only' does NOT retry a generic ECONNRESET (may have reached server)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
    });

    await expect(
      fetchWithResilience("http://localhost:8000/x", {
        method: "POST",
        retryPolicy: "connect-only",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        backoffMs: () => 0,
        maxRetries: 3,
      })
    ).rejects.toThrow("fetch failed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("9a. GET (transient) retries when our own AbortSignal.timeout ceiling fires", async () => {
    const fetchImpl = signalAwareFetchImpl();

    await expect(
      fetchWithResilience("http://localhost:8000/x", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        backoffMs: () => 0,
        timeoutMs: 30,
        maxRetries: 1,
      })
    ).rejects.toMatchObject({ name: "TimeoutError" });

    expect(fetchImpl).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("9b. POST (default 'off') does NOT retry when our own AbortSignal.timeout ceiling fires", async () => {
    const fetchImpl = signalAwareFetchImpl();

    await expect(
      fetchWithResilience("http://localhost:8000/x", {
        method: "POST",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        backoffMs: () => 0,
        timeoutMs: 30,
      })
    ).rejects.toMatchObject({ name: "TimeoutError" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("10. rethrows a caller AbortError immediately and never retries", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(
      async (_url: unknown, init: RequestInit | undefined) => {
        if (init?.signal?.aborted) {
          throw init.signal.reason;
        }
        return new Response("{}", { status: 200 });
      }
    );

    await expect(
      fetchWithResilience("http://localhost:8000/x", {
        signal: controller.signal,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        backoffMs: () => 0,
        maxRetries: 3,
      })
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops retrying and rethrows if the caller aborts mid-backoff", async () => {
    const controller = new AbortController();
    const fetchImpl = fixedStatusFetchImpl(503, "server error");

    const promise = fetchWithResilience("http://localhost:8000/x", {
      signal: controller.signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: () => 50,
      maxRetries: 3,
    });
    // Synchronous abort right after kicking the call off — the first
    // fetchImpl call always resolves before the retry loop reaches the
    // backoff sleep, so this reliably lands inside the backoff window.
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("invokes backoffMs with 0-indexed attempt numbers between retries", async () => {
    const seen: number[] = [];
    const fetchImpl = fixedStatusFetchImpl(503, "server error");

    await fetchWithResilience("http://localhost:8000/x", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: attempt => {
        seen.push(attempt);
        return 0;
      },
      maxRetries: 2,
    });

    expect(seen).toEqual([0, 1]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("strips resilience-only options out of the init object passed to fetchImpl", async () => {
    let capturedInit: (RequestInit & Record<string, unknown>) | undefined;
    const fetchImpl = vi.fn(
      async (_url: unknown, init: RequestInit | undefined) => {
        capturedInit = init as RequestInit & Record<string, unknown>;
        return new Response("{}", { status: 200 });
      }
    );

    await fetchWithResilience("http://localhost:8000/x", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: () => 0,
      timeoutMs: 5000,
      maxRetries: 2,
      retryPolicy: "transient",
      label: "test-call",
      headers: { "X-Test": "1" },
    });

    expect(capturedInit).toBeDefined();
    expect(capturedInit).not.toHaveProperty("timeoutMs");
    expect(capturedInit).not.toHaveProperty("maxRetries");
    expect(capturedInit).not.toHaveProperty("retryPolicy");
    expect(capturedInit).not.toHaveProperty("label");
    expect(capturedInit).not.toHaveProperty("backoffMs");
    expect(capturedInit).not.toHaveProperty("fetchImpl");
    expect(capturedInit?.headers).toEqual({ "X-Test": "1" });
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("defaultRetryDelayMs", () => {
  it("11. follows the capped exponential schedule", () => {
    expect(defaultRetryDelayMs(0)).toBe(1000);
    expect(defaultRetryDelayMs(1)).toBe(2000);
    expect(defaultRetryDelayMs(2)).toBe(4000);
    expect(defaultRetryDelayMs(3)).toBe(5000);
    expect(defaultRetryDelayMs(4)).toBe(5000);
  });
});

describe("defaultPolicyForMethod", () => {
  it("12. returns 'transient' for GET/HEAD/OPTIONS", () => {
    expect(defaultPolicyForMethod("GET")).toBe("transient");
    expect(defaultPolicyForMethod("HEAD")).toBe("transient");
    expect(defaultPolicyForMethod("OPTIONS")).toBe("transient");
  });

  it("12. returns 'off' for POST/PUT/PATCH/DELETE", () => {
    expect(defaultPolicyForMethod("POST")).toBe("off");
    expect(defaultPolicyForMethod("PUT")).toBe("off");
    expect(defaultPolicyForMethod("PATCH")).toBe("off");
    expect(defaultPolicyForMethod("DELETE")).toBe("off");
  });

  it("is case-insensitive", () => {
    expect(defaultPolicyForMethod("get")).toBe("transient");
    expect(defaultPolicyForMethod("post")).toBe("off");
  });
});

describe("getErrorCode", () => {
  it("returns the code found directly on the error", () => {
    const err = Object.assign(new Error("boom"), { code: "ECONNRESET" });
    expect(getErrorCode(err)).toBe("ECONNRESET");
  });

  it("walks a nested cause chain to find the code", () => {
    const err = new TypeError("fetch failed", {
      cause: new Error("wrapped", { cause: { code: "ECONNREFUSED" } }),
    });
    expect(getErrorCode(err)).toBe("ECONNREFUSED");
  });

  it("returns undefined when no code is found anywhere in the chain", () => {
    expect(getErrorCode(new Error("plain"))).toBeUndefined();
    expect(getErrorCode(new TypeError("fetch failed"))).toBeUndefined();
  });

  it("returns undefined for non-object / nullish input", () => {
    expect(getErrorCode("not an object")).toBeUndefined();
    expect(getErrorCode(null)).toBeUndefined();
    expect(getErrorCode(undefined)).toBeUndefined();
  });
});

describe("isConnectError / isTransientNetworkError", () => {
  it("classifies every CONNECT_ERROR_CODES entry as a connect error, not a transient-network error", () => {
    for (const code of CONNECT_ERROR_CODES) {
      const err = new TypeError("fetch failed", { cause: { code } });
      expect(isConnectError(err)).toBe(true);
      expect(isTransientNetworkError(err)).toBe(false);
    }
  });

  it("classifies ECONNRESET/EPIPE/ETIMEDOUT/UND_ERR_SOCKET as transient-network, not connect", () => {
    for (const code of ["ECONNRESET", "EPIPE", "ETIMEDOUT", "UND_ERR_SOCKET"]) {
      const err = new TypeError("fetch failed", { cause: { code } });
      expect(isConnectError(err)).toBe(false);
      expect(isTransientNetworkError(err)).toBe(true);
    }
  });

  it("classifies a generic 'fetch failed' TypeError with no code as transient-network", () => {
    const err = new TypeError("fetch failed");
    expect(isConnectError(err)).toBe(false);
    expect(isTransientNetworkError(err)).toBe(true);
  });

  it("does not classify an unrelated error as connect or transient-network", () => {
    const err = new Error("Something else broke");
    expect(isConnectError(err)).toBe(false);
    expect(isTransientNetworkError(err)).toBe(false);
  });
});
