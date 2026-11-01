import { createHash } from "node:crypto";

import {
  buildSpec224SpecBaseline,
} from "./spec224SpecBaseline";

export const SPEC224_INCREMENTAL_SPEC_COMPILER_CONTRACT =
  "spec-224-incremental-spec-compiler-v1";

export type Spec224IncrementalSpecFile = Readonly<{
  path: string;
  digest: string;
  content: string;
  /** Trusted catalog binding supplied by the canonical SPEC adapter. */
  canonicalSource?: Readonly<{ kind?: "spec" | "manifest" | "requirement-ledger"; specId: string; specDigest: string; sourcePath: string; sourceDigest: string }>;
  projectSource?: Readonly<{ projectId: string; sourceRevision: string; descriptorDigest: string }>;
}>;

/**
 * This structural input deliberately matches the persisted SpecSet revision
 * without importing its store. The caller supplies only already-ingested,
 * immutable artifacts; compilation never dispatches a worker or a command.
 */
export type Spec224IncrementalSpecSetInput = Readonly<{
  runnerId: string;
  workspaceId: string;
  revision: number;
  digest: string;
  files: readonly Spec224IncrementalSpecFile[];
  previousRevision?: Spec224IncrementalSpecSetInput;
}>;

export type Spec224CompilerFinding = Readonly<{
  code: string;
  severity: "error" | "warning";
  artifactPath?: string;
  workPackageId?: string;
  requirementSourceKey?: string;
}>;

export type Spec224CompiledRequirement = Readonly<{
  id: string;
  artifactPath: string;
  artifactDigest: string;
  sourceRef: string;
  /** Stable logical source location, used only for revision reconciliation. */
  sourceKey: string;
  text: string;
  canonicalSpecId?: string;
  canonicalRequirementId?: string;
  canonicalSpecDigest?: string;
  lifecycleStatus: "READY" | "BLOCKED";
  blockers: readonly string[];
}>;

export type Spec224VerificationObligation = Readonly<{
  id: string;
  kind: "test" | "build" | "run" | "review" | "manual";
  ref: string;
}>;

export type Spec224CompiledWorkPackage = Readonly<{
  id: string;
  externalId: string;
  declarationPath: string;
  definitionDigest: string;
  requirementIds: readonly string[];
  dependsOn: readonly string[];
  acceptanceCriteria: readonly string[];
  verificationObligations: readonly Spec224VerificationObligation[];
  allowedWriteSet: readonly string[];
  readiness: "READY" | "BLOCKED";
  blockers: readonly string[];
  /** Prior evidence, if any, is stale for this package in the selected revision. */
  priorEvidenceStatus: "INVALIDATED" | null;
}>;

export type Spec224SpecSetImpact = Readonly<{
  previousRevision: number | null;
  addedRequirementSourceKeys: readonly string[];
  changedRequirementSourceKeys: readonly string[];
  removedRequirementSourceKeys: readonly string[];
  addedWorkPackageKeys: readonly string[];
  changedWorkPackageKeys: readonly string[];
  removedWorkPackageKeys: readonly string[];
  invalidatedCurrentWorkPackageIds: readonly string[];
  invalidatedPreviousWorkPackageIds: readonly string[];
}>;

export type Spec224IncrementalCompilation = Readonly<{
  contractVersion: typeof SPEC224_INCREMENTAL_SPEC_COMPILER_CONTRACT;
  specSetRevision: number;
  specSetDigest: string;
  requirements: readonly Spec224CompiledRequirement[];
  workPackages: readonly Spec224CompiledWorkPackage[];
  runnableWorkPackageIds: readonly string[];
  findings: readonly Spec224CompilerFinding[];
  impact: Spec224SpecSetImpact;
}>;

export class Spec224IncrementalSpecCompilerError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "Spec224IncrementalSpecCompilerError";
  }
}

type RequirementRefInput = { artifactPath?: string; line?: number; pointer?: string; specId?: string; requirementId?: string };
type PackageDeclaration = {
  externalId: string;
  id: string;
  declarationPath: string;
  requirementRefs: RequirementRefInput[] | null;
  dependsOn: string[] | null;
  acceptanceCriteria: string[] | null;
  verificationObligations: Spec224VerificationObligation[] | null;
  allowedWriteSet: string[] | null;
  blockers: string[];
};

