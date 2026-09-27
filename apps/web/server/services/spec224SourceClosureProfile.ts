import { discoverSourceClosure, type SourceClosureInput, type SourceInputKind, type SourcePythonCompatibility } from "./spec224SourceBundle";

const PROFILE_VERSION = "spec224.source-closure-profile.v1";
const INPUT_KINDS = new Set<SourceInputKind>([
  "entry", "dependency-artifact", "runtime-config", "test-fixture", "generated-artifact",
  "executable", "hook", "workspace-manifest", "source-import",
]);
const RUNTIME_EVIDENCE_FIELDS = [
  "baseImageDigest", "observedPlatform", "nodeAbi", "pythonVersion", "artifactStoreRef",
  "provenanceAttestationRef", "nativeBuildEvidenceRef", "lifecyclePolicyRef",
] as const;

export type SourceClosureProfile = {
  schemaVersion: typeof PROFILE_VERSION;
  profileId: string;
  entryPaths: string[];
  dependencyArtifacts: string[];
  profileInputs: NonNullable<SourceClosureInput["profileInputs"]>;
  workspaceManifestPaths: string[];
  selectedPackageScripts: NonNullable<SourceClosureInput["selectedPackageScripts"]>;
  includeDevelopmentDependencies: boolean;
  moduleRoots: NonNullable<SourceClosureInput["moduleRoots"]>;
  runtimeIdentity: {
    node: string | null;
    python: string | null;
    packageManager: string | null;
    platform: string | null;
    pythonCompatibility: SourcePythonCompatibility | null;
  };
  selectedOptionalDependencies: string[] | null;
  selectedPythonDependencyGroups: string[] | null;
  selectedPythonExtras: string[] | null;
  runtimeEvidence: Record<(typeof RUNTIME_EVIDENCE_FIELDS)[number], string | null>;
  scopeBoundaries: string[];
};

export type SourceClosureProfileReport = {
  schemaVersion: "spec224.source-closure-profile-report.v1";
  profileId: string;
  sourceRevision: string | null;
  workingTreeClean: boolean | null;
  changedPathCount: number | null;
  status: "BLOCKED" | "SOURCE_CLOSURE_VERIFIED";
  admissionEligible: false;
  runtimeIdentity: SourceClosureProfile["runtimeIdentity"];
  localObserver: { node: string; platform: string; architecture: string };
  summary: {
    sourceFileCount: number;
    externalPackageCount: number;
    runtimeBuiltinCount: number;
    requiredArtifactCount: number;
    verifiedArtifactCount: number;
    unresolvedCount: number;
    closureComplete: boolean;
  };
  externalPackages: Array<{ name: string; version: string; locator: string; artifactStatus: string }>;
  unresolved: Array<{ from: string; specifier: string }>;
  blockers: string[];
  evidenceBoundary: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  const target = [...expected].sort();
  return actual.length === target.length && actual.every((key, index) => key === target[index]);
}

function isRelativeProfilePath(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value || !value || value.includes("\\") || value.startsWith("/")) return false;
  return value.split("/").every(segment => segment !== "" && segment !== "." && segment !== "..");
}

function parseList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(item => typeof item === "string" && item.trim() === item && !!item) || new Set(value).size !== value.length) return null;
  return value as string[];
}

function parsePathList(value: unknown): string[] | null {
  const list = parseList(value);
  if (!list || !list.every(isRelativeProfilePath)) return null;
  return list;
}

function parseRuntimeEvidence(value: unknown): SourceClosureProfile["runtimeEvidence"] | null {
  if (!isRecord(value) || !hasExactKeys(value, [...RUNTIME_EVIDENCE_FIELDS])) return null;
  const result = {} as SourceClosureProfile["runtimeEvidence"];
  for (const field of RUNTIME_EVIDENCE_FIELDS) {
    const item = value[field];
    if (item !== null && (typeof item !== "string" || !item.trim())) return null;
    result[field] = item as string | null;
  }
  return result;
}

