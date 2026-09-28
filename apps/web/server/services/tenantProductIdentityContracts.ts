import { createHash } from "node:crypto";

export type DomainBindingStatus =
  | "PLATFORM_SUBDOMAIN"
  | "CUSTOM_DOMAIN_REQUESTED"
  | "DNS_VERIFICATION_PENDING"
  | "CERTIFICATE_PENDING"
  | "ACTIVE";

export type TenantIdentity = {
  tenantId: string;
  slug: string;
  name: string;
};

export type BrandVersion = {
  brandId: string;
  tenantId: string;
  version: string;
  tokens: Record<string, unknown>;
};

export type ProductDefinition = {
  productId: string;
  tenantId: string;
  slug: string;
  brandRef: string;
  brandTenantId: string;
  releaseChannel: "draft" | "staging" | "production";
};

export type ProductModule = {
  moduleId: string;
  tenantId: string;
  productId: string;
  kind: "native-mini-app" | "custom-mini-app" | "native-module";
  ref: string;
  requiredEntitlementRefs: string[];
  config?: Record<string, unknown>;
};

export type DomainBinding = {
  domainId: string;
  tenantId: string;
  productId: string;
  hostname: string;
  status: DomainBindingStatus;
};

export type ProductReleaseSnapshot = {
  releaseId: string;
  tenantId: string;
  productId: string;
  productDefinitionVersion: string;
  brandVersion: string;
  moduleRefs: string[];
  entitlementPolicyVersion?: string;
  contentHash: string;
};

export class ProductIdentityContractError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "ProductIdentityContractError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const OPAQUE_TENANT_ID = /^tenant-[A-Za-z0-9_-]{1,35}$/;
const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const SLUG = /^[a-z][a-z0-9-]{1,63}$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const SENSITIVE = /(?:^|[_-])(api[_-]?key|secret|token|password|credential|authorization|private[_-]?key)$/i;

function text(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ProductIdentityContractError(code);
  return value.trim();
}

function assertId(value: unknown, code = "PRODUCT_IDENTITY_INVALID"): string {
  const result = text(value, code);
  if (!ID.test(result)) throw new ProductIdentityContractError(code);
  return result;
}

function assertTenantId(value: unknown): string {
  const result = text(value, "PRODUCT_IDENTITY_INVALID");
  if (!OPAQUE_TENANT_ID.test(result)) throw new ProductIdentityContractError("PRODUCT_IDENTITY_INVALID");
  return result;
}

function assertTenantMatch(left: string, right: string): void {
  if (left !== right) throw new ProductIdentityContractError("PRODUCT_TENANT_MISMATCH");
}

function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => SENSITIVE.test(key) || containsSensitiveKey(child));
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(stable(value), "utf8").digest("hex");
}

export function buildTenantIdentity(input: { tenantId: string; slug: string; name: string }): TenantIdentity {
  const tenantId = assertTenantId(input.tenantId);
  const slug = text(input.slug, "PRODUCT_SLUG_INVALID").toLowerCase();
  if (!SLUG.test(slug)) throw new ProductIdentityContractError("PRODUCT_SLUG_INVALID");
  return { tenantId, slug, name: text(input.name, "PRODUCT_IDENTITY_INVALID") };
}

export function buildBrandVersion(input: {
  brandId: string;
  tenantId: string;
  version: string;
  tokens: Record<string, unknown>;
}): BrandVersion {
  if (containsSensitiveKey(input.tokens)) throw new ProductIdentityContractError("PRODUCT_SECRET_FORBIDDEN");
  return {
    brandId: assertId(input.brandId),
    tenantId: assertTenantId(input.tenantId),
    version: assertId(input.version),
    tokens: structuredClone(input.tokens),
  };
}

export function buildProductDefinition(input: {
  productId: string;
  tenantId: string;
  slug: string;
  brandRef: string;
  brandTenantId: string;
  releaseChannel?: ProductDefinition["releaseChannel"];
}): ProductDefinition {
  const tenantId = assertTenantId(input.tenantId);
  const brandRef = assertId(input.brandRef);
  assertTenantMatch(tenantId, assertTenantId(input.brandTenantId));
  const slug = text(input.slug, "PRODUCT_SLUG_INVALID").toLowerCase();
  if (!SLUG.test(slug)) throw new ProductIdentityContractError("PRODUCT_SLUG_INVALID");
  return {
    productId: assertId(input.productId),
    tenantId,
    slug,
    brandRef,
    releaseChannel: input.releaseChannel ?? "draft",
  };
}