const HASH = /^[a-f0-9]{64}$/;
const PATH = /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:md|json)$/i;
const PACKAGE_ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/;
const OBLIGATION_ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,95}$/;
const POINTER = /^\/requirements\/[0-9]+$/;
const MARKDOWN_PACKAGE_BLOCK = /^```spec224-work-packages[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
const MAX_MARKDOWN_PACKAGE_METADATA_BYTES = 64 * 1024;

function fail(code: string): never {
  throw new Spec224IncrementalSpecCompilerError(code);
}

function sha(value: unknown): string {
  const serialized = typeof value === "string" ? value : canonicalJson(value);
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function nonEmptyString(value: unknown, limit = 2_000): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= limit ? normalized : null;
}

function stringList(value: unknown, limit: number): string[] | null {
  if (!Array.isArray(value) || value.length > limit) return null;
  const values = value.map(item => nonEmptyString(item));
  if (values.some(value => value === null)) return null;
  const result = values as string[];
  return new Set(result).size === result.length ? result.sort() : null;
}

function safePath(value: unknown): string | null {
  const path = nonEmptyString(value, 240);
  return path && PATH.test(path) ? path : null;
}

function finding(
  findings: Spec224CompilerFinding[],
  code: string,
  options: Omit<Spec224CompilerFinding, "code" | "severity"> = {}
): void {
  findings.push({ code, severity: "error", ...options });
}

function sourceKeyForMarkdown(path: string, sourceRef: string): string {
  const suffix = sourceRef.slice(sourceRef.lastIndexOf("#") + 1);
  return `artifact:${path}#${suffix}`;
}

function jsonRequirementId(path: string, digest: string, pointer: string, text: string): string {
  return `req:${sha({ path, digest, pointer, text }).slice(0, 40)}`;
}

function canonicalRequirementSourceKey(specId: string, requirementId: string): string {
  return `canonical:${specId}#${requirementId}`;
}

function safeCanonicalSpecId(value: unknown): string | null {
  const id = nonEmptyString(value, 160);
  return id && !/[\/\\\u0000-\u001F\u007F]/u.test(id) && id !== "." && !id.includes("..") ? id : null;
}

function safeCanonicalRequirementId(value: unknown): string | null {
  const id = nonEmptyString(value, 160);
  return id && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(id) ? id : null;
}

function packageId(path: string, externalId: string): string {
  return `wp:${sha({ path, externalId }).slice(0, 40)}`;
}

export function digestSpec224IncrementalFiles(files: readonly Spec224IncrementalSpecFile[]): string {
  return sha(canonicalJson(files.map(({ path, digest, canonicalSource, projectSource }) => ({
    path,
    digest,
    ...(canonicalSource ? { canonicalSource } : {}),
    ...(projectSource ? { projectSource } : {}),
  }))));
}

function parseJson(content: string, path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      fail("SPEC_SET_JSON_OBJECT_REQUIRED");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Spec224IncrementalSpecCompilerError) throw error;
    throw new Spec224IncrementalSpecCompilerError(`SPEC_SET_JSON_INVALID:${path}`);
  }
}

function parseRequirementRefs(value: unknown): RequirementRefInput[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 256) return null;
  const refs: RequirementRefInput[] = [];
  for (const item of value) {
    if (!item || Array.isArray(item) || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const artifactPath = record.artifactPath === undefined ? undefined : safePath(record.artifactPath);
    const specId = record.specId === undefined ? undefined : safeCanonicalSpecId(record.specId);
    const requirementId = record.requirementId === undefined ? undefined : safeCanonicalRequirementId(record.requirementId);
    const line = record.line;
    const pointer = record.pointer;
    if (requirementId && specId && (line === undefined && pointer === undefined) && (record.artifactPath === undefined || artifactPath)) {
      refs.push({ ...(artifactPath ? { artifactPath } : {}), specId, requirementId });
      continue;
    }
    if (!artifactPath || specId || requirementId) return null;
    if (Number.isSafeInteger(line) && (line as number) > 0 && pointer === undefined) {
      refs.push({ artifactPath, line: line as number });
      continue;
    }
    if (typeof pointer === "string" && POINTER.test(pointer) && line === undefined) {
      refs.push({ artifactPath, pointer });
      continue;
    }
    return null;
  }
  const keys = refs.map(ref => ref.requirementId ? `${ref.specId}#${ref.requirementId}` : `${ref.artifactPath}#${ref.line ? `L${ref.line}` : ref.pointer}`);
  return new Set(keys).size === keys.length ? refs.sort((left, right) =>
    `${left.specId ?? left.artifactPath}:${left.requirementId ?? left.line ?? left.pointer}`.localeCompare(
      `${right.specId ?? right.artifactPath}:${right.requirementId ?? right.line ?? right.pointer}`
    )
  ) : null;
}