export function parseSourceClosureProfile(value: unknown): SourceClosureProfile {
  const profileKeys = [
    "schemaVersion", "profileId", "entryPaths", "dependencyArtifacts", "profileInputs",
    "workspaceManifestPaths", "selectedPackageScripts", "includeDevelopmentDependencies", "moduleRoots", "runtimeIdentity", "selectedOptionalDependencies",
    "selectedPythonDependencyGroups", "selectedPythonExtras", "runtimeEvidence", "scopeBoundaries",
  ];
  if (!isRecord(value) || !hasExactKeys(value, profileKeys) || value.schemaVersion !== PROFILE_VERSION || typeof value.profileId !== "string" || !value.profileId.trim())
    throw new Error("SPEC224_SOURCE_PROFILE_SCHEMA_INVALID");

  const entryPaths = parsePathList(value.entryPaths);
  const dependencyArtifacts = parsePathList(value.dependencyArtifacts);
  const workspaceManifestPaths = parsePathList(value.workspaceManifestPaths);
  if (!entryPaths?.length || !dependencyArtifacts?.length || !workspaceManifestPaths) throw new Error("SPEC224_SOURCE_PROFILE_PATHS_INVALID");

  if (!Array.isArray(value.profileInputs) || !value.profileInputs.every(item =>
    isRecord(item) && hasExactKeys(item, ["path", "kind"]) && isRelativeProfilePath(item.path) && typeof item.kind === "string" && INPUT_KINDS.has(item.kind as SourceInputKind)
  )) throw new Error("SPEC224_SOURCE_PROFILE_INPUTS_INVALID");
  const profileInputs = value.profileInputs as SourceClosureProfile["profileInputs"];
  if (!Array.isArray(value.selectedPackageScripts) || !value.selectedPackageScripts.every(item =>
    isRecord(item) && hasExactKeys(item, ["manifestPath", "scripts"]) && isRelativeProfilePath(item.manifestPath) && parseList(item.scripts) !== null
  ) || new Set(value.selectedPackageScripts.map(item => (item as Record<string, unknown>).manifestPath)).size !== value.selectedPackageScripts.length)
    throw new Error("SPEC224_SOURCE_PROFILE_SELECTED_SCRIPTS_INVALID");
  const selectedPackageScripts = value.selectedPackageScripts as SourceClosureProfile["selectedPackageScripts"];
  if (typeof value.includeDevelopmentDependencies !== "boolean") throw new Error("SPEC224_SOURCE_PROFILE_DEPENDENCY_SELECTION_INVALID");

  if (!Array.isArray(value.moduleRoots) || !value.moduleRoots.every(item =>
    isRecord(item) && hasExactKeys(item, ["prefix", "root", "language"]) && typeof item.prefix === "string" && !!item.prefix.trim() &&
    isRelativeProfilePath(item.root) && (item.language === "python" || item.language === "javascript")
  )) throw new Error("SPEC224_SOURCE_PROFILE_MODULE_ROOTS_INVALID");

  const identity = value.runtimeIdentity;
  if (!isRecord(identity) || !hasExactKeys(identity, ["node", "python", "packageManager", "platform", "pythonCompatibility"]) ||
    [identity.node, identity.python, identity.packageManager, identity.platform].some(item => item !== null && (typeof item !== "string" || !item.trim())))
    throw new Error("SPEC224_SOURCE_PROFILE_RUNTIME_IDENTITY_INVALID");
  let pythonCompatibility: SourcePythonCompatibility | null = null;
  if (identity.pythonCompatibility !== null) {
    const compatibility = identity.pythonCompatibility;
    if (!isRecord(compatibility) || !hasExactKeys(compatibility, ["compatibleWheelTags", "markerEnvironment"]) ||
      !parseList(compatibility.compatibleWheelTags) || !isRecord(compatibility.markerEnvironment) ||
      Object.entries(compatibility.markerEnvironment).some(([key, item]) => !key.trim() || typeof item !== "string"))
      throw new Error("SPEC224_SOURCE_PROFILE_PYTHON_COMPATIBILITY_INVALID");
    pythonCompatibility = compatibility as SourcePythonCompatibility;
  }
  const optionalDependencies = value.selectedOptionalDependencies === null ? null : parseList(value.selectedOptionalDependencies);
  const pythonGroups = value.selectedPythonDependencyGroups === null ? null : parseList(value.selectedPythonDependencyGroups);
  const pythonExtras = value.selectedPythonExtras === null ? null : parseList(value.selectedPythonExtras);
  if ((value.selectedOptionalDependencies !== null && !optionalDependencies) ||
      (value.selectedPythonDependencyGroups !== null && !pythonGroups) || (value.selectedPythonExtras !== null && !pythonExtras))
    throw new Error("SPEC224_SOURCE_PROFILE_DEPENDENCY_SELECTION_INVALID");
  const runtimeEvidence = parseRuntimeEvidence(value.runtimeEvidence);
  const scopeBoundaries = parseList(value.scopeBoundaries);
  if (!runtimeEvidence || !scopeBoundaries) throw new Error("SPEC224_SOURCE_PROFILE_EVIDENCE_INVALID");

  return {
    schemaVersion: PROFILE_VERSION,
    profileId: value.profileId,
    entryPaths,
    dependencyArtifacts,
    profileInputs,
    workspaceManifestPaths,
    selectedPackageScripts,
    includeDevelopmentDependencies: value.includeDevelopmentDependencies,
    moduleRoots: value.moduleRoots as SourceClosureProfile["moduleRoots"],
    runtimeIdentity: { ...(identity as Omit<SourceClosureProfile["runtimeIdentity"], "pythonCompatibility">), pythonCompatibility },
    selectedOptionalDependencies: optionalDependencies,
    selectedPythonDependencyGroups: pythonGroups,
    selectedPythonExtras: pythonExtras,
    runtimeEvidence,
    scopeBoundaries,
  };
}

