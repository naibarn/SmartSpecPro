import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { ENV } from "../_core/env";
import { storagePut, storagePutIfAbsent, storageReadBuffer } from "../storage";

const RUNTIME_TOKEN_TTL_SECONDS = 4 * 60 * 60;
const MAX_STORAGE_VALUE_BYTES = 64 * 1024;
const MAX_MIGRATION_BYTES = 1024 * 1024;
const APP_ID_PATTERN = /^app_[A-Za-z0-9_-]{1,120}$/;
const TENANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const STORAGE_KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;

export type MiniAppRuntimeScope = {
  appId: string;
  tenantId: string;
  userId: number;
};

type RuntimeClaims = MiniAppRuntimeScope & { v: 1; purpose: "storage" | "ready"; exp: number };
export type MiniAppRuntimeEntry = { key: string; value: unknown };

function secret(): string {
  if (ENV.cookieSecret.length < 32) throw new Error("MINI_APP_RUNTIME_SIGNING_KEY_UNAVAILABLE");
  return ENV.cookieSecret;
}

function signClaims(claims: RuntimeClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function parseClaims(token: string, purpose: RuntimeClaims["purpose"], nowSeconds = Math.floor(Date.now() / 1000)): RuntimeClaims | null {
  if (typeof token !== "string" || token.length > 2_048) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  let expected: Buffer;
  try { expected = createHmac("sha256", secret()).update(payload).digest(); }
  catch { return null; }
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); }
  catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RuntimeClaims;
    if (claims.v !== 1 || claims.purpose !== purpose || !APP_ID_PATTERN.test(claims.appId) ||
      !TENANT_ID_PATTERN.test(claims.tenantId) || !Number.isSafeInteger(claims.userId) || claims.userId <= 0 ||
      !Number.isSafeInteger(claims.exp) || claims.exp <= nowSeconds) return null;
    return claims;
  } catch { return null; }
}

function createClaims(scope: MiniAppRuntimeScope, purpose: RuntimeClaims["purpose"], ttlSeconds: number): string {
  if (!APP_ID_PATTERN.test(scope.appId) || !TENANT_ID_PATTERN.test(scope.tenantId) ||
    !Number.isSafeInteger(scope.userId) || scope.userId <= 0) throw new Error("MINI_APP_RUNTIME_SCOPE_INVALID");
  return signClaims({ v: 1, purpose, ...scope, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
}

export function createMiniAppRuntimeStorageToken(scope: MiniAppRuntimeScope): string {
  return createClaims(scope, "storage", RUNTIME_TOKEN_TTL_SECONDS);
}

export function createMiniAppRuntimeReadyMarker(scope: MiniAppRuntimeScope): string {
  return createClaims(scope, "ready", 365 * 24 * 60 * 60);
}

export function verifyMiniAppRuntimeStorageToken(token: string, expected: MiniAppRuntimeScope): boolean {
  const claims = parseClaims(token, "storage");
  return Boolean(claims && claims.appId === expected.appId && claims.tenantId === expected.tenantId && claims.userId === expected.userId);
}

export function resolveMiniAppRuntimeStorageScope(token: string, appId: string): MiniAppRuntimeScope | null {
  const claims = parseClaims(token, "storage");
  if (!claims || claims.appId !== appId) return null;
  return { appId: claims.appId, tenantId: claims.tenantId, userId: claims.userId };
}

export function verifyMiniAppRuntimeReadyMarker(token: string, expected: MiniAppRuntimeScope): boolean {
  const claims = parseClaims(token, "ready");
  return Boolean(claims && claims.appId === expected.appId && claims.tenantId === expected.tenantId && claims.userId === expected.userId);
}

export function parseMiniAppRuntimeEntries(value: unknown): MiniAppRuntimeEntry[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("MINI_APP_RUNTIME_MIGRATION_INVALID");
  let totalBytes = 0;
  return value.map(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("MINI_APP_RUNTIME_MIGRATION_INVALID");
    const { key, value: storedValue } = entry as Record<string, unknown>;
    if (typeof key !== "string" || !STORAGE_KEY_PATTERN.test(key)) throw new Error("MINI_APP_RUNTIME_KEY_INVALID");
    const encoded = JSON.stringify(storedValue);
    if (encoded === undefined) throw new Error("MINI_APP_RUNTIME_VALUE_INVALID");
    const bytes = Buffer.byteLength(encoded, "utf8");
    if (bytes > MAX_STORAGE_VALUE_BYTES) throw new Error("MINI_APP_RUNTIME_VALUE_TOO_LARGE");
    totalBytes += bytes;
    if (totalBytes > MAX_MIGRATION_BYTES) throw new Error("MINI_APP_RUNTIME_MIGRATION_TOO_LARGE");
    return { key, value: storedValue };
  });
}

function storageObjectKey(scope: MiniAppRuntimeScope, key: string): string {
  const keyHash = createHash("sha256").update(key).digest("hex");
  return `mini-app-runtime-data/${scope.tenantId}/${scope.appId}/${keyHash}.json`;
}

export async function readMiniAppRuntimeValue(scope: MiniAppRuntimeScope, key: string): Promise<unknown> {
  if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("MINI_APP_RUNTIME_KEY_INVALID");
  const bytes = await storageReadBuffer(storageObjectKey(scope, key));
  if (!bytes) return null;
  if (bytes.byteLength > MAX_STORAGE_VALUE_BYTES + 512) throw new Error("MINI_APP_RUNTIME_VALUE_INVALID");
  const record = JSON.parse(bytes.toString("utf8")) as { key?: unknown; value?: unknown };
  if (record.key !== key || !Object.prototype.hasOwnProperty.call(record, "value")) throw new Error("MINI_APP_RUNTIME_VALUE_INVALID");
  return record.value;
}

function readStoredValue(bytes: Buffer, expectedKey: string): unknown {
  if (bytes.byteLength > MAX_STORAGE_VALUE_BYTES + 512) throw new Error("MINI_APP_RUNTIME_VALUE_INVALID");
  const record = JSON.parse(bytes.toString("utf8")) as { key?: unknown; value?: unknown };
  if (record.key !== expectedKey || !Object.prototype.hasOwnProperty.call(record, "value")) throw new Error("MINI_APP_RUNTIME_VALUE_INVALID");
  parseMiniAppRuntimeEntries([{ key: expectedKey, value: record.value }]);
  return record.value;
}

export async function writeMiniAppRuntimeValue(scope: MiniAppRuntimeScope, entry: MiniAppRuntimeEntry): Promise<void> {
  const [validated] = parseMiniAppRuntimeEntries([entry]);
  const bytes = Buffer.from(JSON.stringify({ key: validated!.key, value: validated!.value }), "utf8");
  await storagePut(storageObjectKey(scope, validated!.key), bytes, "application/json; charset=utf-8");
}

/** Import legacy host-localStorage values without deleting them or overwriting values already saved by the runtime. */
export async function migrateMiniAppRuntimeValues(scope: MiniAppRuntimeScope, entries: MiniAppRuntimeEntry[]): Promise<{ imported: number; preserved: number; verified: number }> {
  const validated = parseMiniAppRuntimeEntries(entries);
  let imported = 0;
  let preserved = 0;
  let verified = 0;
  for (const entry of validated) {
    const key = storageObjectKey(scope, entry.key);
    const prior = await storageReadBuffer(key);
    if (prior) {
      readStoredValue(prior, entry.key);
      preserved += 1;
      verified += 1;
      continue;
    }
    const bytes = Buffer.from(JSON.stringify(entry), "utf8");
    let created = false;
    try {
      const result = await storagePutIfAbsent(key, bytes, "application/json; charset=utf-8");
      created = result.created;
    } catch (error) {
      // A concurrent runtime write wins over the legacy import. The browser
      // keeps its old localStorage copy, so a failed conditional write is safe
      // only when the runtime value now exists.
      if (await storageReadBuffer(key)) created = false;
      else throw error;
    }
    const after = await storageReadBuffer(key);
    if (!after) throw new Error("MINI_APP_RUNTIME_MIGRATION_VERIFY_FAILED");
    const storedValue = readStoredValue(after, entry.key);
    if (created) {
      if (JSON.stringify(storedValue) !== JSON.stringify(entry.value)) throw new Error("MINI_APP_RUNTIME_MIGRATION_VERIFY_FAILED");
      imported += 1;
    } else {
      // A concurrent write is authoritative. It must be a readable value;
      // keep the browser copy so the owner can still recover a mismatch.
      preserved += 1;
    }
    verified += 1;
  }
  return { imported, preserved, verified };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!);
}