function parseSpecRefs(value: unknown): RequirementRefInput[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 64) return null;
  const refs: RequirementRefInput[] = [];
  for (const item of value) {
    if (!item || Array.isArray(item) || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const specId = safeCanonicalSpecId(record.specId);
    const requirementIds = stringList(record.requirementIds, 256);
    if (!specId || !requirementIds?.length) return null;
    refs.push(...requirementIds.map(requirementId => ({ specId, requirementId })));
  }
  const keys = refs.map(ref => `${ref.specId}#${ref.requirementId}`);
  return new Set(keys).size === keys.length ? refs.sort((left, right) => `${left.specId}#${left.requirementId}`.localeCompare(`${right.specId}#${right.requirementId}`)) : null;
}

function parseVerification(value: unknown): Spec224VerificationObligation[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 64) return null;
  const obligations: Spec224VerificationObligation[] = [];
  for (const item of value) {
    if (!item || Array.isArray(item) || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const id = nonEmptyString(record.id, 96);
    const ref = nonEmptyString(record.ref, 320);
    const kind = record.kind;
    if (!id || !OBLIGATION_ID.test(id) || !ref) return null;
    if (!(["test", "build", "run", "review", "manual"] as const).includes(kind as never)) return null;
    obligations.push({ id, kind: kind as Spec224VerificationObligation["kind"], ref });
  }
  return new Set(obligations.map(item => item.id)).size === obligations.length
    ? obligations.sort((left, right) => left.id.localeCompare(right.id))
    : null;
}

function parsePackageDeclarations(
  path: string,
  root: Record<string, unknown>,
  findings: Spec224CompilerFinding[]
): PackageDeclaration[] {
  if ("initialPackages" in root) {
    const workPackages = Array.isArray(root.initialPackages)
      ? root.initialPackages.map(candidate => {
        if (!candidate || Array.isArray(candidate) || typeof candidate !== "object") return candidate;
        const record = candidate as Record<string, unknown>;
        const writeSet = record.writeSet;
        return {
          ...record,
          ...(record.dependencies !== undefined ? { dependsOn: record.dependencies } : {}),
          ...(writeSet && !Array.isArray(writeSet) && typeof writeSet === "object" ? { allowedWriteSet: (writeSet as Record<string, unknown>).paths } : {}),
        };
      })
      : root.initialPackages;
    return parsePackageDeclarations(path, { spec224: { workPackages } }, findings);
  }
  if (!("spec224" in root)) return [];
  const spec224 = root.spec224;
  if (!spec224 || Array.isArray(spec224) || typeof spec224 !== "object") {
    finding(findings, "SPEC224_METADATA_INVALID", { artifactPath: path });
    return [];
  }
  const metadata = spec224 as Record<string, unknown>;
  if (!("workPackages" in metadata)) return [];
  if (!Array.isArray(metadata.workPackages) || metadata.workPackages.length > 128) {
    finding(findings, "WORK_PACKAGE_DECLARATIONS_INVALID", { artifactPath: path });
    return [];
  }
  const declarations: PackageDeclaration[] = [];
  for (const candidate of metadata.workPackages) {
    if (!candidate || Array.isArray(candidate) || typeof candidate !== "object") {
      finding(findings, "WORK_PACKAGE_DECLARATION_INVALID", { artifactPath: path });
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const externalId = nonEmptyString(record.id, 96);
    if (!externalId || !PACKAGE_ID.test(externalId)) {
      finding(findings, "WORK_PACKAGE_ID_INVALID", { artifactPath: path });
      continue;
    }
    const blockers: string[] = [];
    const requirementRefs = record.specRefs === undefined ? parseRequirementRefs(record.requirementRefs) : parseSpecRefs(record.specRefs);
    if (!requirementRefs) blockers.push("REQUIREMENT_REFS_UNDECLARED");
    const dependsOn = stringList(record.dependsOn, 128);
    if (!dependsOn || dependsOn.some(item => !PACKAGE_ID.test(item))) blockers.push("DEPENDENCIES_UNDECLARED");
    const acceptanceCriteria = stringList(record.acceptanceCriteria, 128);
    if (!acceptanceCriteria) blockers.push("ACCEPTANCE_CRITERIA_UNDECLARED");
    const verificationObligations = parseVerification(record.verification);
    if (!verificationObligations) blockers.push("VERIFICATION_UNDECLARED");
    const requestedWriteSet = stringList(record.allowedWriteSet, 256);
    const allowedWriteSet = requestedWriteSet && requestedWriteSet.every(value => {
      return !value.startsWith("/") && !value.includes("\\") && !value.split("/").some(part => !part || part === "." || part === "..");
    }) ? requestedWriteSet : null;
    if (!allowedWriteSet || !allowedWriteSet.length) blockers.push("ALLOWED_WRITE_SET_UNDECLARED");
    declarations.push({
      externalId,
      id: packageId(path, externalId),
      declarationPath: path,
      requirementRefs,
      dependsOn: dependsOn && dependsOn.every(item => PACKAGE_ID.test(item)) ? dependsOn : null,
      acceptanceCriteria,
      verificationObligations,
      allowedWriteSet,
      blockers,
    });
  }
  const duplicates = new Set<string>();
  for (const declaration of declarations) {
    const key = declaration.externalId;
    if (duplicates.has(key)) declaration.blockers.push("WORK_PACKAGE_DECLARATION_DUPLICATE");
    duplicates.add(key);
  }
  for (const declaration of declarations) {
    if (declarations.filter(other => other.externalId === declaration.externalId).length > 1) {
      declaration.blockers.push("WORK_PACKAGE_DECLARATION_DUPLICATE");
    }
  }
  return declarations;
}

function parseMarkdownPackageDeclarations(
  path: string,
  content: string,
  findings: Spec224CompilerFinding[]
): PackageDeclaration[] {
  const blocks = [...content.matchAll(MARKDOWN_PACKAGE_BLOCK)];
  if (!blocks.length) return [];
  if (blocks.length !== 1) {
    finding(findings, "MARKDOWN_WORK_PACKAGE_METADATA_INVALID", { artifactPath: path });
    return [];
  }
  const block = blocks[0]?.[1];
  if (!block || new TextEncoder().encode(block).byteLength > MAX_MARKDOWN_PACKAGE_METADATA_BYTES) {
    finding(findings, "MARKDOWN_WORK_PACKAGE_METADATA_INVALID", { artifactPath: path });
    return [];
  }
  let root: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(block);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      finding(findings, "MARKDOWN_WORK_PACKAGE_METADATA_INVALID", { artifactPath: path });
      return [];
    }
    root = parsed as Record<string, unknown>;
  } catch {
    finding(findings, "MARKDOWN_WORK_PACKAGE_METADATA_INVALID", { artifactPath: path });
    return [];
  }
  return parsePackageDeclarations(path, root, findings);
}

