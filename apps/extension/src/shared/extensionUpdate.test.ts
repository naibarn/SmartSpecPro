import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTENSION_UPDATE_CACHE_TTL_MS,
  compareChromeExtensionVersions,
  createNativeExtensionUpdateAvailability,
  isFreshExtensionUpdateCache,
  parseChromeExtensionVersion,
  parseExtensionUpdateCache,
  parseLatestExtensionReleaseResponse,
  parseNativeExtensionUpdateAvailability,
  persistNativeExtensionUpdateAvailability,
  resolveExtensionUpdateNotice,
} from "./extensionUpdate";

const BASE_URL = "https://smartaihub.app";

test("parses and compares Chrome extension versions numerically", () => {
  assert.deepEqual(parseChromeExtensionVersion("0.1.137"), [0, 1, 137]);
  assert.equal(compareChromeExtensionVersions("0.1.136", "0.1.137"), -1);
  assert.equal(compareChromeExtensionVersions("1.2", "1.2.0"), 0);
  assert.equal(compareChromeExtensionVersions("2.0", "1.9999.9999"), 1);
});

test("rejects malformed or out-of-range Chrome extension versions", () => {
  for (const value of ["", "1.2.3.4.5", "1.02", "v1.2", "1.-2", "1.65536", null, 137]) {
    assert.equal(parseChromeExtensionVersion(value), null);
  }
  assert.equal(compareChromeExtensionVersions("bad", "0.1.137"), null);
});

test("parses latest release metadata and enforces same-origin HTTPS downloads", () => {
  const relative = parseLatestExtensionReleaseResponse({
    release: {
      version: "0.1.137",
      downloadUrl: "/api/desktop-releases/companion-extension/download",
      fileName: "smartaihub-companion-extension-0.1.137.zip",
      fileSizeBytes: 1234,
    },
  }, BASE_URL);
  assert.equal(relative?.release?.downloadUrl, `${BASE_URL}/api/desktop-releases/companion-extension/download`);
  assert.equal(relative?.release?.fileSizeBytes, 1234);

  const offOrigin = parseLatestExtensionReleaseResponse({
    release: { version: "0.1.138", downloadUrl: "https://attacker.example/update.zip" },
  }, BASE_URL);
  assert.equal(offOrigin?.release?.downloadUrl, `${BASE_URL}/api/desktop-releases/companion-extension/download`);
  assert.deepEqual(parseLatestExtensionReleaseResponse({ release: null }, BASE_URL), { release: null });
  assert.equal(parseLatestExtensionReleaseResponse({ release: { version: "bad" } }, BASE_URL), null);
  assert.equal(parseLatestExtensionReleaseResponse({ release: null }, "http://smartaihub.app"), null);
});

test("validates origin-scoped cache freshness", () => {
  const now = 1_800_000_000_000;
  const cache = parseExtensionUpdateCache({
    checkedAt: now - 1_000,
    serverOrigin: BASE_URL,
    release: { version: "0.1.137", downloadUrl: "/api/desktop-releases/companion-extension/download" },
  }, BASE_URL);
  assert.ok(cache);
  assert.equal(isFreshExtensionUpdateCache(cache, BASE_URL, now), true);
  assert.equal(isFreshExtensionUpdateCache(cache, "https://tenant.smartaihub.app", now), false);
  assert.equal(isFreshExtensionUpdateCache(cache, BASE_URL, now + EXTENSION_UPDATE_CACHE_TTL_MS + 1), false);
  assert.equal(isFreshExtensionUpdateCache(cache, BASE_URL, now - 1_001), false);
  assert.equal(parseExtensionUpdateCache({ checkedAt: "now", serverOrigin: BASE_URL, release: null }, BASE_URL), null);
});

test("validates native update metadata", () => {
  const availability = createNativeExtensionUpdateAvailability("0.1.137", 1234);
  assert.deepEqual(availability, { version: "0.1.137", detectedAt: 1234 });
  assert.deepEqual(parseNativeExtensionUpdateAvailability(availability), availability);
  assert.equal(createNativeExtensionUpdateAvailability("bad", 1234), null);
  assert.equal(parseNativeExtensionUpdateAvailability({ version: "0.1.137", detectedAt: -1 }), null);
});

test("persists valid native onUpdateAvailable metadata", async () => {
  let stored: Record<string, unknown> | null = null;
  const storage = { set: async (items: Record<string, unknown>) => { stored = items; } };
  assert.equal(await persistNativeExtensionUpdateAvailability(storage, "0.1.137", 1234), true);
  assert.deepEqual(stored, {
    smartaihubNativeUpdateAvailable: { version: "0.1.137", detectedAt: 1234 },
  });
  stored = null;
  assert.equal(await persistNativeExtensionUpdateAvailability(storage, "bad", 1234), false);
  assert.equal(stored, null);
});

test("derives dashboard, dismissal, and native update notices", () => {
  const release = {
    version: "0.1.137",
    downloadUrl: `${BASE_URL}/api/desktop-releases/companion-extension/download`,
  };
  assert.deepEqual(resolveExtensionUpdateNotice({ currentVersion: "0.1.136", release }), {
    kind: "dashboard",
    currentVersion: "0.1.136",
    latestVersion: "0.1.137",
    downloadUrl: release.downloadUrl,
  });
  assert.equal(resolveExtensionUpdateNotice({ currentVersion: "0.1.136", release, dismissedVersion: "0.1.137" }), null);
  assert.equal(resolveExtensionUpdateNotice({ currentVersion: "0.1.137", release }), null);
  assert.equal(resolveExtensionUpdateNotice({ currentVersion: "0.1.138", release }), null);

  const nativeUpdate = createNativeExtensionUpdateAvailability("0.1.138", 1234);
  assert.deepEqual(resolveExtensionUpdateNotice({
    currentVersion: "0.1.136",
    release,
    dismissedVersion: "0.1.137",
    nativeUpdate,
  }), {
    kind: "native",
    currentVersion: "0.1.136",
    latestVersion: "0.1.138",
  });
  assert.equal(resolveExtensionUpdateNotice({
    currentVersion: "0.1.136",
    release,
    dismissedVersion: "0.1.138",
    nativeUpdate,
  }), null);

  assert.deepEqual(resolveExtensionUpdateNotice({
    currentVersion: "0.1.136",
    release: { ...release, version: "0.1.138" },
    dismissedVersion: "0.1.137",
  }), {
    kind: "dashboard",
    currentVersion: "0.1.136",
    latestVersion: "0.1.138",
    downloadUrl: release.downloadUrl,
  });
});
