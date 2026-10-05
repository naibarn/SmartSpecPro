import type { PackageEntry, SpaasValidationLimitOverrides, SpaasValidationLimits, SpaasManifest } from "./model";
import { resolveValidationLimits } from "./limits";

export type CanonicalPackagePath = string & { readonly __canonicalPackagePath: unique symbol };
export type PathResult = { readonly ok: true; readonly path: CanonicalPackagePath } | { readonly ok: false };
function compareUtf8(a:string,b:string):number {const left=new TextEncoder().encode(a),right=new TextEncoder().encode(b),len=Math.min(left.length,right.length);for(let i=0;i<len;i++){if(left[i]!==right[i])return left[i]!-right[i]!;}return left.length-right.length;}

/** Logical package paths use NFC and case-sensitive identity, independent of host OS. */
export function canonicalizePackagePath(input: string, pathBytes = 1024, pathDepth = 32): PathResult {
  if (!input || input.includes("\\") || /[\0-\x1f\x7f<>:\"|?*]/.test(input) || input.startsWith("/") || /^[A-Za-z]:/.test(input)) return { ok: false };
  const parts = input.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part))) return { ok: false };
  const normalized = parts.map((part) => part.normalize("NFC")).join("/");
  if (new TextEncoder().encode(normalized).byteLength > pathBytes || parts.length > pathDepth) return { ok: false };
  return { ok: true, path: normalized as CanonicalPackagePath };
}

export interface NormalizedInventory {
  readonly entries: readonly (PackageEntry & { readonly path: CanonicalPackagePath })[];
  readonly byPath: ReadonlyMap<CanonicalPackagePath, PackageEntry & { readonly path: CanonicalPackagePath }>;
  readonly totalBytes: number;
  readonly limits: Readonly<SpaasValidationLimits>;
}
export interface PackageStructureResult {
  readonly ok:boolean;
  readonly manifest:SpaasManifest;
  readonly inventory:NormalizedInventory;
  readonly pathLookup:ReadonlyMap<CanonicalPackagePath,PackageEntry & {readonly path:CanonicalPackagePath}>;
  readonly componentReferences:readonly Readonly<{componentId:string;path:CanonicalPackagePath}>[];
  readonly sectionReferences:readonly Readonly<{name:string;path:CanonicalPackagePath;required:boolean}>[];
  readonly diagnostics:readonly import("./model").Diagnostic[];
}
export type InventoryResult = { readonly ok: true; readonly inventory: NormalizedInventory } | { readonly ok: false; readonly diagnostics: readonly import("./model").Diagnostic[] };

export function normalizePackageInventory(entries: readonly PackageEntry[], overrides?: SpaasValidationLimitOverrides): InventoryResult {
  const limits = resolveValidationLimits(overrides);
  const fail = (code: import("./model").DiagnosticCode, location: string, message: string): InventoryResult => ({ ok: false, diagnostics: Object.freeze([Object.freeze({ code, stage: "V2", severity: "error", location, message })]) });
  if (!limits.ok || !Array.isArray(entries)) return fail("PACKAGE_ENTRY_INVALID", "/entries", "Package entries must be a bounded array of regular byte entries.");
  if (entries.length > limits.limits.packageEntries) return fail("PACKAGE_LIMIT_EXCEEDED", "/entries", "Package entry limit is invalid or exceeded.");
  let totalBytes = 0;
  const map = new Map<CanonicalPackagePath, PackageEntry & { readonly path: CanonicalPackagePath }>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || typeof entry.path !== "string" || !(entry.bytes instanceof Uint8Array)) return fail("PACKAGE_ENTRY_INVALID", "/entries", "Package entry descriptor is malformed.");
    const result = canonicalizePackagePath(entry.path, limits.limits.pathBytes, limits.limits.pathDepth);
    if (!result.ok) return fail("PACKAGE_PATH_INVALID", "/entries", "A package path is not a safe logical relative path.");
    if (map.has(result.path)) return fail("PACKAGE_PATH_COLLISION", result.path, "Package paths collide under canonical path identity.");
    if (entry.kind !== "file" || !(entry.bytes instanceof Uint8Array)) return fail("PACKAGE_ENTRY_INVALID", result.path, "Only regular byte entries are accepted.");
    if (entry.bytes.byteLength > limits.limits.entryBytes) return fail("PACKAGE_LIMIT_EXCEEDED", result.path, "Package entry exceeds its byte limit.");
    totalBytes += entry.bytes.byteLength;
    if (totalBytes > limits.limits.aggregateBytes) return fail("PACKAGE_LIMIT_EXCEEDED", "/entries", "Package exceeds its aggregate byte limit.");
    const storedBytes=entry.bytes.slice();
    const normalized=Object.defineProperty({path:result.path,kind:"file" as const},"bytes",{enumerable:true,get:()=>storedBytes.slice()}) as PackageEntry & {readonly path:CanonicalPackagePath};
    map.set(result.path,Object.freeze(normalized));
  }
  const sorted = [...map.values()].sort((a, b) => compareUtf8(a.path,b.path));
  const backing = new Map(sorted.map((entry) => [entry.path, entry]));
  const byPath:ReadonlyMap<CanonicalPackagePath,PackageEntry & {readonly path:CanonicalPackagePath}> = Object.freeze({
    [Symbol.toStringTag]:"ReadonlyMap",
    get size(){return backing.size;},
    get:(key:CanonicalPackagePath)=>backing.get(key),
    has:(key:CanonicalPackagePath)=>backing.has(key),
    entries:()=>backing.entries(),
    keys:()=>backing.keys(),
    values:()=>backing.values(),
    forEach:(callback:(value:PackageEntry & {readonly path:CanonicalPackagePath},key:CanonicalPackagePath,map:ReadonlyMap<CanonicalPackagePath,PackageEntry & {readonly path:CanonicalPackagePath}>)=>void,thisArg?:unknown)=>backing.forEach((value,key)=>callback.call(thisArg,value,key,byPath)),
    [Symbol.iterator]:()=>backing[Symbol.iterator](),
  });
  return { ok: true, inventory: Object.freeze({ entries: Object.freeze(sorted), byPath, totalBytes, limits:limits.limits }) };
}

