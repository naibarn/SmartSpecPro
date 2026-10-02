import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalDesignDigestInput, componentIntentSchema, componentResolutionSchema, isSafeDesignText } from "./designIntelligence";

export const ASTRYX_COMPONENT_VERSION = "0.6.3" as const;

export const designComponentIntentSchema = componentIntentSchema;
export type DesignComponentIntent = z.infer<typeof componentIntentSchema>;

const sourceSchema = z.enum(["smartspec", "astryx", "pattern", "template", "primitive"]);
const catalogComponentSchema = z.object({
  componentId: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,99}$/),
  source: sourceSchema,
  roles: z.array(z.string().min(1).max(100)).min(1),
  supportedProps: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,99}$/)),
  capabilities: z.array(z.string().min(1).max(200)),
  locales: z.array(z.string().min(1).max(35)).min(1),
  densities: z.array(z.enum(["comfortable", "compact", "spacious"])).min(1),
  densityMappings: z.record(
    z.enum(["comfortable", "compact", "spacious"]),
    z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,99}$/), z.union([z.string().max(100), z.number().finite(), z.boolean()])),
  ),
  themes: z.array(z.enum(["light", "dark", "system", "high-contrast"])),
  directions: z.array(z.enum(["ltr", "rtl"])),
  deviceProfiles: z.array(z.enum(["mobile", "tablet", "desktop"])),
  supportsSafeArea: z.boolean(),
  supportsReducedMotion: z.boolean(),
  permissionScopes: z.array(z.enum(["public", "member", "admin"])),
  compatibility: z.object({ minVersion: z.string(), maxExclusiveVersion: z.string() }).strict(),
}).strict();

export const designComponentCatalogSnapshotSchema = z.object({
  snapshotId: z.string().min(1).max(200),
  componentVersion: z.string().min(1).max(100),
  compatibility: z.object({ minVersion: z.string(), maxExclusiveVersion: z.string() }).strict(),
  components: z.array(catalogComponentSchema).min(1),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
}).strict();
export type DesignComponentCatalogSnapshot = z.infer<typeof designComponentCatalogSnapshotSchema>;