/**
 * Build a full-document response for the opaque-origin runtime. Generated
 * code runs in a top-level CSP sandbox and can reach only its signed,
 * app-scoped data endpoint. The saved content-addressed artifact is unchanged.
 */
export function buildMiniAppRuntimeDocument(input: {
  html: string;
  appId: string;
  statusUrl: string;
  storageToken: string;
  storageApiOrigin: string;
}): { html: string; contentSecurityPolicy: string } {
  const origin = new URL(input.storageApiOrigin);
  if (origin.protocol !== "https:" && origin.hostname !== "localhost") throw new Error("MINI_APP_RUNTIME_ORIGIN_INVALID");
  if (!APP_ID_PATTERN.test(input.appId) || !input.statusUrl.startsWith(`/miniapp/${input.appId}/status`)) throw new Error("MINI_APP_RUNTIME_ROUTE_INVALID");
  const apiOrigin = origin.origin;
  const csp = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; connect-src ${apiOrigin}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-scripts allow-forms allow-top-navigation-by-user-activation`;
  const metaCsp = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; connect-src ${apiOrigin}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const runtimeScript = `(()=>{const endpoint=${JSON.stringify(`${apiOrigin}/_miniapp-runtime/${input.appId}/storage`)};const token=${JSON.stringify(input.storageToken)};addEventListener('message',async e=>{const m=e.data;if(!m||m.channel!=='smartaihub-miniapp-storage-v1'||!['GET','SET'].includes(m.action)||typeof m.requestId!=='string'||typeof m.key!=='string')return;try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action:m.action,key:m.key,...(m.action==='SET'?{value:m.value}:{})})});const d=await r.json();if(!r.ok)throw new Error(typeof d.error==='string'?d.error:'storage unavailable');postMessage({channel:'smartaihub-miniapp-storage-result-v1',requestId:m.requestId,value:d.value},'*')}catch{postMessage({channel:'smartaihub-miniapp-storage-result-v1',requestId:m.requestId,error:'storage unavailable'},'*')}})})();`;
  const navigation = `<header><a href="${escapeHtml(input.statusUrl)}" target="_top">← Back to Development</a></header>`;
  const cspMeta = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*("[^>]*>)/i;
  let html = input.html.replace(cspMeta, `$1${metaCsp}$2`);
  if (html === input.html) throw new Error("MINI_APP_RUNTIME_ARTIFACT_CSP_MISSING");
  const injected = `${navigation}<script>${runtimeScript}</script>`;
  if (/<\/body\s*>/i.test(html)) html = html.replace(/<\/body\s*>/i, `${injected}</body>`);
  else html += injected;
  return { html, contentSecurityPolicy: csp };
}
