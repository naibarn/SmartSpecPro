import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_BOOTSTRAP_TIMEOUT_MS,
  fetchWithTimeout,
} from "../authBootstrap";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aborts a bootstrap request that exceeds the timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, init) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      });

    const request = fetchWithTimeout("/trpc/auth.me");
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(AUTH_BOOTSTRAP_TIMEOUT_MS);

    await rejection;
    expect(fetchMock).toHaveBeenCalledWith(
      "/trpc/auth.me",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("clears the timeout after a successful response", async () => {
    vi.useFakeTimers();
    const controllerSignals: AbortSignal[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      controllerSignals.push(init?.signal as AbortSignal);
      return Promise.resolve({ ok: true } as Response);
    });

    await expect(fetchWithTimeout("/api/tenant/current")).resolves.toMatchObject({
      ok: true,
    });
    await vi.advanceTimersByTimeAsync(AUTH_BOOTSTRAP_TIMEOUT_MS);

    expect(controllerSignals[0]?.aborted).toBe(false);
  });
});