function collectRevision(input: Spec224IncrementalSpecSetInput): {
  requirements: Array<Omit<Spec224CompiledRequirement, "lifecycleStatus" | "blockers">>;
  declarations: PackageDeclaration[];
  findings: Spec224CompilerFinding[];
} {
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) fail("SPEC_SET_REVISION_INVALID");
  if (!HASH.test(input.digest)) fail("SPEC_SET_DIGEST_INVALID");
  if (!input.files.length || input.files.length > 64) fail("SPEC_SET_FILES_INVALID");
  if (!nonEmptyString(input.runnerId, 200) || !nonEmptyString(input.workspaceId, 200)) {
    fail("WORKSPACE_IDENTITY_INVALID");
  }
  const findings: Spec224CompilerFinding[] = [];
  const requirements: Array<Omit<Spec224CompiledRequirement, "lifecycleStatus" | "blockers">> = [];
  const declarations: PackageDeclaration[] = [];
  const paths = new Set<string>();
  for (const file of [...input.files].sort((left, right) => left.path.localeCompare(right.path))) {
    if (!safePath(file.path) || paths.has(file.path) || !HASH.test(file.digest) || sha(file.content) !== file.digest) {
      fail("SPEC_SET_FILE_INTEGRITY_INVALID");
    }
    if (file.canonicalSource) {
      const source = file.canonicalSource;
      if (!safeCanonicalSpecId(source.specId) || !HASH.test(source.specDigest) || !safePath(source.sourcePath) || source.sourceDigest !== file.digest) {
        fail("CANONICAL_SOURCE_BINDING_INVALID");
      }
    }
    if (file.projectSource && (!safeCanonicalSpecId(file.projectSource.projectId) || !/^[a-f0-9]{40,64}$/i.test(file.projectSource.sourceRevision) || !HASH.test(file.projectSource.descriptorDigest) || file.projectSource.descriptorDigest !== file.digest)) {
      fail("CANONICAL_PROJECT_BINDING_INVALID");
    }
    if (file.canonicalSource?.kind === "spec" && !file.path.toLowerCase().endsWith(".md")) fail("CANONICAL_SOURCE_KIND_INVALID");
    if (file.canonicalSource && file.canonicalSource.kind !== "spec" && !file.path.toLowerCase().endsWith(".json")) fail("CANONICAL_SOURCE_KIND_INVALID");
    if (file.projectSource && !file.path.toLowerCase().endsWith(".json")) fail("CANONICAL_PROJECT_BINDING_INVALID");
    paths.add(file.path);
    if (file.path.toLowerCase().endsWith(".md")) {
      if (file.canonicalSource?.kind === "spec") continue;
      const baseline = buildSpec224SpecBaseline({
        specId: `artifact-${sha(file.path).slice(0, 32)}`,
        revision: file.digest,
        // Runner and workspace identifiers are trust-bound outside this pure
        // compiler. Hash them here so untrusted-looking display identifiers
        // cannot alter the baseline reference grammar or leak into output.
        authorityRef: `runner:${sha(input.runnerId).slice(0, 40)}`,
        scopeEnvelopeRef: `workspace:${sha(input.workspaceId).slice(0, 40)}`,
        sourceMarkdown: file.content,
      });
      for (const requirement of baseline.requirements) {
        requirements.push({
          ...requirement,
          artifactPath: file.path,
          artifactDigest: file.digest,
          sourceKey: sourceKeyForMarkdown(file.path, requirement.sourceRef),
        });
      }
      declarations.push(...parseMarkdownPackageDeclarations(file.path, file.content, findings));
      continue;
    }
    const root = parseJson(file.content, file.path);
    if (file.canonicalSource?.kind === "manifest") continue;
    if ("requirements" in root) {
      if (!Array.isArray(root.requirements)) {
        finding(findings, "JSON_REQUIREMENTS_INVALID", { artifactPath: file.path });
      } else if (file.canonicalSource && (file.canonicalSource.kind === undefined || file.canonicalSource.kind === "requirement-ledger")) {
        if (root.spec_digest !== file.canonicalSource.specDigest) {
          finding(findings, "CANONICAL_SPEC_DIGEST_MISMATCH", { artifactPath: file.path });
        } else {
          for (const item of root.requirements) {
            if (!item || Array.isArray(item) || typeof item !== "object") {
              finding(findings, "JSON_REQUIREMENT_INVALID", { artifactPath: file.path });
              continue;
            }
            const record = item as Record<string, unknown>;
            const id = safeCanonicalRequirementId(record.requirement_id);
            const text = nonEmptyString(record.requirement_text);
            if (!id || !text) {
              finding(findings, "JSON_REQUIREMENT_INVALID", { artifactPath: file.path });
              continue;
            }
            requirements.push({
              id,
              artifactPath: file.canonicalSource.sourcePath,
              artifactDigest: file.canonicalSource.sourceDigest,
              sourceRef: `canonical:${file.canonicalSource.specId}@${file.canonicalSource.specDigest}:${file.canonicalSource.sourcePath}@${file.canonicalSource.sourceDigest}#${id}`,
              sourceKey: canonicalRequirementSourceKey(file.canonicalSource.specId, id),
              text,
              canonicalSpecId: file.canonicalSource.specId,
              canonicalRequirementId: id,
              canonicalSpecDigest: file.canonicalSource.specDigest,
            });
          }
        }
      } else {
        for (const [index, item] of root.requirements.entries()) {
          const text = nonEmptyString(item);
          if (!text) {
            finding(findings, "JSON_REQUIREMENT_INVALID", { artifactPath: file.path });
            continue;
          }
          const pointer = `/requirements/${index}`;
          requirements.push({
            id: jsonRequirementId(file.path, file.digest, pointer, text),
            artifactPath: file.path,
            artifactDigest: file.digest,
            sourceRef: `artifact:${file.path}@${file.digest}#${pointer}`,
            sourceKey: `artifact:${file.path}#${pointer}`,
            text,
          });
        }
      }
    }
    declarations.push(...parsePackageDeclarations(file.path, root, findings));
  }
  const packageDeclarationsByExternalId = new Map<string, PackageDeclaration[]>();
  for (const declaration of declarations) {
    packageDeclarationsByExternalId.set(declaration.externalId, [
      ...(packageDeclarationsByExternalId.get(declaration.externalId) ?? []),
      declaration,
    ]);
  }
  for (const [externalId, duplicates] of packageDeclarationsByExternalId) {
    if (duplicates.length < 2) continue;
    for (const declaration of duplicates) declaration.blockers.push("WORK_PACKAGE_DECLARATION_DUPLICATE");
    finding(findings, "WORK_PACKAGE_DECLARATION_DUPLICATE", {
      artifactPath: duplicates.map(item => item.declarationPath).sort()[0],
      workPackageId: packageId(duplicates[0]!.declarationPath, externalId),
    });
  }
  const sourceKeys = requirements.map(item => item.sourceKey);
  if (new Set(sourceKeys).size !== sourceKeys.length) fail("REQUIREMENT_SOURCE_DUPLICATE");
  const legacyIds = requirements.filter(item => !item.canonicalRequirementId).map(item => item.id);
  if (new Set(legacyIds).size !== legacyIds.length) fail("REQUIREMENT_ID_DUPLICATE");
  const canonicalIdsBySpec = new Map<string, Set<string>>();
  for (const requirement of requirements) {
    if (!requirement.canonicalSpecId || !requirement.canonicalRequirementId) continue;
    const specs = canonicalIdsBySpec.get(requirement.canonicalRequirementId) ?? new Set<string>();
    specs.add(requirement.canonicalSpecId);
    canonicalIdsBySpec.set(requirement.canonicalRequirementId, specs);
  }
  for (const [requirementId, specIds] of canonicalIdsBySpec) {
    if (specIds.size < 2) continue;
    const matching = requirements.filter(item => item.canonicalRequirementId === requirementId);
    findings.push({ code: "CANONICAL_REQUIREMENT_ID_SCOPED_COLLISION", severity: "warning",
      artifactPath: matching.map(item => item.artifactPath).sort()[0],
      requirementSourceKey: matching.map(item => item.sourceKey).sort()[0],
    });
  }
  return { requirements, declarations, findings };
}

