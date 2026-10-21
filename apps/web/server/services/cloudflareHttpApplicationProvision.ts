import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleDB } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { encrypt, decrypt } from "./crypto";
import { validateHttpApplicationSettings, httpApplicationWorkerMetadata, type HttpApplicationSettings } from "./cloudflareHttpApplicationBindings";

type Scope = { tenantId: string; projectId: string; accountRef: string; actorUserId: number };
type Checkpoint = Scope & { runtime: "node" | "python"; namespaceId: string; name: string;
  operationRef: string; pending: boolean; applicationId?: string };
const CATEGORY = "cloudflare_http_application_credentials";
export function httpApplicationCredentialRef(scope: Pick<Scope, "tenantId" | "projectId">) {
  return `cloudflare:http-application:${encodeURIComponent(scope.tenantId)}:${encodeURIComponent(scope.projectId)}:staging`;
}
class HttpApplicationProvisionError extends Error {
  readonly diagnosticCode: string;
  constructor(code: string) {
    const diagnosticCode = `CLOUDFLARE_HTTP_APPLICATION_${code}`;
    super(diagnosticCode);
    this.diagnosticCode = diagnosticCode;
  }
}
function fail(code: string): never { throw new HttpApplicationProvisionError(code); }
const key = (value: string) => createHash("sha256").update(value).digest("hex");

/** Separate encrypted setup purpose. This does not change provider IAM or
 * turn a Worker deployment token into a Containers provisioning token. */