export function validatePackageStructure(manifest: SpaasManifest, inventory: NormalizedInventory): PackageStructureResult {
  const diagnostics: import("./model").Diagnostic[] = [];
  const componentReferences:Array<{componentId:string;path:CanonicalPackagePath}>=[];
  const sectionReferences:Array<{name:string;path:CanonicalPackagePath;required:boolean}>=[];
  if (!inventory.byPath.has("app.manifest.yaml" as CanonicalPackagePath)) diagnostics.push({ code: "PACKAGE_REFERENCE_MISSING", stage: "V2", severity: "error", location: "/app.manifest.yaml", message: "The authoritative manifest entry is missing." });
  const ids = new Set<string>();
  for (const [index, component] of manifest.components.entries()) {
    const id = typeof component.id === "string" ? component.id : "";
    if (!id || ids.has(id)) diagnostics.push({ code: "COMPONENT_ID_DUPLICATE", stage: "V2", severity: "error", location: `/components/${index}/id`, message: "Component identifiers must be unique and nonempty." });
    ids.add(id);
    const source = typeof component.source === "string" ? component.source : typeof component.path === "string" ? component.path : undefined;
    if (source) {
      const normalized=canonicalizePackagePath(source,inventory.limits.pathBytes,inventory.limits.pathDepth);
      if(!normalized.ok)diagnostics.push({code:"PACKAGE_PATH_INVALID",stage:"V2",severity:"error",location:`/components/${index}/source`,message:"A component reference is not a safe logical package path."});
      else {componentReferences.push(Object.freeze({componentId:id,path:normalized.path}));if(!inventory.byPath.has(normalized.path))diagnostics.push({ code: "PACKAGE_REFERENCE_MISSING", stage: "V2", severity: "error", location: `/components/${index}/source`, message: "A declared component source is missing from the package." });}
    }
  }
  for(const [index,section] of (manifest.sections??[]).entries()){
    const path=canonicalizePackagePath(section.path,inventory.limits.pathBytes,inventory.limits.pathDepth);
    if(!path.ok){diagnostics.push({code:"PACKAGE_PATH_INVALID",stage:"V2",severity:"error",location:`/sections/${index}/path`,message:"A section reference is not a safe logical package path."});continue;}
    sectionReferences.push(Object.freeze({name:section.name,path:path.path,required:section.required!==false}));
    const present=inventory.byPath.has(path.path);
    if(section.required!==false&&!present)diagnostics.push({code:"PACKAGE_SECTION_INVALID",stage:"V2",severity:"error",location:`/sections/${index}/path`,message:"A required package section file is missing."});
  }
  diagnostics.sort((a,b)=>a.location<b.location?-1:a.location>b.location?1:a.code<b.code?-1:a.code>b.code?1:0);
  return Object.freeze({ok:diagnostics.length===0,manifest,inventory,pathLookup:inventory.byPath,componentReferences:Object.freeze(componentReferences),sectionReferences:Object.freeze(sectionReferences),diagnostics:Object.freeze(diagnostics.map((item)=>Object.freeze({...item})))});
}