export async function evaluateSourceClosureProfile(input: {
  sourceRoot: string;
  profile: SourceClosureProfile;
  sourceRevision?: string | null;
  workingTreeClean?: boolean | null;
  changedPathCount?: number | null;
}): Promise<SourceClosureProfileReport> {
  const { profile } = input;
  const identity = profile.runtimeIdentity;
  const runtimeIdentity: NonNullable<SourceClosureInput["runtimeIdentity"]> = {
    ...(identity.node ? { node: identity.node } : {}),
    ...(identity.python ? { python: identity.python } : {}),
    ...(identity.packageManager ? { packageManager: identity.packageManager } : {}),
    ...(identity.platform ? { platform: identity.platform } : {}),
    ...(identity.pythonCompatibility ? { pythonCompatibility: identity.pythonCompatibility } : {}),
  };
  const closure = await discoverSourceClosure({
    sourceRoot: input.sourceRoot,
    entryPaths: profile.entryPaths,
    dependencyArtifacts: profile.dependencyArtifacts,
    profileInputs: profile.profileInputs,
    workspaceManifestPaths: profile.workspaceManifestPaths,
    selectedPackageScripts: profile.selectedPackageScripts,
    includeDevelopmentDependencies: profile.includeDevelopmentDependencies,
    moduleRoots: profile.moduleRoots,
    profileId: profile.profileId,
    runtimeIdentity,
    ...(profile.selectedOptionalDependencies !== null ? { selectedOptionalDependencies: profile.selectedOptionalDependencies } : {}),
    ...(profile.selectedPythonDependencyGroups !== null ? { selectedPythonDependencyGroups: profile.selectedPythonDependencyGroups } : {}),
    ...(profile.selectedPythonExtras !== null ? { selectedPythonExtras: profile.selectedPythonExtras } : {}),
  });

  const blockers = new Set<string>();
  if (!identity.node && !identity.python) blockers.add("RUNTIME_VERSION_IDENTITY_MISSING");
  if (!identity.packageManager) blockers.add("PACKAGE_MANAGER_IDENTITY_MISSING");
  if (!identity.platform) blockers.add("RUNTIME_PLATFORM_IDENTITY_MISSING");
  if (profile.selectedOptionalDependencies === null) blockers.add("OPTIONAL_DEPENDENCY_SELECTION_MISSING");
  if (profile.selectedPythonDependencyGroups === null) blockers.add("PYTHON_DEPENDENCY_GROUP_SELECTION_MISSING");
  if (profile.selectedPythonExtras === null) blockers.add("PYTHON_EXTRA_SELECTION_MISSING");
  const evidenceCodes: Record<keyof SourceClosureProfile["runtimeEvidence"], string> = {
    baseImageDigest: "RUNTIME_BASE_IMAGE_DIGEST_MISSING",
    observedPlatform: "RUNTIME_PLATFORM_ATTESTATION_MISSING",
    nodeAbi: "NODE_ABI_EVIDENCE_MISSING",
    pythonVersion: "PYTHON_RUNTIME_VERSION_MISSING",
    artifactStoreRef: "ARTIFACT_STORE_REFERENCE_MISSING",
    provenanceAttestationRef: "ARTIFACT_PROVENANCE_ATTESTATION_MISSING",
    nativeBuildEvidenceRef: "NATIVE_BUILD_EVIDENCE_MISSING",
    lifecyclePolicyRef: "LIFECYCLE_POLICY_EVIDENCE_MISSING",
  };
  for (const field of RUNTIME_EVIDENCE_FIELDS) if (!profile.runtimeEvidence[field]) blockers.add(evidenceCodes[field]);
  for (const boundary of profile.scopeBoundaries) blockers.add(`SCOPE_BOUNDARY_UNRESOLVED:${boundary}`);
  for (const item of closure.unresolvedImports) blockers.add(`SOURCE_CLOSURE_UNRESOLVED:${item.from}:${item.specifier}`);

  const required = new Set(closure.requiredExternalPackages);
  const verifiedArtifactCount = closure.externalPackageIdentities.filter(item => required.has(item.locator) && item.artifactStatus === "VERIFIED_ARTIFACT").length;
  const externalPackages = closure.externalPackageIdentities
    .filter(item => required.has(item.locator))
    .map(({ name, version, locator, artifactStatus }) => ({ name, version, locator, artifactStatus }))
    .sort((a, b) => a.locator.localeCompare(b.locator));
  return {
    schemaVersion: "spec224.source-closure-profile-report.v1",
    profileId: profile.profileId,
    sourceRevision: input.sourceRevision ?? null,
    workingTreeClean: input.workingTreeClean ?? null,
    changedPathCount: input.changedPathCount ?? null,
    status: blockers.size ? "BLOCKED" : "SOURCE_CLOSURE_VERIFIED",
    admissionEligible: false,
    runtimeIdentity: identity,
    localObserver: { node: process.version, platform: process.platform, architecture: process.arch },
    summary: {
      sourceFileCount: closure.files.length,
      externalPackageCount: externalPackages.length,
      runtimeBuiltinCount: closure.dependencyEdges.filter(edge => edge.status === "runtime-builtin").length,
      requiredArtifactCount: required.size,
      verifiedArtifactCount,
      unresolvedCount: closure.unresolvedImports.length,
      closureComplete: closure.closureComplete,
    },
    externalPackages,
    unresolved: closure.unresolvedImports,
    blockers: [...blockers].sort(),
    evidenceBoundary: "Static source and lockfile analysis only. No dependency download, install hook, native build, bundle assembly, admission, or deployment was performed.",
  };
}