export async function saveHttpApplicationCredential(db: DrizzleDB, scope: Scope, token: string) {
  if (!/^[a-f0-9]{32}$/.test(scope.accountRef) || !Number.isSafeInteger(scope.actorUserId) || scope.actorUserId <= 0 || !token) fail("CREDENTIAL_DENIED");
  const ref = httpApplicationCredentialRef(scope), hash = key(ref);
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${ref}))`);
    const where = and(eq(systemSettings.category, CATEGORY), eq(systemSettings.key, hash));
    const rows = await tx.select({ id: systemSettings.id }).from(systemSettings).where(where).limit(2);
    if (rows.length > 1) fail("CREDENTIAL_AMBIGUOUS");
    const value = encrypt(JSON.stringify({ ...scope, credentialRef: ref, token, revokedAt: null }));
    if (rows[0]) await tx.update(systemSettings).set({ value, valueJson: null, isSensitive: true, updatedBy: scope.actorUserId, updatedAt: new Date() }).where(eq(systemSettings.id, rows[0].id));
    else await tx.insert(systemSettings).values({ category: CATEGORY, key: hash, value, isSensitive: true, updatedBy: scope.actorUserId,
      description: "Exact staging private HTTP application preparation; no VM start authority" });
  });
  return { credentialRef: ref, status: "CONFIGURED" as const };
}

type Ports = {
  assertAuthorized(): Promise<void>;
  request(path: string, body?: object, method?: "PATCH"): Promise<any>;
  load(runtime: "node" | "python", namespaceId: string): Promise<Checkpoint | null>;
  save(value: Checkpoint, previous: Checkpoint | null): Promise<void>;
  wait?: () => Promise<void>;
};
/** Image preparation and metadata application creation only. VM execution
 * remains in the private DO controller, with independent start/compute bounds. */
export async function prepareHttpApplicationImages(settings: HttpApplicationSettings, scope: Scope, ports: Pick<Ports, "request" | "assertAuthorized" | "wait">,
  namespacePreparationExpiresAt?: string) {
  const namespaceOnly = namespacePreparationExpiresAt !== undefined;
  validateHttpApplicationSettings(settings, scope, Date.now(), namespaceOnly);
  const expiry = Date.parse(namespacePreparationExpiresAt ?? settings.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) fail("IMAGE_PREPARATION_DENIED");
  const deadline = Math.min(expiry, Date.now() + 120_000);
  for (const runtime of ["node", "python"] as const) {
    let ready = false;
    for (let attempt = 0; attempt < 24 && Date.now() < deadline; attempt++) {
      await ports.assertAuthorized(); validateHttpApplicationSettings(settings, scope, Date.now(), namespaceOnly);
      const result = await ports.request("/image-preparations", { image: settings[runtime].image });
      if (result?.status === "ready" && Date.now() < deadline) { ready = true; break; }
      if (result?.status !== "pending") fail("IMAGE_PREPARATION_DENIED");
      await (ports.wait ?? (() => new Promise(resolve => setTimeout(resolve, 5000))))();
    }
    if (!ready) fail("IMAGE_PREPARATION_TIMEOUT");
  }
}

type ApplicationVersion = { resources?: { bindings?: unknown; script_runtime?: { containers?: unknown } } };
export function assertHttpApplicationVersionMetadata(settings: HttpApplicationSettings, scope: Scope,
  version: ApplicationVersion, namespaceOnly = false) {
  const expected = httpApplicationWorkerMetadata(settings, scope, namespaceOnly);
  const bindings = version.resources?.bindings, containers = version.resources?.script_runtime?.containers;
  if (!Array.isArray(bindings) || !Array.isArray(containers)) fail("VERSION_METADATA_DENIED");
  for (const item of expected.containers) {
    const actual = containers.filter(value => value?.class_name === item.class_name);
    if (actual.length !== 1 || actual[0].name !== item.name || JSON.stringify(actual[0].images) !== JSON.stringify(item.images)) fail("VERSION_METADATA_DENIED");
  }
  if (namespaceOnly && bindings.some(value => value?.name === "NODE_HTTP" || value?.name === "PYTHON_HTTP")) fail("NAMESPACE_PREPARATION_BINDING_DENIED");
}

export async function ensureHttpApplications(settings: HttpApplicationSettings, scope: Scope,
  version: ApplicationVersion, operationRef: string, ports: Ports) {
  assertHttpApplicationVersionMetadata(settings, scope, version);
  const expected = httpApplicationWorkerMetadata(settings, scope);
  const bindings = version.resources!.bindings as Array<any>;
  if (!/^[a-f0-9]{64}$/.test(operationRef)) fail("OPERATION_SCOPE_DENIED");
  const output: Array<{ runtime: string; name: string; applicationId: string; namespaceId: string }> = [];
  for (const runtime of ["node", "python"] as const) {
    await ports.assertAuthorized(); validateHttpApplicationSettings(settings, scope);
    const expectedBinding = expected.bindings.find(value => value.name === `${runtime.toUpperCase()}_HTTP`)!;
    const matches = bindings.filter(value => value?.name === expectedBinding.name);
    if (matches.length !== 1 || matches[0].type !== "durable_object_namespace" || matches[0].class_name !== expectedBinding.class_name ||
        (matches[0].script_name !== undefined && matches[0].script_name !== "smartspec-cloudflare-staging") ||
        !/^[a-f0-9]{32}$/.test(matches[0].namespace_id)) fail("NAMESPACE_SCOPE_DENIED");
    const namespaceId = matches[0].namespace_id, name = `${settings.namespace}-${runtime}-http`;
    let state = await ports.load(runtime, namespaceId);
    if (state && (state.tenantId !== scope.tenantId || state.projectId !== scope.projectId || state.accountRef !== scope.accountRef ||
        state.actorUserId !== scope.actorUserId || state.namespaceId !== namespaceId || state.runtime !== runtime || state.name !== name)) fail("CHECKPOINT_SCOPE_DENIED");
    if (state?.pending) fail("UNCERTAIN_CREATE_RECONCILIATION_REQUIRED");
    if (!state?.applicationId) {
      const inventory = await ports.request("/applications");
      if (!Array.isArray(inventory) || inventory.length > 1000) fail("INVENTORY_INVALID");
      if (inventory.some(item => item.name === name || item.durable_objects?.namespace_id === namespaceId)) fail("UNOWNED_APPLICATION_COLLISION");
      const pending: Checkpoint = { ...scope, runtime, namespaceId, name, operationRef, pending: true };
      await ports.assertAuthorized(); await ports.save(pending, state);
      const created = await ports.request("/applications", { name, scheduling_policy: "durable_object", durable_objects: { namespace_id: namespaceId },
        ...(settings.startupDiagnostics ? { observability: { logs: { enabled: true } } } : {}) });
      if (!created || typeof created.id !== "string" || !/^[a-f0-9-]{32,36}$/.test(created.id) || created.name !== name ||
          created.scheduling_policy !== "durable_object" || created.durable_objects?.namespace_id !== namespaceId) fail("CREATE_RECEIPT_INVALID");
      state = { ...pending, pending: false, applicationId: created.id };
      await ports.assertAuthorized(); await ports.save(state, pending);
    }
    const readback = await ports.request(`/applications/${state.applicationId}`);
    if (readback?.id !== state.applicationId || readback.name !== name || readback.scheduling_policy !== "durable_object" ||
        readback.durable_objects?.namespace_id !== namespaceId) fail("PROVIDER_READBACK_MISMATCH");
    const logsEnabled = settings.startupDiagnostics === "container-logs";
    if (Boolean(readback.observability?.logs?.enabled) !== logsEnabled) {
      // Only a verified, actor-owned application can change this setting. It
      // updates metadata without creating a placement or granting another start.
      await ports.assertAuthorized(); validateHttpApplicationSettings(settings, scope);
      await ports.request(`/applications/${state.applicationId}`, { observability: { logs: { enabled: logsEnabled } } }, "PATCH");
      const verified = await ports.request(`/applications/${state.applicationId}`);
      if (verified?.id !== state.applicationId || verified.name !== name || verified.scheduling_policy !== "durable_object" ||
          verified.durable_objects?.namespace_id !== namespaceId || verified.observability?.logs?.enabled !== logsEnabled) fail("DIAGNOSTICS_READBACK_MISMATCH");
    }
    output.push({ runtime, name, applicationId: state.applicationId!, namespaceId });
  }
  return { applications: output, containerStarts: 0, publicIngressEnabled: false };
}

/** Each provider request repeats canonical grant/lease checks and current
 * credential resolution. A rotation during preparation stops the operation. */
export function createHttpApplicationProvisionPorts(db: DrizzleDB, scope: Scope, assertAuthorized: () => Promise<void>, fetchImpl = fetch): Ports {
  let fingerprint: string | undefined;
  const where = (runtime: string, namespaceId: string) => and(eq(systemSettings.category, "cloudflare_http_application_runs"),
    eq(systemSettings.key, key(`${scope.tenantId}|${scope.projectId}|${runtime}|${namespaceId}`)));
  const withToken = async <T>(operation: (token: string) => Promise<T>) => {
    await assertAuthorized();
    const ref = httpApplicationCredentialRef(scope);
    const rows = await db.select().from(systemSettings).where(and(eq(systemSettings.category, CATEGORY), eq(systemSettings.key, key(ref)))).limit(2);
    if (rows.length !== 1 || !rows[0].value || !rows[0].isSensitive || rows[0].updatedBy !== scope.actorUserId) fail("CREDENTIAL_DENIED");
    let value: any;
    try { value = JSON.parse(decrypt(rows[0].value!)); } catch { fail("CREDENTIAL_DENIED"); }
    if (value.credentialRef !== ref || value.tenantId !== scope.tenantId || value.projectId !== scope.projectId || value.accountRef !== scope.accountRef ||
        value.actorUserId !== scope.actorUserId || value.revokedAt !== null || !value.token || typeof value.token !== "string") fail("CREDENTIAL_DENIED");
    const actual = key(value.token);
    if (fingerprint && fingerprint !== actual) fail("CREDENTIAL_CHANGED");
    fingerprint = actual;
    return operation(value.token);
  };
  return {
    assertAuthorized,
    async request(path, body, method) {
      if (!(path === "/image-preparations" || path === "/applications" || /^\/applications\/[a-f0-9-]{32,36}$/.test(path)) ||
          body && path !== "/image-preparations" && path !== "/applications" && method !== "PATCH") fail("ENDPOINT_DENIED");
      if (method !== undefined && (method !== "PATCH" || !/^\/applications\/[a-f0-9-]{32,36}$/.test(path) ||
          !body || ![true, false].some(enabled => JSON.stringify(body) === JSON.stringify({ observability: { logs: { enabled } } })))) fail("ENDPOINT_DENIED");
      return withToken(async token => {
        const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${scope.accountRef}/containers${path}`, {
          method: method ?? (body ? "POST" : "GET"), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) { await response.body?.cancel(); fail(`PROVIDER_HTTP_${response.status}`); }
        if (!response.body) fail("PROVIDER_RESPONSE_INVALID");
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
        try { for (;;) { const item = await reader.read(); if (item.done) break; length += item.value.length; if (length > 1048576) fail("PROVIDER_RESPONSE_TOO_LARGE"); chunks.push(item.value); } }
        finally { await reader.cancel().catch(() => undefined); }
        let result: any;
        try { result = JSON.parse(Buffer.concat(chunks).toString()); } catch { fail("PROVIDER_RESPONSE_INVALID"); }
        if (result.success !== true || !result.result) fail("PROVIDER_RESPONSE_INVALID");
        await assertAuthorized(); return result.result;
      });
    },
    async load(runtime, namespaceId) {
      const rows = await db.select().from(systemSettings).where(where(runtime, namespaceId)).limit(2);
      if (!rows.length) return null;
      if (rows.length !== 1 || !rows[0].value || !rows[0].isSensitive || rows[0].updatedBy !== scope.actorUserId) fail("CHECKPOINT_DENIED");
      try { return JSON.parse(decrypt(rows[0].value!)); } catch { return fail("CHECKPOINT_DENIED"); }
    },
    async save(value, previous) {
      await assertAuthorized();
      const id = key(`${scope.tenantId}|${scope.projectId}|${value.runtime}|${value.namespaceId}`);
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
        const rows = await tx.select().from(systemSettings).where(where(value.runtime, value.namespaceId)).limit(2);
        if (rows.length > 1 || rows[0] && (!rows[0].value || !rows[0].isSensitive || rows[0].updatedBy !== scope.actorUserId)) fail("CHECKPOINT_DENIED");
        const current = rows[0] ? JSON.parse(decrypt(rows[0].value!)) : null;
        if (JSON.stringify(current) !== JSON.stringify(previous)) fail("CHECKPOINT_CONCURRENT_CHANGE");
        const encrypted = encrypt(JSON.stringify(value));
        if (rows[0]) await tx.update(systemSettings).set({ value: encrypted, valueJson: null, isSensitive: true, updatedBy: scope.actorUserId, updatedAt: new Date() }).where(eq(systemSettings.id, rows[0].id));
        else await tx.insert(systemSettings).values({ category: "cloudflare_http_application_runs", key: id, value: encrypted, isSensitive: true,
          updatedBy: scope.actorUserId, description: "Canonical paired HTTP application metadata creation intent; no VM start" });
      });
    },
  };
}
