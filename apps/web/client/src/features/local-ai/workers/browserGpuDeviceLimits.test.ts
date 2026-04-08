import { describe, expect, it, vi } from "vitest";

import {
  buildBestEffortRequiredLimits,
  wrapAdapterRequestDevice,
} from "./browserGpuDeviceLimits";

describe("browserGpuDeviceLimits", () => {
  it("fills missing required limits from adapter limits", () => {
    expect(
      buildBestEffortRequiredLimits(
        {
          limits: {
            maxBufferSize: 2 * 1024 * 1024 * 1024,
            maxStorageBufferBindingSize: 2 * 1024 * 1024 * 1024,
          },
        },
        {},
      ),
    ).toEqual({
      maxBufferSize: 2 * 1024 * 1024 * 1024,
    });
  });

  it("can explicitly include maxStorageBufferBindingSize when needed", () => {
    expect(
      buildBestEffortRequiredLimits(
        {
          limits: {
            maxBufferSize: 2 * 1024 * 1024 * 1024,
            maxStorageBufferBindingSize: 2 * 1024 * 1024 * 1024,
          },
        },
        {},
        {
          includeMaxStorageBufferBindingSize: true,
        },
      ),
    ).toEqual({
      maxBufferSize: 2 * 1024 * 1024 * 1024,
      maxStorageBufferBindingSize: 2 * 1024 * 1024 * 1024,
    });
  });

  it("preserves explicitly provided required limits", () => {
    expect(
      buildBestEffortRequiredLimits(
        {
          limits: {
            maxBufferSize: 2 * 1024 * 1024 * 1024,
            maxStorageBufferBindingSize: 2 * 1024 * 1024 * 1024,
          },
        },
        {
          requiredLimits: {
            maxBufferSize: 512 * 1024 * 1024,
            maxStorageBufferBindingSize: 256 * 1024 * 1024,
          },
        },
      ),
    ).toEqual({
      maxBufferSize: 512 * 1024 * 1024,
      maxStorageBufferBindingSize: 256 * 1024 * 1024,
    });
  });

  it("wraps requestDevice and injects best-effort required limits", async () => {
    const requestDevice = vi.fn().mockResolvedValue({});
    const adapter = wrapAdapterRequestDevice({
      limits: {
        maxBufferSize: 2 * 1024 * 1024 * 1024,
        maxStorageBufferBindingSize: 2 * 1024 * 1024 * 1024,
      },
      requestDevice,
    });

    await adapter?.requestDevice?.();

    expect(requestDevice).toHaveBeenCalledWith({
      requiredLimits: {
        maxBufferSize: 2 * 1024 * 1024 * 1024,
      },
    });
  });

  it("works when applied to an adapter prototype", async () => {
    const requestDevice = vi.fn().mockResolvedValue({});
    const prototype = {
      requestDevice,
    };
    const adapter = Object.create(prototype) as {
      limits: {
        maxBufferSize: number;
        maxStorageBufferBindingSize: number;
      };
      requestDevice: (descriptor?: unknown) => Promise<unknown>;
    };
    adapter.limits = {
      maxBufferSize: 2 * 1024 * 1024 * 1024,
      maxStorageBufferBindingSize: 2 * 1024 * 1024 * 1024,
    };

    wrapAdapterRequestDevice(prototype);

    await adapter.requestDevice();

    expect(requestDevice).toHaveBeenCalledWith({
      requiredLimits: {
        maxBufferSize: 2 * 1024 * 1024 * 1024,
      },
    });
  });
});
