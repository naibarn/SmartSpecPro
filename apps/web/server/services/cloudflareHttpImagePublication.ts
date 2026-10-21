import { createHash } from "node:crypto";
import { z } from "zod";
import { httpImageProvisionGrantSchema, httpImageRegistryRepository, type HttpImageProvisionGrant } from "./cloudflareHttpImageProvisionContract";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const httpImageBuildSchema = z.object({
  schemaVersion: z.literal("cloudflare-http-image-build-v1"), runtime: z.enum(["node-http", "python-http"]),
  sourceSha: z.string().regex(/^[a-f0-9]{40}$/), packagerSourceSha: z.string().regex(/^[a-f0-9]{40}$/),
  jobId: z.string().uuid(), planDigest: z.string().regex(/^[a-f0-9]{64}$/), imageId: digest, configDigest: digest, manifestDigest: digest,
  imageBytes: z.number().int().positive().max(1_073_741_824), layers: z.number().int().positive().max(40),
  platform: z.literal("linux/amd64"), canonicalArtifactDigest: digest, localTag: z.string(),
  providerMutations: z.literal(0), containerStarts: z.literal(0),
}).strict();
export type HttpImageBuild = z.infer<typeof httpImageBuildSchema>;
export const httpImageCheckpointSchema = z.object({
  planDigest: z.string().regex(/^[a-f0-9]{64}$/), jobId: z.string().uuid(),
  phase: z.enum(["built", "push-pending", "published"]), build: httpImageBuildSchema,
  manifestDigest: digest.optional(),
}).strict();
export type HttpImageCheckpoint = z.infer<typeof httpImageCheckpointSchema>;
export class HttpImageError extends Error {
  constructor(code: string) { super(code); this.name = "CloudflareHttpImageError"; }
}
export function httpImageLocalTag(g: HttpImageProvisionGrant) {
  return `${g.plan.namespace}-${g.plan.runtime}:${g.plan.sourceSha}-${g.jobId}`;
}
export function assertHttpImageBuild(g: HttpImageProvisionGrant, value: unknown): HttpImageBuild {
  const built = httpImageBuildSchema.parse(value);
  if (built.sourceSha !== g.plan.sourceSha || built.packagerSourceSha !== g.plan.sourceSha || built.jobId !== g.jobId ||
      built.planDigest !== g.planDigest || built.runtime !== g.plan.runtime || built.localTag !== httpImageLocalTag(g))
    throw new HttpImageError("HTTP_IMAGE_BUILD_SCOPE_DENIED");
  return built;
}
export type RegistryCredential = { account_id: string; registry_host: string; username: string; password: string };
export type HttpImagePublicationPorts = {
  assertAuthorized(): Promise<void>;
  build(g: HttpImageProvisionGrant): Promise<unknown>;
  saveCheckpoint(value: HttpImageCheckpoint): Promise<void>;
  registryCredential(g: HttpImageProvisionGrant, writable: boolean): Promise<RegistryCredential>;
  readManifest(g: HttpImageProvisionGrant, credential: RegistryCredential): Promise<{ manifestDigest: string; configDigest: string } | null>;
  push(g: HttpImageProvisionGrant, build: HttpImageBuild, credential: RegistryCredential): Promise<void>;
};

/** A durable push intent precedes the only image mutation. A retry can only
 * reconcile that exact job's manifest; it cannot publish again or adopt tags. */
export async function publishHttpImage(input: {
  grant: HttpImageProvisionGrant; checkpoint: unknown; readOnly: boolean; ports: HttpImagePublicationPorts;
}) {
  const g = httpImageProvisionGrantSchema.parse(input.grant), p = input.ports;
  await p.assertAuthorized();
  let state = input.checkpoint ? httpImageCheckpointSchema.parse(input.checkpoint) : null;
  if (state && (state.jobId !== g.jobId || state.planDigest !== g.planDigest)) throw new HttpImageError("HTTP_IMAGE_CHECKPOINT_DENIED");
  if (!state) {
    if (input.readOnly) throw new HttpImageError("HTTP_IMAGE_RECONCILIATION_REQUIRED");
    const build = assertHttpImageBuild(g, await p.build(g));
    await p.assertAuthorized();
    state = { jobId: g.jobId, planDigest: g.planDigest, phase: "built", build };
    await p.saveCheckpoint(state);
  }
  const built = assertHttpImageBuild(g, state.build);
  const writable = !input.readOnly && state.phase === "built";
  await p.assertAuthorized();
  const credential = await p.registryCredential(g, writable);
  if (credential.account_id !== g.accountRef || credential.registry_host !== "registry.cloudflare.com" ||
      !credential.username || !credential.password) throw new HttpImageError("HTTP_IMAGE_REGISTRY_SCOPE_DENIED");
  await p.assertAuthorized();
  const previous = await p.readManifest(g, credential);
  if (state.phase === "built") {
    // Even a matching image at an already occupied job tag is not our receipt.
    if (previous) throw new HttpImageError("HTTP_IMAGE_TAG_ALREADY_EXISTS");
    if (!writable) throw new HttpImageError("HTTP_IMAGE_RECONCILIATION_REQUIRED");
    state = { ...state, phase: "push-pending" };
    await p.assertAuthorized();
    await p.saveCheckpoint(state);
    await p.assertAuthorized();
    await p.push(g, built, credential);
  }
  await p.assertAuthorized();
  const observed = state.phase === "published" || !writable ? previous : await p.readManifest(g, credential);
  if (!observed || observed.configDigest !== built.configDigest || observed.manifestDigest !== built.manifestDigest ||
      (state.manifestDigest !== undefined && state.manifestDigest !== observed.manifestDigest))
    throw new HttpImageError("HTTP_IMAGE_PUBLICATION_UNCONFIRMED");
  state = { ...state, phase: "published", manifestDigest: observed.manifestDigest };
  await p.assertAuthorized();
  await p.saveCheckpoint(state);
  return { schemaVersion: "cloudflare-http-image-receipt-v1", accountRef: g.accountRef, namespace: g.plan.namespace,
    runtime: g.plan.runtime, sourceSha: g.plan.sourceSha, jobId: g.jobId, planDigest: g.planDigest,
    canonicalArtifactDigest: built.canonicalArtifactDigest, image: `${httpImageRegistryRepository(g)}@${observed.manifestDigest}`,
    imageId: built.imageId, configDigest: built.configDigest, imageBytes: built.imageBytes, layers: built.layers, registryVerified: true,
    applicationCreated: false, containerStarts: 0, activation: "disabled" };
}

