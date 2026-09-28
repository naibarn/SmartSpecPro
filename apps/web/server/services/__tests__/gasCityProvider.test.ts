import { describe, expect, it, vi } from "vitest";
import {
  GasCityProviderRegistry,
  GasCityProviderError,
  type GasCityProviderManifest,
} from "../gasCityProvider";

const manifest: GasCityProviderManifest = {
  providerId: "gascity-local",
  gasCityVersion: "0.1.0",
  beadsVersion: "0.2.0",
  store: { kind: "file", version: "certified-file-v1" },
  license: { approved: true, evidenceRef: "license-evidence-1" },
  executable: { path: "/opt/gascity/bin/gascity", sha256: "a".repeat(64) },
};

describe("gasCityProvider", () => {
  it("requires a pinned manifest and isolates workspace/store endpoints", () => {
    const registry = new GasCityProviderRegistry();
    registry.register(manifest);
    expect(registry.readiness("gascity-local")).toMatchObject({
      status: "ready",
    });
    expect(
      registry.buildSessionConfig({
        providerId: "gascity-local",
        tenantId: "tenant-1",
        workspaceId: "ws-1",
      })
    ).toMatchObject({
      workspaceId: "ws-1",
      storeEndpoint: expect.stringContaining("tenant-1/ws-1"),
    });
  });

  it("blocks missing license/version and never shells out from the registry", () => {
    const registry = new GasCityProviderRegistry();
    expect(registry.readiness("missing")).toMatchObject({ status: "missing" });
    expect(() =>
      registry.register({
        ...manifest,
        license: { approved: false, evidenceRef: null },
      })
    ).toThrowError(new GasCityProviderError("LICENSE_UNVERIFIED"));
    expect(
      registry.backupRestore({
        providerId: "missing",
        backupRef: "b1",
        restore: vi.fn(),
      })
    ).toMatchObject({ status: "blocked" });
  });
});