export function buildProductModule(input: {
  moduleId: string;
  tenantId: string;
  productId: string;
  productTenantId: string;
  kind: ProductModule["kind"];
  ref: string;
  requiredEntitlementRefs?: string[];
  config?: Record<string, unknown>;
}): ProductModule {
  if (input.config && containsSensitiveKey(input.config)) throw new ProductIdentityContractError("PRODUCT_SECRET_FORBIDDEN");
  const tenantId = assertTenantId(input.tenantId);
  assertTenantMatch(tenantId, assertTenantId(input.productTenantId));
  return {
    moduleId: assertId(input.moduleId),
    tenantId,
    productId: assertId(input.productId),
    kind: input.kind,
    ref: text(input.ref, "PRODUCT_MODULE_INVALID"),
    requiredEntitlementRefs: (input.requiredEntitlementRefs ?? []).map(ref => assertId(ref, "PRODUCT_MODULE_INVALID")),
    ...(input.config ? { config: structuredClone(input.config) } : {}),
  };
}

export function buildDomainBinding(input: {
  domainId: string;
  tenantId: string;
  productId: string;
  productTenantId: string;
  hostname: string;
}): DomainBinding {
  const hostname = text(input.hostname, "DOMAIN_INVALID").toLowerCase();
  if (!HOSTNAME.test(hostname)) throw new ProductIdentityContractError("DOMAIN_INVALID");
  const tenantId = assertTenantId(input.tenantId);
  assertTenantMatch(tenantId, assertTenantId(input.productTenantId));
  return {
    domainId: assertId(input.domainId),
    tenantId,
    productId: assertId(input.productId),
    hostname,
    status: "DNS_VERIFICATION_PENDING",
  };
}

export function activateDomainBinding(binding: DomainBinding): DomainBinding {
  if (binding.status !== "CERTIFICATE_PENDING") throw new ProductIdentityContractError("DOMAIN_NOT_VERIFIED");
  return { ...binding, status: "ACTIVE" };
}

export function buildProductReleaseSnapshot(input: Omit<ProductReleaseSnapshot, "contentHash">): ProductReleaseSnapshot {
  const snapshot = {
    releaseId: assertId(input.releaseId),
    tenantId: assertTenantId(input.tenantId),
    productId: assertId(input.productId),
    productDefinitionVersion: assertId(input.productDefinitionVersion),
    brandVersion: assertId(input.brandVersion),
    moduleRefs: input.moduleRefs.map(ref => assertId(ref, "RELEASE_SNAPSHOT_INVALID")),
    ...(input.entitlementPolicyVersion ? { entitlementPolicyVersion: assertId(input.entitlementPolicyVersion) } : {}),
  };
  return { ...snapshot, contentHash: hash(snapshot) };
}

export function assertProductReleaseSnapshotImmutable(
  original: ProductReleaseSnapshot,
  candidate: ProductReleaseSnapshot
): true {
  if (hash({ ...candidate, contentHash: undefined }) !== hash({ ...original, contentHash: undefined }) || candidate.contentHash !== original.contentHash)
    throw new ProductIdentityContractError("RELEASE_SNAPSHOT_IMMUTABLE");
  return true;
}

export function evaluateProductEntitlement(input: {
  tenantId: string;
  productId: string;
  principalId: string;
  requiredRefs: string[];
  grantedRefs: string[];
  authorizedTenantId?: string;
}): { allowed: boolean; code: string } {
  if (input.authorizedTenantId !== undefined && input.tenantId !== input.authorizedTenantId)
    return { allowed: false, code: "PRODUCT_TENANT_MISMATCH" };
  if (!input.principalId || input.requiredRefs.some(ref => !input.grantedRefs.includes(ref)))
    return { allowed: false, code: "PRODUCT_ENTITLEMENT_DENIED" };
  return { allowed: true, code: "ALLOW" };
}
