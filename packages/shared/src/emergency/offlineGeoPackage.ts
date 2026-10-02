/** Validation boundary for offline geospatial package manifests. Does not download bytes. */
export type OfflineGeoPackageError = "PACKAGE_INVALID" | "PACKAGE_EXPIRED" | "PACKAGE_SIGNATURE_INVALID" | "PACKAGE_RIGHTS_DENIED" | "GOOGLE_TILES_OFFLINE_FORBIDDEN" | "PACKAGE_SIZE_LIMIT" | "PACKAGE_ITEM_LIMIT";
export type OfflineGeoPackageResult = { readonly ok: true; readonly packageRef: string; readonly regionRef: string; readonly revision: number; readonly itemCount: number; readonly totalBytes: number; readonly dataThrough: string }
  | { readonly ok: false; readonly code: OfflineGeoPackageError };

const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/i;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const itemKinds = new Set(["public-alerts", "public-resources", "public-services", "hydrology-summary", "maplibre-basemap", "public-boundaries"]);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const isDate = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && Number.isFinite(Date.parse(v));

/** Signature verification is mandatory and delegated to the configured crypto/key authority. */
export async function validateOfflineGeoPackage(value: unknown, options: {
  readonly now: string;
  readonly verifySignature: (signature: string, signedManifest: unknown) => Promise<boolean>;
  readonly maxBytes?: number;
  readonly maxItems?: number;
}): Promise<OfflineGeoPackageResult> {
  if (!isRecord(value) || Object.keys(value).some(key => !["schemaVersion", "packageRef", "regionRef", "revision", "issuedAt", "expiresAt", "signature", "items"].includes(key)) ||
    value.schemaVersion !== 1 || typeof value.packageRef !== "string" || !REF.test(value.packageRef) || typeof value.regionRef !== "string" || !REF.test(value.regionRef) ||
    !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || !isDate(value.issuedAt) || !isDate(value.expiresAt) || !isDate(options.now) ||
    Date.parse(value.expiresAt as string) <= Date.parse(value.issuedAt as string) || Date.parse(value.issuedAt as string) > Date.parse(options.now) + 5 * 60_000 ||
    Date.parse(value.expiresAt as string) - Date.parse(value.issuedAt as string) > 31 * 24 * 60 * 60_000 ||
    typeof value.signature !== "string" || value.signature.length < 16 || value.signature.length > 4096 || !Array.isArray(value.items)) return { ok: false, code: "PACKAGE_INVALID" };
  const maxItems = options.maxItems ?? 100;
  const maxBytes = options.maxBytes ?? 250 * 1024 * 1024;
  if (Date.parse(value.expiresAt as string) <= Date.parse(options.now)) return { ok: false, code: "PACKAGE_EXPIRED" };
  if (value.items.length > maxItems) return { ok: false, code: "PACKAGE_ITEM_LIMIT" };
  let totalBytes = 0;
  let dataThrough = "1970-01-01T00:00:00Z";
  for (const item of value.items) {
    if (!isRecord(item) || Object.keys(item).some(key => !["itemRef", "kind", "providerRef", "licenseRef", "attribution", "offlineAllowed", "bytes", "sha256", "dataThrough"].includes(key)) ||
      typeof item.itemRef !== "string" || !REF.test(item.itemRef) || typeof item.kind !== "string" || typeof item.providerRef !== "string" || !REF.test(item.providerRef) ||
      typeof item.licenseRef !== "string" || item.licenseRef.length > 2048 || !/^https:\/\//i.test(item.licenseRef) || typeof item.attribution !== "string" || !item.attribution.trim() || item.attribution.length > 512 ||
      typeof item.bytes !== "number" || !Number.isSafeInteger(item.bytes) || item.bytes <= 0 || typeof item.sha256 !== "string" || !HASH.test(item.sha256) || !isDate(item.dataThrough)) return { ok: false, code: "PACKAGE_INVALID" };
    if (item.kind === "google-map-tiles" || item.providerRef.toLowerCase().includes("google")) return { ok: false, code: "GOOGLE_TILES_OFFLINE_FORBIDDEN" };
    if (!itemKinds.has(item.kind) || item.offlineAllowed !== true) return { ok: false, code: "PACKAGE_RIGHTS_DENIED" };
    totalBytes += item.bytes;
    if (totalBytes > maxBytes) return { ok: false, code: "PACKAGE_SIZE_LIMIT" };
    if (Date.parse(item.dataThrough) > Date.parse(dataThrough)) dataThrough = item.dataThrough;
  }
  let signatureValid = false;
  try { signatureValid = await options.verifySignature(value.signature, value); } catch { signatureValid = false; }
  if (!signatureValid) return { ok: false, code: "PACKAGE_SIGNATURE_INVALID" };
  return { ok: true, packageRef: value.packageRef, regionRef: value.regionRef, revision: Number(value.revision), itemCount: value.items.length, totalBytes, dataThrough };
}
