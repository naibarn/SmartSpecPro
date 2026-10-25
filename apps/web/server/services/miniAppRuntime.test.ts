import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storagePut: vi.fn(),
  storagePutIfAbsent: vi.fn(),
  storageReadBuffer: vi.fn(),
}));

vi.mock("../_core/env", () => ({ ENV: { cookieSecret: "mini-app-runtime-unit-test-secret-32-chars" } }));
vi.mock("../storage", () => mocks);

import {
  buildMiniAppRuntimeDocument,
  createMiniAppRuntimeReadyMarker,
  createMiniAppRuntimeStorageToken,
  migrateMiniAppRuntimeValues,
  parseMiniAppRuntimeEntries,
  readMiniAppRuntimeValue,
  resolveMiniAppRuntimeStorageScope,
  verifyMiniAppRuntimeReadyMarker,
  verifyMiniAppRuntimeStorageToken,
  writeMiniAppRuntimeValue,
} from "./miniAppRuntime";

const scope = { appId: "app_expense", tenantId: "tenant-owner", userId: 23 };

describe("Mini-App full-page runtime isolation and storage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes expiring storage capability and ready marker to the exact owner App", () => {
    const storageToken = createMiniAppRuntimeStorageToken(scope);
    const readyMarker = createMiniAppRuntimeReadyMarker(scope);
    expect(verifyMiniAppRuntimeStorageToken(storageToken, scope)).toBe(true);
    expect(verifyMiniAppRuntimeStorageToken(storageToken, { ...scope, appId: "app_other" })).toBe(false);
    expect(resolveMiniAppRuntimeStorageScope(storageToken, scope.appId)).toEqual(scope);
    expect(resolveMiniAppRuntimeStorageScope(storageToken, "app_other")).toBeNull();
    expect(verifyMiniAppRuntimeReadyMarker(readyMarker, scope)).toBe(true);
    expect(verifyMiniAppRuntimeReadyMarker(storageToken, scope)).toBe(false);
  });

  it("serves artifact as a full document under opaque CSP sandbox with only app storage network access", () => {
    const doc = buildMiniAppRuntimeDocument({
      html: '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'none\'"></head><body><main>Expense tracker</main></body></html>',
      appId: scope.appId,
      statusUrl: `/miniapp/${scope.appId}/status`,
      storageToken: createMiniAppRuntimeStorageToken(scope),
      storageApiOrigin: "https://smartaihub.app",
    });
    expect(doc.contentSecurityPolicy).toContain("sandbox allow-scripts allow-forms allow-top-navigation-by-user-activation");
    expect(doc.contentSecurityPolicy).not.toContain("allow-same-origin");
    expect(doc.html).toContain("connect-src https://smartaihub.app");
    expect(doc.html).toContain("Back to Development");
    expect(doc.html).toContain("_miniapp-runtime/app_expense/storage");
    expect(doc.html).toContain("<main>Expense tracker</main>");
    expect(doc.html).not.toContain("<iframe");
  });

  it("keeps migration bounded and does not replace an already saved runtime value", async () => {
    expect(parseMiniAppRuntimeEntries([{ key: "expenses", value: [{ amount: 25 }] }])).toEqual([{ key: "expenses", value: [{ amount: 25 }] }]);
    expect(() => parseMiniAppRuntimeEntries([{ key: "../other-app", value: 1 }])).toThrow("MINI_APP_RUNTIME_KEY_INVALID");
    mocks.storageReadBuffer.mockResolvedValue(Buffer.from('{"key":"expenses","value":[{"amount":99}]}'));
    mocks.storagePutIfAbsent.mockResolvedValue({ key: "ignored", url: "ignored", created: false });
    await expect(migrateMiniAppRuntimeValues(scope, [{ key: "expenses", value: [{ amount: 25 }] }]))
      .resolves.toEqual({ imported: 0, preserved: 1 });
    expect(mocks.storagePutIfAbsent).not.toHaveBeenCalled();
  });

  it("reads and writes one app-scoped JSON value", async () => {
    mocks.storageReadBuffer.mockResolvedValue(Buffer.from('{"key":"expenses","value":[{"amount":25}]}'));
    await expect(readMiniAppRuntimeValue(scope, "expenses")).resolves.toEqual([{ amount: 25 }]);
    mocks.storagePut.mockResolvedValue({ key: "unused", url: "unused" });
    await writeMiniAppRuntimeValue(scope, { key: "expenses", value: [{ amount: 30 }] });
    expect(mocks.storagePut).toHaveBeenCalledWith(
      expect.stringMatching(/^mini-app-runtime-data\/tenant-owner\/app_expense\/[a-f0-9]{64}\.json$/),
      expect.any(Buffer),
      "application/json; charset=utf-8",
    );
  });
});