function dependencyCycleIds(packages: Map<string, { dependsOn: string[] }>): Set<string> {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycle = new Set<string>();
  const walk = (id: string, stack: string[]): void => {
    if (visiting.has(id)) {
      for (const item of stack.slice(stack.indexOf(id))) cycle.add(item);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const current = packages.get(id);
    for (const dependency of current?.dependsOn ?? []) if (packages.has(dependency)) walk(dependency, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of packages.keys()) walk(id, []);
  return cycle;
}

function computeImpact(
  current: Spec224IncrementalCompilation,
  previous: Spec224IncrementalCompilation | null
): Spec224SpecSetImpact {
  if (!previous) {
    return {
      previousRevision: null,
      addedRequirementSourceKeys: current.requirements.map(item => item.sourceKey).sort(),
      changedRequirementSourceKeys: [], removedRequirementSourceKeys: [],
      addedWorkPackageKeys: current.workPackages.map(item => `${item.declarationPath}:${item.externalId}`).sort(),
      changedWorkPackageKeys: [], removedWorkPackageKeys: [],
      invalidatedCurrentWorkPackageIds: [], invalidatedPreviousWorkPackageIds: [],
    };
  }
  const currentRequirements = new Map(current.requirements.map(item => [item.sourceKey, item]));
  const previousRequirements = new Map(previous.requirements.map(item => [item.sourceKey, item]));
  const addedRequirementSourceKeys = [...currentRequirements.keys()].filter(key => !previousRequirements.has(key)).sort();
  const changedRequirementSourceKeys = [...currentRequirements.entries()].filter(([key, value]) => {
    const previousValue = previousRequirements.get(key);
    return previousValue && (previousValue.id !== value.id || (
      value.canonicalRequirementId !== undefined && (previousValue.text !== value.text || previousValue.canonicalSpecDigest !== value.canonicalSpecDigest || previousValue.artifactDigest !== value.artifactDigest)
    ));
  }).map(([key]) => key).sort();
  const removedRequirementSourceKeys = [...previousRequirements.keys()].filter(key => !currentRequirements.has(key)).sort();
  const keyOf = (item: Spec224CompiledWorkPackage) => `${item.declarationPath}:${item.externalId}`;
  const currentPackages = new Map(current.workPackages.map(item => [keyOf(item), item]));
  const previousPackages = new Map(previous.workPackages.map(item => [keyOf(item), item]));
  const addedWorkPackageKeys = [...currentPackages.keys()].filter(key => !previousPackages.has(key)).sort();
  const directlyChangedKeys = new Set(
    [...currentPackages.entries()]
      .filter(([key, value]) => previousPackages.get(key)?.definitionDigest !== value.definitionDigest)
      .map(([key]) => key)
  );
  const changedRequirementIds = new Set(changedRequirementSourceKeys.flatMap(key => {
    const requirement = currentRequirements.get(key)!;
    return requirement.canonicalRequirementId ? [key] : [requirement.id];
  }));
  for (const [key, value] of currentPackages) {
    if (value.requirementIds.some(id => changedRequirementIds.has(id))) directlyChangedKeys.add(key);
  }
  const reverse = new Map<string, string[]>();
  for (const [key, value] of currentPackages) {
    for (const dependencyId of value.dependsOn) {
      const dependency = current.workPackages.find(item => item.id === dependencyId);
      if (!dependency) continue;
      const dependencyKey = keyOf(dependency);
      reverse.set(dependencyKey, [...(reverse.get(dependencyKey) ?? []), key]);
    }
  }
  const invalidatedKeys = new Set(directlyChangedKeys);
  for (const key of invalidatedKeys) {
    const queue = [...(reverse.get(key) ?? [])];
    while (queue.length) {
      const next = queue.shift()!;
      if (invalidatedKeys.has(next)) continue;
      invalidatedKeys.add(next);
      queue.push(...(reverse.get(next) ?? []));
    }
  }
  const changedWorkPackageKeys = [...directlyChangedKeys].sort();
  return {
    previousRevision: previous.specSetRevision,
    addedRequirementSourceKeys,
    changedRequirementSourceKeys,
    removedRequirementSourceKeys,
    addedWorkPackageKeys,
    changedWorkPackageKeys,
    removedWorkPackageKeys: [...previousPackages.keys()].filter(key => !currentPackages.has(key)).sort(),
    invalidatedCurrentWorkPackageIds: [...invalidatedKeys].map(key => currentPackages.get(key)!.id).sort(),
    invalidatedPreviousWorkPackageIds: [...invalidatedKeys].flatMap(key => previousPackages.get(key) ? [previousPackages.get(key)!.id] : []).sort(),
  };
}

function compileInternal(input: Spec224IncrementalSpecSetInput): Spec224IncrementalCompilation {
  const collected = collectRevision(input);
  const requirementBySourceKey = new Map(collected.requirements.map(item => [item.sourceKey, item]));
  const requirementByCanonicalKey = new Map(collected.requirements
    .filter(item => item.canonicalSpecId && item.canonicalRequirementId)
    .map(item => [`${item.canonicalSpecId}#${item.canonicalRequirementId}`, item]));
  const declarationByExternalId = new Map<string, PackageDeclaration>();
  for (const declaration of collected.declarations) {
    if (!declarationByExternalId.has(declaration.externalId)) declarationByExternalId.set(declaration.externalId, declaration);
  }
  const packageDrafts = collected.declarations.map(declaration => {
    const blockers = [...declaration.blockers];
    const requirementIds: string[] = [];
    for (const ref of declaration.requirementRefs ?? []) {
      const sourceKey = ref.requirementId && ref.specId
        ? canonicalRequirementSourceKey(ref.specId, ref.requirementId)
        : `artifact:${ref.artifactPath}#${ref.line ? `L${ref.line}` : ref.pointer}`;
      const requirement = ref.requirementId && ref.specId
        ? requirementByCanonicalKey.get(`${ref.specId}#${ref.requirementId}`)
        : requirementBySourceKey.get(sourceKey);
      if (!requirement || (ref.artifactPath && requirement.artifactPath !== ref.artifactPath)) {
        blockers.push("REQUIREMENT_REFERENCE_UNRESOLVED");
        collected.findings.push({ code: "REQUIREMENT_REFERENCE_UNRESOLVED", severity: "error", artifactPath: declaration.declarationPath, workPackageId: declaration.id, requirementSourceKey: sourceKey });
      } else requirementIds.push(requirement.canonicalRequirementId && requirement.canonicalSpecId
        ? canonicalRequirementSourceKey(requirement.canonicalSpecId, requirement.canonicalRequirementId)
        : requirement.id);
    }
    for (const dependency of declaration.dependsOn ?? []) {
      if (!declarationByExternalId.has(dependency)) blockers.push("DEPENDENCY_REFERENCE_UNRESOLVED");
    }
    return {
      declaration,
      requirementIds: [...new Set(requirementIds)].sort(),
      dependencyExternalIds: declaration.dependsOn ?? [],
      blockers: [...new Set(blockers)].sort(),
    };
  });
  const draftsByExternalId = new Map(packageDrafts.map(draft => [draft.declaration.externalId, draft]));
  const cycleIds = dependencyCycleIds(new Map(packageDrafts.map(draft => [draft.declaration.externalId, { dependsOn: draft.dependencyExternalIds }])));
  for (const draft of packageDrafts) if (cycleIds.has(draft.declaration.externalId)) draft.blockers.push("DEPENDENCY_CYCLE");
  const readiness = new Map<string, "READY" | "BLOCKED">();
  const unresolved = new Set(packageDrafts.map(draft => draft.declaration.externalId));
  while (unresolved.size) {
    let progressed = false;
    for (const externalId of [...unresolved]) {
      const draft = draftsByExternalId.get(externalId)!;
      const dependencyStates = draft.dependencyExternalIds.map(id => readiness.get(id));
      if (dependencyStates.some(state => state === "BLOCKED")) draft.blockers.push("DEPENDENCY_BLOCKED");
      if (dependencyStates.some(state => state === undefined && unresolved.has(draft.dependencyExternalIds.find(id => readiness.get(id) === undefined)!))) continue;
      readiness.set(externalId, draft.blockers.length ? "BLOCKED" : "READY");
      unresolved.delete(externalId);
      progressed = true;
    }
    if (!progressed) {
      for (const externalId of unresolved) readiness.set(externalId, "BLOCKED");
      unresolved.clear();
    }
  }
  const workPackages = packageDrafts.map(draft => {
    const dependsOn = draft.dependencyExternalIds.map(id => draftsByExternalId.get(id)?.declaration.id).filter((id): id is string => Boolean(id)).sort();
    const declaration = draft.declaration;
    const readinessValue = readiness.get(declaration.externalId) ?? "BLOCKED";
    return {
      id: declaration.id,
      externalId: declaration.externalId,
      declarationPath: declaration.declarationPath,
      definitionDigest: sha({
        externalId: declaration.externalId,
        declarationPath: declaration.declarationPath,
        requirementIds: draft.requirementIds,
        dependsOn,
        acceptanceCriteria: declaration.acceptanceCriteria ?? [],
        verificationObligations: declaration.verificationObligations ?? [],
        allowedWriteSet: declaration.allowedWriteSet ?? [],
      }),
      requirementIds: draft.requirementIds,
      dependsOn,
      acceptanceCriteria: declaration.acceptanceCriteria ?? [],
      verificationObligations: declaration.verificationObligations ?? [],
      allowedWriteSet: declaration.allowedWriteSet ?? [],
      readiness: readinessValue,
      blockers: [...new Set(draft.blockers)].sort(),
      priorEvidenceStatus: null,
    } satisfies Spec224CompiledWorkPackage;
  }).sort((left, right) => left.id.localeCompare(right.id));
  const packagesByRequirement = new Map<string, Spec224CompiledWorkPackage[]>();
  for (const workPackage of workPackages) for (const requirementId of workPackage.requirementIds) {
    packagesByRequirement.set(requirementId, [...(packagesByRequirement.get(requirementId) ?? []), workPackage]);
  }
  const requirements = collected.requirements.map(requirement => {
    const requirementKey = requirement.canonicalSpecId && requirement.canonicalRequirementId
      ? canonicalRequirementSourceKey(requirement.canonicalSpecId, requirement.canonicalRequirementId)
      : requirement.id;
    const linked = packagesByRequirement.get(requirementKey) ?? [];
    const ready = linked.some(item => item.readiness === "READY");
    return {
      ...requirement,
      lifecycleStatus: ready ? "READY" : "BLOCKED",
      blockers: ready ? [] : linked.length ? ["NO_LINKED_WORK_PACKAGE_READY"] : ["REQUIREMENT_UNMAPPED"],
    } satisfies Spec224CompiledRequirement;
  }).sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
  return {
    contractVersion: SPEC224_INCREMENTAL_SPEC_COMPILER_CONTRACT,
    specSetRevision: input.revision,
    specSetDigest: input.digest,
    requirements,
    workPackages,
    runnableWorkPackageIds: workPackages.filter(item => item.readiness === "READY").map(item => item.id),
    findings: collected.findings.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
    impact: {
      previousRevision: null, addedRequirementSourceKeys: [], changedRequirementSourceKeys: [], removedRequirementSourceKeys: [],
      addedWorkPackageKeys: [], changedWorkPackageKeys: [], removedWorkPackageKeys: [], invalidatedCurrentWorkPackageIds: [], invalidatedPreviousWorkPackageIds: [],
    },
  };
}

/**
 * Deterministically compiles immutable SpecSet artifacts. It is a pure
 * preparation step: the result cannot enqueue `worker_jobs`, write workspace
 * files, execute build/test/run, or grant authority from uploaded text.
 */
export function compileSpec224IncrementalSpecSet(
  input: Spec224IncrementalSpecSetInput
): Spec224IncrementalCompilation {
  const previous = input.previousRevision ? compileInternal(input.previousRevision) : null;
  const current = compileInternal({ ...input, previousRevision: undefined });
  const impact = computeImpact(current, previous);
  const invalidated = new Set(impact.invalidatedCurrentWorkPackageIds);
  return {
    ...current,
    workPackages: current.workPackages.map(item => ({
      ...item,
      priorEvidenceStatus: invalidated.has(item.id) ? "INVALIDATED" : null,
    } satisfies Spec224CompiledWorkPackage)),
    impact,
  };
}