const componentDefinitions = [
  {
    componentId: "TextInput", source: "astryx", roles: ["text-entry", "form-field"],
    supportedProps: ["label", "value", "type", "size", "description", "isRequired", "isOptional", "status", "hasClear"],
    capabilities: ["keyboard", "labelled", "editable", "themeable", "responsive", "rtl", "safe-area", "reduced-motion"],
    locales: ["*"], densities: ["comfortable", "compact", "spacious"],
    densityMappings: { comfortable: { size: "md" }, compact: { size: "sm" }, spacious: { size: "lg" } },
    themes: ["light", "dark", "system", "high-contrast"], directions: ["ltr", "rtl"], deviceProfiles: ["mobile", "tablet", "desktop"],
    supportsSafeArea: true, supportsReducedMotion: true, permissionScopes: ["public", "member", "admin"],
    compatibility: { minVersion: "0.6.3", maxExclusiveVersion: "0.7.0" },
  },
  {
    componentId: "Selector", source: "astryx", roles: ["single-select"],
    supportedProps: ["label", "options", "value", "hasClear", "hasSearch", "presentation", "isLoading"],
    capabilities: ["keyboard", "labelled", "selection", "themeable", "responsive", "rtl", "safe-area", "reduced-motion"],
    locales: ["*"], densities: ["comfortable", "compact", "spacious"],
    densityMappings: { comfortable: {}, compact: {}, spacious: {} },
    themes: ["light", "dark", "system", "high-contrast"], directions: ["ltr", "rtl"], deviceProfiles: ["mobile", "tablet", "desktop"],
    supportsSafeArea: true, supportsReducedMotion: true, permissionScopes: ["public", "member", "admin"],
    compatibility: { minVersion: "0.6.3", maxExclusiveVersion: "0.7.0" },
  },
  {
    componentId: "Button", source: "astryx", roles: ["action"],
    supportedProps: ["label", "variant", "size", "type", "isLoading", "href", "target", "rel"],
    capabilities: ["keyboard", "labelled", "action", "themeable", "responsive", "rtl", "safe-area", "reduced-motion"],
    locales: ["*"], densities: ["comfortable", "compact", "spacious"],
    densityMappings: { comfortable: { size: "md" }, compact: { size: "sm" }, spacious: { size: "lg" } },
    themes: ["light", "dark", "system", "high-contrast"], directions: ["ltr", "rtl"], deviceProfiles: ["mobile", "tablet", "desktop"],
    supportsSafeArea: true, supportsReducedMotion: true, permissionScopes: ["public", "member", "admin"],
    compatibility: { minVersion: "0.6.3", maxExclusiveVersion: "0.7.0" },
  },
  {
    componentId: "Item", source: "astryx", roles: ["list-row"],
    supportedProps: ["label", "description", "density", "layout", "isSelected", "isDisabled"],
    capabilities: ["keyboard", "labelled", "list-row", "themeable", "responsive", "rtl", "safe-area", "reduced-motion"],
    locales: ["*"], densities: ["comfortable", "compact", "spacious"],
    densityMappings: { comfortable: { density: "balanced" }, compact: { density: "compact" }, spacious: { density: "spacious" } },
    themes: ["light", "dark", "system", "high-contrast"], directions: ["ltr", "rtl"], deviceProfiles: ["mobile", "tablet", "desktop"],
    supportsSafeArea: true, supportsReducedMotion: true, permissionScopes: ["public", "member", "admin"],
    compatibility: { minVersion: "0.6.3", maxExclusiveVersion: "0.7.0" },
  },
  {
    componentId: "Layout", source: "astryx", roles: ["workspace"],
    supportedProps: ["height", "contentWidth", "padding", "defaultHasDividers"],
    capabilities: ["regions", "themeable", "responsive", "rtl", "safe-area", "reduced-motion"],
    locales: ["*"], densities: ["comfortable", "compact", "spacious"],
    densityMappings: { comfortable: { padding: 4 }, compact: { padding: 3 }, spacious: { padding: 6 } },
    themes: ["light", "dark", "system", "high-contrast"], directions: ["ltr", "rtl"], deviceProfiles: ["mobile", "tablet", "desktop"],
    supportsSafeArea: true, supportsReducedMotion: true, permissionScopes: ["public", "member", "admin"],
    compatibility: { minVersion: "0.6.3", maxExclusiveVersion: "0.7.0" },
  },
  {
    componentId: "Dialog", source: "astryx", roles: ["dialog"],
    supportedProps: ["isOpen", "variant", "purpose", "width", "maxHeight", "padding"],
    capabilities: ["keyboard", "focus-management", "modal", "themeable", "responsive", "rtl", "safe-area", "reduced-motion"],
    locales: ["*"], densities: ["comfortable", "compact", "spacious"],
    densityMappings: { comfortable: { padding: 4 }, compact: { padding: 3 }, spacious: { padding: 6 } },
    themes: ["light", "dark", "system", "high-contrast"], directions: ["ltr", "rtl"], deviceProfiles: ["mobile", "tablet", "desktop"],
    supportsSafeArea: true, supportsReducedMotion: true, permissionScopes: ["member", "admin"],
    compatibility: { minVersion: "0.6.3", maxExclusiveVersion: "0.7.0" },
  },
] satisfies Array<z.infer<typeof catalogComponentSchema>>;

const unsignedSnapshot = {
  snapshotId: "smartspec-astryx-0.6.3-curated-1",
  componentVersion: ASTRYX_COMPONENT_VERSION,
  compatibility: { minVersion: "0.6.3", maxExclusiveVersion: "0.7.0" },
  components: componentDefinitions,
};

