import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { httpImageProvisionPlanDigest } from "./cloudflareHttpImageProvisionContract";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
import { publishHttpImage, createHttpImageRegistryTransport, httpImageLocalTag, type HttpImageBuild } from "./cloudflareHttpImagePublication";
export function fixture() {
  const plan = { namespace: nativeProvisionNamespace("tenant-test", "project-test"), runtime: "node-http" as const,
    sourceSha: "a".repeat(40), buildId: "a".repeat(40) + "-11111111-1111-4111-8111-111111111111",
    configurationExpiresAt: new Date(Date.now() + 3000_000).toISOString(), buildBudgetSeconds: 180 as const,
    maxImageBytes: 1073741824 as const, maxPublishedImages: 1 as const };
  const grant = { schemaVersion: "cloudflare.staging-http-image-provision-grant.v1" as const,
    grantRef: "22222222-2222-4222-8222-222222222222", jobId: "33333333-3333-4333-8333-333333333333",
    tenantId: "tenant-test", projectId: "project-test", requesterUserId: 1, executorId: "cf-staging-executor:test",
    accountRef: "b".repeat(32), targetId: "smartspec-cloudflare-staging" as const, environment: "staging" as const,
    actions: ["provision"] as ["provision"], revokedAt: null, expiresAt: plan.configurationExpiresAt,
    plan, planDigest: httpImageProvisionPlanDigest(plan) };
  const built: HttpImageBuild = { schemaVersion: "cloudflare-http-image-build-v1", runtime: plan.runtime,
    sourceSha: plan.sourceSha, packagerSourceSha: plan.sourceSha, jobId: grant.jobId, planDigest: grant.planDigest,
    imageId: "sha256:" + "e".repeat(64), configDigest: "sha256:" + "c".repeat(64), manifestDigest: "sha256:" + "e".repeat(64), imageBytes: 700_000_000, layers: 11, platform: "linux/amd64",
    canonicalArtifactDigest: "sha256:" + "d".repeat(64), localTag: httpImageLocalTag(grant), providerMutations: 0, containerStarts: 0 };
  const observed = { manifestDigest: "sha256:" + "e".repeat(64), configDigest: built.configDigest };
  const credential = { account_id: grant.accountRef, registry_host: "registry.cloudflare.com", username: "fixture", password: "private-fixture" };
  const states: any[] = [];
  const ports = { assertAuthorized: vi.fn(async () => undefined), build: vi.fn(async () => built),
    saveCheckpoint: vi.fn(async (value: any) => { states.push(structuredClone(value)); }),
    registryCredential: vi.fn(async () => credential), readManifest: vi.fn(async () => null as typeof observed | null),
    push: vi.fn(async () => { ports.readManifest.mockResolvedValue(observed); }) };
  return { grant, built, observed, credential, states, ports };
}
describe("bounded canonical HTTP image publication", () => {
  it("persists intent before one push and returns remote digest without app activation", async () => {
    const f = fixture();
    f.ports.push.mockImplementation(async () => {
      expect(f.states.map(s => s.phase)).toEqual(["built", "push-pending"]);
      f.ports.readManifest.mockResolvedValue(f.observed);
    });
    const result = await publishHttpImage({ grant: f.grant, checkpoint: null, readOnly: false, ports: f.ports });
    expect(f.ports.push).toHaveBeenCalledTimes(1);
    expect(result.image).toBe(`registry.cloudflare.com/${f.grant.accountRef}/${f.grant.plan.namespace}-node-http@${f.observed.manifestDigest}`);
    expect(result).toMatchObject({ applicationCreated: false, containerStarts: 0, activation: "disabled", registryVerified: true });
    expect(JSON.stringify(result)).not.toContain("private-fixture");
  });
  it.each(["sourceSha", "packagerSourceSha", "planDigest", "jobId", "localTag"])("rejects mismatched build %s before registry access", async field => {
    const f = fixture(); f.ports.build.mockResolvedValue({ ...f.built, [field]: field === "jobId" ? f.grant.grantRef : "f".repeat(field.includes("Sha") ? 40 : 64) });
    await expect(publishHttpImage({ grant: f.grant, checkpoint: null, readOnly: false, ports: f.ports })).rejects.toThrow();
    expect(f.ports.registryCredential).not.toHaveBeenCalled(); expect(f.ports.push).not.toHaveBeenCalled();
  });
  it("refuses matching preexisting tags without this job's intent", async () => {
    const f = fixture(); f.ports.readManifest.mockResolvedValue(f.observed);
    await expect(publishHttpImage({ grant: f.grant, checkpoint: null, readOnly: false, ports: f.ports })).rejects.toThrow("TAG_ALREADY_EXISTS");
    expect(f.ports.push).not.toHaveBeenCalled();
  });
  it("reconciles an uncertain push read-only, without rebuilding or republishing", async () => {
    const f = fixture(); f.ports.push.mockRejectedValue(Error("response lost"));
    await expect(publishHttpImage({ grant: f.grant, checkpoint: null, readOnly: false, ports: f.ports })).rejects.toThrow("response lost");
    const checkpoint = f.states.at(-1); expect(checkpoint.phase).toBe("push-pending");
    for (const manifest of [null, { ...f.observed, configDigest: "sha256:" + "f".repeat(64) }]) {
      f.ports.readManifest.mockResolvedValue(manifest);
      await expect(publishHttpImage({ grant: f.grant, checkpoint, readOnly: true, ports: f.ports })).rejects.toThrow("PUBLICATION_UNCONFIRMED");
    }
    f.ports.readManifest.mockResolvedValue(f.observed);
    await expect(publishHttpImage({ grant: f.grant, checkpoint, readOnly: true, ports: f.ports })).resolves.toMatchObject({ registryVerified: true });
    expect(f.ports.registryCredential).toHaveBeenLastCalledWith(f.grant, false);
    expect(f.ports.build).toHaveBeenCalledTimes(1); expect(f.ports.push).toHaveBeenCalledTimes(1);
  });
  it("stops revoked intent before push and refuses foreign credentials/checkpoints", async () => {
    const f = fixture();
    f.ports.saveCheckpoint.mockImplementation(async value => {
      if (value.phase === "push-pending") f.ports.assertAuthorized.mockRejectedValue(Error("revoked"));
    });
    await expect(publishHttpImage({ grant: f.grant, checkpoint: null, readOnly: false, ports: f.ports })).rejects.toThrow("revoked");
    expect(f.ports.push).not.toHaveBeenCalled();
    const foreign = fixture(); foreign.ports.registryCredential.mockResolvedValue({ ...foreign.credential, account_id: "f".repeat(32) });
    await expect(publishHttpImage({ grant: foreign.grant, checkpoint: null, readOnly: false, ports: foreign.ports })).rejects.toThrow("REGISTRY_SCOPE_DENIED");
    await expect(publishHttpImage({ grant: foreign.grant, checkpoint: { phase: "built", build: foreign.built, jobId: foreign.grant.grantRef,
      planDigest: foreign.grant.planDigest }, readOnly: true, ports: foreign.ports })).rejects.toThrow("CHECKPOINT_DENIED");
    expect(foreign.ports.push).not.toHaveBeenCalled();
  });
});
describe("fixed Cloudflare registry transport", () => {
  it("uses short-lived permissions and content-hashed remote single manifests", async () => {
    const f = fixture(), body = JSON.stringify({ schemaVersion: 2, mediaType: "application/vnd.oci.image.manifest.v1+json",
      config: { digest: f.built.imageId }, layers: [{ digest: "sha256:" + "f".repeat(64) }] });
    const manifestDigest = "sha256:" + createHash("sha256").update(body).digest("hex");
    const fetchImpl = vi.fn(async (url: any, init: any) => {
      expect(init.redirect).toBe("error");
      if (String(url).startsWith("https://api.cloudflare.com/")) {
        expect(init.headers.Authorization).toBe("Bearer api-fixture");
        expect(JSON.parse(init.body)).toEqual({ expiration_minutes: 5, permissions: ["pull"] });
        return Response.json({ success: true, result: f.credential });
      }
      expect(String(url)).toBe(`https://registry.cloudflare.com/v2/${f.grant.accountRef}/${f.grant.plan.namespace}-node-http/manifests/${f.grant.plan.sourceSha}-${f.grant.jobId}`);
      expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("fixture:private-fixture").toString("base64")}`);
      return new Response(body, { headers: { "docker-content-digest": manifestDigest } });
    });
    const transport = createHttpImageRegistryTransport("api-fixture", f.ports.assertAuthorized, fetchImpl as never);
    await expect(transport.readManifest(f.grant, await transport.registryCredential(f.grant, false))).resolves.toEqual({ manifestDigest, configDigest: f.built.imageId });
  });
  it.each(["wrong-digest", "index", "oversized", "redirect", "forbidden"])("rejects %s rather than reporting an absent image", async mode => {
    const f = fixture(), body = JSON.stringify({ schemaVersion: 2, mediaType: mode === "index" ? "application/vnd.oci.image.index.v1+json" : "application/vnd.oci.image.manifest.v1+json",
      config: { digest: f.built.imageId }, layers: [{}] });
    const bytes = mode === "oversized" ? "x".repeat(262_145) : body;
    const fetchImpl = vi.fn(async () => new Response(bytes, { status: mode === "redirect" ? 302 : mode === "forbidden" ? 403 : 200,
      headers: { "docker-content-digest": mode === "wrong-digest" ? f.built.imageId : "sha256:" + createHash("sha256").update(bytes).digest("hex") } }));
    await expect(createHttpImageRegistryTransport("fixture", f.ports.assertAuthorized, fetchImpl as never).readManifest(f.grant, f.credential)).rejects.toThrow("HTTP_IMAGE");
  });
});
