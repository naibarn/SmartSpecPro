import { describe, expect, it } from "vitest";

import { resolvePlatformRuntimeCapabilities } from "../platformRuntimeCapabilities";

const canonicalPlatform = {
  linuxServiceValidated: true,
  databaseValidated: true,
  authValidated: true,
  auditValidated: true,
  workerJobsOutboxValidated: true,
};

describe("resolvePlatformRuntimeCapabilities", () => {
  it("resolves trusted Linux tunnel mode", () => {
    expect(resolvePlatformRuntimeCapabilities({
      configuredIngressMode: "linux-platform",
      canonicalPlatform,
    })).toMatchObject({
      status: "available",
      ingressMode: "linux-platform",
      canonicalControlPlane: {
        owner: "linux-platform",
        database: true,
        authentication: true,
        audit: true,
        workerJobsOutbox: true,
      },
      capabilities: { directLinuxIngress: true, cloudflareIngress: false },
    });
  });

  it("resolves Cloudflare ingress only with validated bindings", () => {
    expect(resolvePlatformRuntimeCapabilities({
      configuredIngressMode: "cloudflare-ingress",
      canonicalPlatform,
      cloudflareIngress: {
        workerBindingValidated: true,
        privateOriginValidated: true,
        edgeAttestationValidated: true,
      },
    })).toMatchObject({
      status: "available",
      ingressMode: "cloudflare-ingress",
      canonicalControlPlane: { owner: "linux-platform" },
      capabilities: { directLinuxIngress: false, cloudflareIngress: true },
    });
  });

  it("rejects missing or conflicting runtime configuration", () => {
    expect(resolvePlatformRuntimeCapabilities({
      configuredIngressMode: "cloudflare-ingress",
      canonicalPlatform,
    })).toEqual({ status: "unavailable", reason: "MISSING_CONFIGURATION" });

    expect(resolvePlatformRuntimeCapabilities({
      configuredIngressMode: "linux-platform",
      canonicalPlatform,
      cloudflareIngress: {
        workerBindingValidated: true,
        privateOriginValidated: true,
        edgeAttestationValidated: true,
      },
    })).toEqual({ status: "unavailable", reason: "CONFLICTING_CONFIGURATION" });
  });

  it("ignores incoming host and user agent for mode", () => {
    const result = resolvePlatformRuntimeCapabilities({
      configuredIngressMode: "linux-platform",
      canonicalPlatform,
      requestMetadata: {
        host: "worker.example.invalid",
        origin: "https://worker.example.invalid",
        userAgent: "Cloudflare-Workers",
      },
    });

    expect(result).toMatchObject({ status: "available", ingressMode: "linux-platform" });
  });

  it("does not advertise Cloudflare as canonical DB auth or outbox owner", () => {
    const result = resolvePlatformRuntimeCapabilities({
      configuredIngressMode: "cloudflare-ingress",
      canonicalPlatform,
      cloudflareIngress: {
        workerBindingValidated: true,
        privateOriginValidated: true,
        edgeAttestationValidated: true,
      },
    });

    expect(result).toMatchObject({
      status: "available",
      canonicalControlPlane: {
        owner: "linux-platform",
        database: true,
        authentication: true,
        workerJobsOutbox: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("cloudflare-owner");
  });

  it("does not expose secrets in the capability projection", () => {
    const result = resolvePlatformRuntimeCapabilities({
      configuredIngressMode: "cloudflare-ingress",
      canonicalPlatform,
      cloudflareIngress: {
        workerBindingValidated: true,
        privateOriginValidated: true,
        edgeAttestationValidated: true,
        edgeToken: "secret-edge-token",
        privateOrigin: "https://private.example.invalid",
      },
    });

    expect(JSON.stringify(result)).not.toContain("secret-edge-token");
    expect(JSON.stringify(result)).not.toContain("private.example.invalid");
  });
});