export function computeDesignCatalogDigest(snapshot: Omit<DesignComponentCatalogSnapshot, "digest"> | DesignComponentCatalogSnapshot): string {
  const { digest: _digest, ...unsigned } = snapshot as DesignComponentCatalogSnapshot;
  return `sha256:${createHash("sha256").update(canonicalDesignDigestInput(unsigned)).digest("hex")}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const DESIGN_COMPONENT_CATALOG_SNAPSHOT: DesignComponentCatalogSnapshot = deepFreeze({
  ...unsignedSnapshot,
  digest: computeDesignCatalogDigest(unsignedSnapshot),
});

// Only source-controlled snapshots in this registry are trusted. A valid digest
// proves integrity, but it does not make a caller-created catalog authoritative.
const trustedCatalogs = new Map([
  [`${DESIGN_COMPONENT_CATALOG_SNAPSHOT.snapshotId}:${DESIGN_COMPONENT_CATALOG_SNAPSHOT.digest}`, DESIGN_COMPONENT_CATALOG_SNAPSHOT],
]);

export type DesignComponentResolution = z.infer<typeof componentResolutionSchema>;

function versionParts(version: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

function versionInRange(version: string, range: { minVersion: string; maxExclusiveVersion: string }): boolean {
  const current = versionParts(version);
  const min = versionParts(range.minVersion);
  const max = versionParts(range.maxExclusiveVersion);
  if (!current || !min || !max) return false;
  const compare = (left: number[], right: number[]) => {
    for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return (left[i] ?? 0) - (right[i] ?? 0);
    return 0;
  };
  return compare(current, min) >= 0 && compare(current, max) < 0;
}

function safePropValue(key: string, value: unknown, depth = 0): boolean {
  if (depth > 10) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every((entry) => safePropValue(key, entry, depth + 1));
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.entries(value as Record<string, unknown>).every(([childKey, child]) =>
      /^[A-Za-z][A-Za-z0-9]{0,99}$/.test(childKey) &&
      !/(?:secret|token|password|credential|authorization|rawhtml|sourcecode|style|className)/i.test(childKey) &&
      safePropValue(childKey, child, depth + 1),
    );
  }
  if (typeof value !== "string" || !isSafeDesignText(value)) return false;
  if (key === "href") {
    if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /%5c/i.test(value) || /^\/(?:workflows|workpacks|work\/requests?)(?:\/|$)/i.test(value)) return false;
    try {
      return new URL(value, "https://smartaihub.invalid").origin === "https://smartaihub.invalid";
    } catch {
      return false;
    }
  }
  const enums: Record<string, string[]> = {
    size: ["sm", "md", "lg"],
    variant: ["primary", "secondary", "ghost", "destructive", "input"],
    density: ["comfortable", "compact", "spacious", "balanced"],
    layout: ["stacked", "inline"],
    type: ["text", "password", "email", "button", "submit", "reset"],
    target: ["_self", "_blank"],
    presentation: ["popover", "bottom-sheet", "adaptive"],
    purpose: ["required", "form", "info"],
    theme: ["light", "dark", "system", "high-contrast"],
  };
  return !enums[key] || enums[key]!.includes(value);
}

function canonicalizePropValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizePropValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalizePropValue(child)]));
  }
  return value;
}

function rejectedResolution(intentId: string, snapshotId: string, digest: string, componentVersion: string, status: "unsupported" | "review-needed", missingCapabilities: string[] = []): DesignComponentResolution {
  return componentResolutionSchema.parse({
    status, intentId, componentId: null, source: null,
    catalogSnapshotId: snapshotId, catalogDigest: digest, componentVersion,
    props: {}, unsupportedProps: [], missingCapabilities,
    rationale: status === "review-needed" ? "Catalog snapshot or component contract changed; human review is required." : "No approved component satisfies this intent; resolution fails closed.",
    fallback: false,
    context: { locale: "und", density: "comfortable", direction: "ltr", deviceProfile: "desktop", theme: "system", safeAreaRequired: false, reducedMotion: false, permissionScope: "public" },
  });
}

/** Deterministic, provider-free resolution against an immutable curated catalog snapshot. */
export function resolveDesignComponent(
  rawIntent: DesignComponentIntent,
  rawSnapshot: DesignComponentCatalogSnapshot,
  runtimeComponentVersion = ASTRYX_COMPONENT_VERSION,
): DesignComponentResolution {
  const parsedIntent = designComponentIntentSchema.safeParse(rawIntent);
  const parsedSnapshot = designComponentCatalogSnapshotSchema.safeParse(rawSnapshot);
  if (!parsedIntent.success || !parsedSnapshot.success) {
    return rejectedResolution("invalid", "unknown", "sha256:" + "0".repeat(64), ASTRYX_COMPONENT_VERSION, "review-needed");
  }
  const intent = parsedIntent.data;
  const snapshot = parsedSnapshot.data;
  const trustedSnapshot = trustedCatalogs.get(`${snapshot.snapshotId}:${snapshot.digest}`);
  const { digest: _ignored, ...unsigned } = snapshot;
  if (!trustedSnapshot || snapshot.snapshotId !== intent.catalogSnapshotId || snapshot.digest !== intent.catalogDigest ||
    snapshot.componentVersion !== intent.componentVersion || snapshot.componentVersion !== runtimeComponentVersion ||
    snapshot.componentVersion !== trustedSnapshot.componentVersion ||
    computeDesignCatalogDigest(unsigned) !== snapshot.digest || !versionInRange(snapshot.componentVersion, snapshot.compatibility)) {
    return rejectedResolution(intent.intentId, snapshot.snapshotId, snapshot.digest, snapshot.componentVersion, "review-needed");
  }

  const sourceRank: Record<z.infer<typeof sourceSchema>, number> = { smartspec: 0, astryx: 1, pattern: 2, template: 3, primitive: 4 };
  const candidates = snapshot.components.filter((component) => component.roles.includes(intent.role))
    .sort((left, right) => sourceRank[left.source] - sourceRank[right.source] || left.componentId.localeCompare(right.componentId));
  const missingCapabilities = [...new Set(intent.capabilities.filter((capability) => !candidates.some((candidate) => candidate.capabilities.includes(capability))))].sort();
  const match = candidates.find((component) =>
    intent.capabilities.every((capability) => component.capabilities.includes(capability)) &&
    component.densities.includes(intent.density) &&
    (component.locales.includes("*") || component.locales.includes(intent.locale) || component.locales.includes(intent.locale.split("-")[0]!)) &&
    component.themes.includes(intent.theme) && component.directions.includes(intent.direction) &&
    component.deviceProfiles.includes(intent.deviceProfile) &&
    (!intent.safeAreaRequired || component.supportsSafeArea) &&
    (!intent.reducedMotion || component.supportsReducedMotion) &&
    component.permissionScopes.includes(intent.permissionScope) &&
    versionInRange(snapshot.componentVersion, component.compatibility),
  );
  if (!match) return rejectedResolution(intent.intentId, snapshot.snapshotId, snapshot.digest, snapshot.componentVersion, "unsupported", missingCapabilities);

  const supported = new Set(match.supportedProps);
  const props: Record<string, unknown> = {};
  const unsupportedProps: string[] = [];
  for (const [key, value] of Object.entries(intent.props).sort(([left], [right]) => left.localeCompare(right))) {
    if (!supported.has(key) || !safePropValue(key, value)) unsupportedProps.push(key);
    else props[key] = canonicalizePropValue(value);
  }
  for (const [key, value] of Object.entries(match.densityMappings[intent.density] ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    if (!Object.prototype.hasOwnProperty.call(props, key) && supported.has(key) && safePropValue(key, value)) props[key] = value;
  }
  return componentResolutionSchema.parse({
    status: "resolved",
    intentId: intent.intentId,
    componentId: match.componentId,
    source: match.source,
    catalogSnapshotId: snapshot.snapshotId,
    catalogDigest: snapshot.digest,
    componentVersion: snapshot.componentVersion,
    compatibility: match.compatibility,
    props,
    unsupportedProps: unsupportedProps.sort(),
    missingCapabilities,
    rationale: `Selected ${match.source} component ${match.componentId} from pinned ${snapshot.componentVersion} catalog for role ${intent.role}.`,
    fallback: match.source !== "smartspec",
    context: {
      locale: intent.locale,
      density: intent.density,
      direction: intent.direction,
      deviceProfile: intent.deviceProfile,
      theme: intent.theme,
      safeAreaRequired: intent.safeAreaRequired,
      reducedMotion: intent.reducedMotion,
      permissionScope: intent.permissionScope,
    },
  });
}