const MEDIA = ["application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json"];
function decodeProviderJson(bytes: Uint8Array) {
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new HttpImageError("HTTP_IMAGE_RESPONSE_INVALID"); }
}
async function boundedBody(response: Response, maximum: number): Promise<Uint8Array> {
  if (!response.body) throw new HttpImageError("HTTP_IMAGE_RESPONSE_INVALID");
  const reader = response.body.getReader(), parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > maximum) throw new HttpImageError("HTTP_IMAGE_RESPONSE_TOO_LARGE");
      parts.push(item.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(parts);
}

/** Fixed provider endpoints only; no caller URL, redirects, persisted registry
 * password, API token in argv or unbounded response body. */
export function createHttpImageRegistryTransport(token: string, assertAuthorized: () => Promise<void>, fetchImpl = fetch) {
  return {
    async registryCredential(g: HttpImageProvisionGrant, writable: boolean): Promise<RegistryCredential> {
      await assertAuthorized();
      // A short-lived registry JWT must not outlive its exact grant/config scope.
      const minutes = Math.min(5, Math.floor((Math.min(Date.parse(g.expiresAt), Date.parse(g.plan.configurationExpiresAt)) - Date.now()) / 60_000));
      if (minutes < 1) throw new HttpImageError("HTTP_IMAGE_AUTHORITY_EXPIRED");
      const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${g.accountRef}/containers/registries/registry.cloudflare.com/credentials`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expiration_minutes: minutes, permissions: writable ? ["pull", "push"] : ["pull"] }),
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) { await response.body?.cancel(); throw new HttpImageError(`HTTP_IMAGE_REGISTRY_CREDENTIAL_HTTP_${response.status}`); }
      const document = decodeProviderJson(await boundedBody(response, 32_768));
      if (document.success !== true) throw new HttpImageError("HTTP_IMAGE_REGISTRY_CREDENTIAL_DENIED");
      const parsed = z.object({ account_id: z.literal(g.accountRef), registry_host: z.literal("registry.cloudflare.com"),
        username: z.string().min(1).max(4096), password: z.string().min(1).max(16_384) }).safeParse(document.result);
      if (!parsed.success) throw new HttpImageError("HTTP_IMAGE_REGISTRY_SCOPE_DENIED");
      await assertAuthorized();
      return parsed.data;
    },
    async readManifest(g: HttpImageProvisionGrant, credential: RegistryCredential) {
      await assertAuthorized();
      const repository = `${g.accountRef}/${g.plan.namespace}-${g.plan.runtime}`;
      const tag = `${g.plan.sourceSha}-${g.jobId}`;
      const response = await fetchImpl(`https://registry.cloudflare.com/v2/${repository}/manifests/${tag}`, {
        // Cloudflare returns Docker login credentials. The password is not
        // itself an OAuth bearer token; retain the issued username binding.
        headers: { Authorization: `Basic ${Buffer.from(`${credential.username}:${credential.password}`).toString("base64")}`, Accept: MEDIA.join(", ") },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 404) { await response.body?.cancel(); return null; }
      if (!response.ok) { await response.body?.cancel(); throw new HttpImageError(`HTTP_IMAGE_REGISTRY_READ_HTTP_${response.status}`); }
      const bytes = await boundedBody(response, 262_144), hash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      const manifest = decodeProviderJson(bytes);
      if (!MEDIA.includes(manifest.mediaType) || manifest.schemaVersion !== 2 || manifest.manifests !== undefined ||
          !digest.safeParse(manifest.config?.digest).success || !Array.isArray(manifest.layers) || !manifest.layers.length || manifest.layers.length > 40 ||
          response.headers.get("docker-content-digest") !== hash) throw new HttpImageError("HTTP_IMAGE_MANIFEST_INVALID");
      await assertAuthorized();
      return { manifestDigest: hash, configDigest: manifest.config.digest as string };
    },
  };
}
