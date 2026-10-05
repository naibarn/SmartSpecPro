import yaml from "js-yaml";
import { canonicalizeManifest } from "./canonicalize";
import { resolveValidationLimits } from "./limits";
import type {
  Diagnostic,
  ManifestExtension,
  ManifestParseResult,
  ManifestSupportContext,
  SpaasManifest,
  SpaasValidationLimits,
} from "./model";
import { manifestSchema, type ParsedManifest } from "./schema/manifest";

const NAMESPACE_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const CORE_COMPONENT_TYPES = new Set(["ui","api-function","background-worker","assistant","agent","skill","workflow","mcp-client","mcp-server","a2a-agent","scheduler","trigger-handler","data-migration","knowledge-source","vector-index","media-pipeline","external-agent-adapter","webhook-endpoint","event-consumer","event-producer","chat-surface","voice-interface","communication-channel-adapter","telephony-adapter","wallet-capability","orchestration-runtime","harness-extension","notification-provider","reference-artifact","deployment-adapter"]);

function diagnostic(code: Diagnostic["code"], location: string, message: string): Diagnostic {
  return Object.freeze({ code, severity: "error", stage: "V1", location, message });
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortDiagnostics(items: Diagnostic[]): readonly Diagnostic[] {
  return Object.freeze(items.sort((a, b) => compareText(a.location, b.location) || compareText(a.code, b.code)));
}

function hasYamlPropertyToken(source: string, tokens: readonly string[]): boolean {
  let quote: "single" | "double" | null = null;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i]!;
    if (quote === "double") {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quote = null;
      continue;
    }
    if (quote === "single") {
      if (c === "'" && source[i + 1] === "'") i += 1;
      else if (c === "'") quote = null;
      continue;
    }
    if (c === '"') { quote = "double"; continue; }
    if (c === "'") { quote = "single"; continue; }
    if (c === "#" && (i === 0 || /\s/.test(source[i - 1]!))) {
      const newline = source.indexOf("\n", i);
      if (newline < 0) return false;
      i = newline;
      continue;
    }
    if (tokens.includes(c)) {
      const previous = i === 0 ? " " : source[i - 1]!;
      const next = source[i + 1] ?? " ";
      const tokenStart = /[\s\[{,:?-]/.test(previous);
      const tokenBody = !/[\s\] },]/.test(next);
      if (tokenStart && tokenBody) return true;
    }
  }
  return false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function countJsonTree(value: unknown, maxDepth: number, maxNodes: number): "depth" | "nodes" | null {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  const seen = new WeakSet<object>();
  let count = 0;
  while (stack.length) {
    const current = stack.pop()!;
    count += 1;
    if (count > maxNodes) return "nodes";
    if (current.depth > maxDepth) return "depth";
    if (current.value !== null && typeof current.value === "object") {
      if (seen.has(current.value)) return "nodes";
      seen.add(current.value);
      if (Array.isArray(current.value)) {
        for (const child of current.value) stack.push({ value: child, depth: current.depth + 1 });
      } else {
        for (const [key, child] of Object.entries(current.value)) {
          count += 1;
          if (count > maxNodes) return "nodes";
          stack.push({ value: child, depth: current.depth + 1 });
          if (typeof key !== "string") return "nodes";
        }
      }
    } else if (typeof current.value === "number" && !Number.isFinite(current.value)) {
      return "nodes";
    } else if (typeof current.value === "undefined" || typeof current.value === "function" || typeof current.value === "symbol" || typeof current.value === "bigint") {
      return "nodes";
    }
  }
  return null;
}

