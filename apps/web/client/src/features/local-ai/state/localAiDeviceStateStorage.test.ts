/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  LOCAL_AI_DEVICE_STATE_UPDATED_EVENT,
  buildLocalAiDeviceStateStorageKey,
  clearLocalAiDeviceState,
  readLocalAiDeviceState,
  writeLocalAiDeviceState,
} from "./localAiDeviceStateStorage";

const scope = {
  tenantId: "tenant-1",
  userId: "user-1",
  runtimeNamespace: "web" as const,
};

describe("localAiDeviceStateStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("builds tenant+user scoped keys", () => {
    expect(buildLocalAiDeviceStateStorageKey(scope)).toContain("tenant-1");
    expect(buildLocalAiDeviceStateStorageKey(scope)).toContain("user-1");
  });

  it("writes and reads scoped state", () => {
    writeLocalAiDeviceState(scope, {
      allowDownloads: true,
      consentedModelIds: ["gemma4-e2b-web-fast"],
      externalTextBackend: {
        enabled: true,
        baseUrl: "http://localhost:8000",
        apiKey: "local-dev-token",
        model: "HauhauCS/Gemma-4-E2B-Test",
        requestTimeoutMs: 45000,
      },
    });

    expect(readLocalAiDeviceState(scope)).toMatchObject({
      allowDownloads: true,
      localEnginePreference: "auto",
      consentedModelIds: ["gemma4-e2b-web-fast"],
      externalTextBackend: {
        enabled: true,
        baseUrl: "http://localhost:8000",
        apiKey: "local-dev-token",
        model: "HauhauCS/Gemma-4-E2B-Test",
        requestTimeoutMs: 45000,
      },
    });
  });

  it("clears scoped state", () => {
    writeLocalAiDeviceState(scope, {
      allowDownloads: true,
    });

    clearLocalAiDeviceState(scope);

    expect(readLocalAiDeviceState(scope).allowDownloads).toBe(false);
  });

  it("dispatches an update event when scoped state changes", async () => {
    const eventPromise = new Promise<CustomEvent>((resolve) => {
      window.addEventListener(
        LOCAL_AI_DEVICE_STATE_UPDATED_EVENT,
        ((event: Event) => resolve(event as CustomEvent)) as EventListener,
        { once: true },
      );
    });

    writeLocalAiDeviceState(scope, {
      allowDownloads: true,
    });

    const event = await eventPromise;
    expect(event.detail).toMatchObject({
      scope,
      key: buildLocalAiDeviceStateStorageKey(scope),
    });
  });

  it("normalizes invalid local engine preference values back to auto", () => {
    window.localStorage.setItem(
      buildLocalAiDeviceStateStorageKey(scope),
      JSON.stringify({
        localEnginePreference: "unexpected",
      }),
    );

    expect(readLocalAiDeviceState(scope).localEnginePreference).toBe("auto");
  });
});