function canonicalExtensions(manifest: ParsedManifest): ManifestExtension[] {
  const extensions: ManifestExtension[] = [...(manifest.extensions ?? [])];
  const mcp = manifest.interop?.mcp;
  const mcpExtensions = mcp?.extensions;
  for (const [namespace, requirement] of Object.entries(mcpExtensions?.required ?? {})) {
    extensions.push({
      namespace,
      version: requirement.version ?? requirement.extensionVersion ?? "",
      schema: requirement.schema,
      criticality: requirement.securityCritical ? "security_critical" : "required",
      config: requirement.settings ?? requirement.requiredSettings ?? {},
    });
  }
  for (const [namespace, requirement] of Object.entries(mcpExtensions?.optional ?? {})) {
    extensions.push({
      namespace,
      version: requirement.version ?? requirement.extensionVersion ?? "",
      schema: requirement.schema,
      criticality: requirement.securityCritical ? "security_critical" : "optional",
      config: requirement.settings ?? {},
      fallback: requirement.fallback && requirement.omissionSafe === true
        ? { policy: requirement.fallback, preservesSemantics: true }
        : undefined,
    });
  }
  return extensions;
}

function negotiate(manifest: ParsedManifest, support: ManifestSupportContext, diagnostics: Diagnostic[]): {
  extensions: ManifestExtension[];
  unexecutedExtensions: readonly Readonly<{ namespace: string; version: string }>[];
} {
  const required = manifest.compatibility.requiredFeatures ?? [];
  const optional = manifest.compatibility.optionalFeatures ?? [];
  const requiredSupport = new Set(support.supportedRequiredFeatures);
  const optionalSupport = new Set([...support.supportedOptionalFeatures, ...support.supportedRequiredFeatures]);
  for (const feature of required) {
    if (!requiredSupport.has(feature)) diagnostics.push(diagnostic("MANIFEST_FEATURE_UNSUPPORTED", "/compatibility/requiredFeatures", "A required platform feature is not supported by the supplied compatibility context."));
  }
  for (const feature of optional) {
    if (!optionalSupport.has(feature)) {
      const fallback = manifest.compatibility.optionalFeatureFallbacks?.[feature];
      if (!fallback?.preservesSemantics) diagnostics.push(diagnostic("MANIFEST_OPTIONAL_FEATURE_UNSAFE", `/compatibility/optionalFeatures/${feature}`, "An unsupported optional feature has no declared semantics-preserving fallback."));
    }
  }
  if (!support.supportedApiVersions.includes(manifest.apiVersion)) diagnostics.push(diagnostic("MANIFEST_API_UNSUPPORTED", "/apiVersion", "The manifest API version is not supported by the supplied compatibility context."));
  if (!support.supportedSchemaVersions.includes(manifest.compatibility.manifestSchema)) diagnostics.push(diagnostic("MANIFEST_SCHEMA_UNSUPPORTED", "/compatibility/manifestSchema", "The manifest schema version is not supported by the supplied compatibility context."));

  const extensions = canonicalExtensions(manifest);
  const unexecutedExtensions: Array<Readonly<{ namespace: string; version: string }>> = [];
  const seen = new Set<string>();
  for (const extension of extensions) {
    const location = `/extensions/${extension.namespace}`;
    if (!NAMESPACE_PATTERN.test(extension.namespace) || !extension.version) {
      diagnostics.push(diagnostic("MANIFEST_SCHEMA_INVALID", location, "An extension declaration has an invalid namespace or missing version."));
      continue;
    }
    const key = `${extension.namespace}\0${extension.version}`;
    if (seen.has(key)) diagnostics.push(diagnostic("MANIFEST_EXTENSION_CONFLICT", location, "The same extension namespace and version is declared more than once."));
    seen.add(key);
    const known = support.extensions.find((item) => item.namespace === extension.namespace);
    const supported = Boolean(known?.versions.includes(extension.version) && known.criticalities.includes(extension.criticality));
    if (supported) continue;
    if (extension.criticality === "required" || extension.criticality === "security_critical") {
      diagnostics.push(diagnostic("MANIFEST_EXTENSION_UNSUPPORTED", location, "A required or security-critical extension is not supported by the supplied compatibility context."));
    } else if ((extension.criticality === "optional" || extension.criticality === "advisory") && !extension.fallback?.preservesSemantics) {
      diagnostics.push(diagnostic("MANIFEST_OPTIONAL_FEATURE_UNSAFE", location, "An unsupported optional extension lacks an explicit semantics-preserving fallback."));
    }
    if (!supported && extension.criticality !== "required" && extension.criticality !== "security_critical") {
      unexecutedExtensions.push(Object.freeze({ namespace: extension.namespace, version: extension.version }));
    }
  }
  unexecutedExtensions.sort((a, b) => compareText(a.namespace, b.namespace) || compareText(a.version, b.version));
  return { extensions, unexecutedExtensions: Object.freeze(unexecutedExtensions) };
}

function invalid(diagnostics: Diagnostic[]): ManifestParseResult {
  return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

export function parseSpaasManifest(
  input: string | Uint8Array,
  support: ManifestSupportContext,
  limitOverrides?: Partial<SpaasValidationLimits>,
): ManifestParseResult {
  if(typeof input!=="string"&&!(input instanceof Uint8Array))return invalid([diagnostic("MANIFEST_DOCUMENT_INVALID","/","Manifest input must be UTF-8 text or bytes.")]);
  if(!isPlainRecord(support)||!Array.isArray(support.supportedApiVersions)||!Array.isArray(support.supportedSchemaVersions)||!Array.isArray(support.supportedRequiredFeatures)||!Array.isArray(support.supportedOptionalFeatures)||!Array.isArray(support.extensions)||![...support.supportedApiVersions,...support.supportedSchemaVersions,...support.supportedRequiredFeatures,...support.supportedOptionalFeatures].every((value)=>typeof value==="string")||support.extensions.some((item)=>!isPlainRecord(item)||typeof item.namespace!=="string"||!Array.isArray(item.versions)||!Array.isArray(item.criticalities)||!item.versions.every((value)=>typeof value==="string")||!item.criticalities.every((value)=>["required","optional","advisory","security_critical"].includes(String(value)))))return invalid([diagnostic("MANIFEST_SCHEMA_INVALID","/support","Manifest support context is malformed.")]);
  const limitResult = resolveValidationLimits(limitOverrides);
  if (!limitResult.ok) return invalid([diagnostic("MANIFEST_LIMIT_EXCEEDED", "/", "One or more parser limits are invalid or exceed the documented maximum.")]);
  if (input instanceof Uint8Array && input.byteLength > limitResult.limits.manifestBytes) {
    return invalid([diagnostic("MANIFEST_LIMIT_EXCEEDED", "/", "Manifest input exceeds the configured byte limit.")]);
  }
  if (typeof input === "string" && input.length > limitResult.limits.manifestBytes) {
    return invalid([diagnostic("MANIFEST_LIMIT_EXCEEDED", "/", "Manifest input exceeds the configured byte limit.")]);
  }

  let source: string;
  try {
    if (input instanceof Uint8Array) source = new TextDecoder("utf-8", { fatal: true }).decode(input);
    else source = input;
  } catch {
    return invalid([diagnostic("MANIFEST_SYNTAX_INVALID", "/", "Manifest bytes are not valid UTF-8 text.")]);
  }
  if (hasUnpairedSurrogate(source)) return invalid([diagnostic("MANIFEST_SYNTAX_INVALID", "/", "Manifest text contains invalid Unicode encoding.")]);
  const byteLength = new TextEncoder().encode(source).byteLength;
  if (byteLength > limitResult.limits.manifestBytes) return invalid([diagnostic("MANIFEST_LIMIT_EXCEEDED", "/", "Manifest input exceeds the configured byte limit.")]);
  if (/(^|[\r\n])\s*%(?:YAML|TAG)\b/m.test(source)) return invalid([diagnostic("MANIFEST_SYNTAX_INVALID", "/", "YAML directives are not permitted." )]);
  if (hasYamlPropertyToken(source, ["&", "*"])) return invalid([diagnostic("MANIFEST_SYNTAX_INVALID", "/", "YAML anchors and aliases are not permitted." )]);
  if (hasYamlPropertyToken(source, ["!"])) return invalid([diagnostic("MANIFEST_SYNTAX_INVALID", "/", "Explicit YAML tags are not permitted." )]);

  let decoded: unknown;
  try {
    decoded = yaml.load(source, {
      schema: yaml.JSON_SCHEMA,
      maxDepth: limitResult.limits.yamlDepth,
      maxTotalMergeKeys: 0,
    });
  } catch (error) {
    const duplicate = error instanceof Error && /duplicated mapping key/i.test(error.message);
    const limit = error instanceof Error && /nesting exceeded maxDepth|merge keys exceeded maxTotalMergeKeys/i.test(error.message);
    if (limit) return invalid([diagnostic("MANIFEST_LIMIT_EXCEEDED", "/", "Manifest exceeds a configured parser complexity limit.")]);
    return invalid([diagnostic(duplicate ? "MANIFEST_DUPLICATE_KEY" : "MANIFEST_SYNTAX_INVALID", "/", duplicate ? "Manifest contains a duplicate mapping key." : "Manifest YAML syntax or scalar types are invalid.")]);
  }

  const treeIssue = countJsonTree(decoded, limitResult.limits.yamlDepth, limitResult.limits.yamlNodes);
  if (treeIssue) return invalid([diagnostic("MANIFEST_LIMIT_EXCEEDED", "/", `Manifest exceeds the configured ${treeIssue} limit.`)]);
  if (!isPlainRecord(decoded)) return invalid([diagnostic("MANIFEST_DOCUMENT_INVALID", "/", "Manifest document must be one JSON-compatible object." )]);

  const parsed = manifestSchema.safeParse(decoded);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => diagnostic(
      "MANIFEST_SCHEMA_INVALID",
      `/${issue.path.map((part) => String(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`,
      "Manifest field does not satisfy the SPAAS core schema.",
    ));
    return invalid(issues);
  }

  const manifest = parsed.data as unknown as SpaasManifest;
  const diagnostics: Diagnostic[] = [];
  const componentIds = new Set<string>();
  for (let index = 0; index < parsed.data.components.length; index += 1) {
    const component = parsed.data.components[index]!;
    const id = component.id;
    if (componentIds.has(id)) diagnostics.push(diagnostic("COMPONENT_ID_DUPLICATE", `/components/${index}/id`, "Component identifiers must be unique within a manifest."));
    componentIds.add(id);
    if (!CORE_COMPONENT_TYPES.has(component.type) && !support.supportedComponentTypes?.includes(component.type)) diagnostics.push(diagnostic("COMPONENT_KIND_UNKNOWN", `/components/${index}/type`, "Component type is not registered in the supplied support context."));
    if (!component.source && !component.version && !component.digest) diagnostics.push(diagnostic("MANIFEST_SCHEMA_INVALID", `/components/${index}`, "Component must declare a source, version, or digest reference."));
    if (component.source) {
      const path = component.source;
      const segments = path.split("/");
      if (path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.includes("\\") || /[\0-\x1f\x7f]/.test(path) || segments.some((part) => !part || part === "." || part === "..") || new TextEncoder().encode(path).byteLength > limitResult.limits.pathBytes || segments.length > limitResult.limits.pathDepth) {
        diagnostics.push(diagnostic("MANIFEST_SCHEMA_INVALID", `/components/${index}/source`, "Component source must be a safe logical relative package path."));
      }
    }
  }
  const negotiation = negotiate(parsed.data, support, diagnostics);
  if (diagnostics.length) return invalid(diagnostics);
  const normalized = canonicalizeManifest({ ...manifest, extensions: negotiation.extensions });
  return { ok: true, manifest: normalized, unexecutedExtensions: negotiation.unexecutedExtensions };
}
