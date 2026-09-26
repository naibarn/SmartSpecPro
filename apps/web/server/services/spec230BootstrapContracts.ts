import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";

import {
  buildProjectContextPack,
  describeHarnessAdapter,
  type EngineeringArtifactClass,
  type HarnessAdapterDescriptor,
  type ProjectContextPack,
} from "./agenticDevelopmentFabricContracts";

export class Spec230BootstrapError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "Spec230BootstrapError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type RepositorySkillDescriptor = {
  id: string;
  root: "skills";
  relativePath: string;
  contentHash: string;
};

export type RepositoryEngineeringProfile = {
  contractVersion: "spec-230-v1";
  repositoryRef: string;
  sourceRevision: string;
  sourceDigest: string;
  trustedSkillRoot: "skills";
  discoveredSkills: RepositorySkillDescriptor[];
  loadedSkillIds: string[];
  contextPack: ProjectContextPack;
  harnesses: HarnessAdapterDescriptor[];
};

const SOURCE_REVISION = /^git:[A-Za-z0-9._-]{6,160}$/;
const REPOSITORY_REF = /^repo:[A-Za-z0-9_./:@#-]{1,191}$/;
const SKILL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_SKILL_BYTES = 64 * 1024;

function fail(code: string): never {
  throw new Spec230BootstrapError(code);
}

function assertInside(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) fail("SKILL_ROOT_ESCAPE");
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalRepositoryRoot(input: string): string {
  if (typeof input !== "string" || !input.trim()) fail("REPOSITORY_ROOT_INVALID");
  try {
    return realpathSync(path.resolve(input));
  } catch {
    fail("REPOSITORY_ROOT_UNAVAILABLE");
  }
}

function validateRevision(value: string): string {
  if (!SOURCE_REVISION.test(value)) fail("SOURCE_REVISION_UNPINNED");
  return value;
}

function validateSkillId(value: string): string {
  if (!SKILL_ID.test(value)) fail("SKILL_ID_INVALID");
  return value;
}

export function discoverRepositorySkills(input: {
  repositoryRoot: string;
  sourceRevision: string;
  requestedSkillIds?: string[];
}): {
  sourceRevision: string;
  discovered: RepositorySkillDescriptor[];
  loaded: Array<{ id: string; content: string }>;
} {
  const root = canonicalRepositoryRoot(input.repositoryRoot);
  const sourceRevision = validateRevision(input.sourceRevision);
  const skillsRoot = path.join(root, "skills");
  let entries: Dirent[];
  try {
    if (lstatSync(skillsRoot).isSymbolicLink()) fail("SKILL_ROOT_ESCAPE");
    entries = readdirSync(skillsRoot, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Spec230BootstrapError) throw error;
    fail("SKILL_ROOT_UNAVAILABLE");
  }

  const discovered = entries
    .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
    .map(entry => {
      const id = validateSkillId(entry.name);
      const skillDir = path.join(skillsRoot, entry.name);
      let realSkillDir: string;
      try {
        realSkillDir = realpathSync(skillDir);
      } catch {
        fail("SKILL_ROOT_UNAVAILABLE");
      }
      assertInside(root, realSkillDir);
      if (entry.isSymbolicLink()) fail("SKILL_ROOT_ESCAPE");
      const skillFile = path.join(skillDir, "SKILL.md");
      let stat: ReturnType<typeof lstatSync>;
      try {
        stat = lstatSync(skillFile);
      } catch {
        return null;
      }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_SKILL_BYTES) {
        if (stat.isSymbolicLink()) fail("SKILL_FILE_ESCAPE");
        if (stat.size > MAX_SKILL_BYTES) fail("SKILL_TOO_LARGE");
        return null;
      }
      const content = readFileSync(skillFile, "utf8");
      return {
        id,
        root: "skills" as const,
        relativePath: path.posix.join("skills", entry.name, "SKILL.md"),
        contentHash: digest(content),
      } satisfies RepositorySkillDescriptor;
    })
    .filter((entry): entry is RepositorySkillDescriptor => entry !== null)
    .sort((left, right) => left.id.localeCompare(right.id));

  const requested = input.requestedSkillIds?.map(validateSkillId);
  const selectedIds = requested ? Array.from(new Set(requested)) : [];
  const byId = new Map(discovered.map(skill => [skill.id, skill]));
  if (selectedIds.some(id => !byId.has(id))) fail("SKILL_NOT_FOUND");
  const loaded = selectedIds.map(id => ({
    id,
    content: readFileSync(path.join(skillsRoot, id, "SKILL.md"), "utf8"),
  }));
  return { sourceRevision, discovered, loaded };
}

export function buildRepositoryEngineeringProfile(input: {
  repositoryRoot: string;
  repositoryRef: string;
  sourceRevision: string;
  tenantId: string;
  principalId: string;
  artifactClass: EngineeringArtifactClass;
  requestedSkillIds?: string[];
}): RepositoryEngineeringProfile {
  if (!REPOSITORY_REF.test(input.repositoryRef)) fail("REPOSITORY_REF_INVALID");
  const discovery = discoverRepositorySkills(input);
  const manifest = JSON.stringify({
    repositoryRef: input.repositoryRef,
    sourceRevision: discovery.sourceRevision,
    skills: discovery.discovered,
  });
  const sourceDigest = digest(manifest);
  const sourceRefs = [
    input.repositoryRef,
    "skills:root",
    ...discovery.discovered.map(skill => `skill:${skill.id}:${skill.contentHash}`),
  ];
  const trust = Object.fromEntries(sourceRefs.map(sourceRef => [
    sourceRef,
    sourceRef.startsWith("skill:") ? "untrusted-content" as const : "canonical-contract" as const,
  ]));
  const contextPack = buildProjectContextPack({
    packId: `context:${sourceDigest.slice(0, 32)}`,
    tenantId: input.tenantId,
    principalId: input.principalId,
    artifactClass: input.artifactClass,
    contractVersion: "spec-222-v1",
    sourceRefs,
    sourceRevision: discovery.sourceRevision,
    trust,
  });
  const harnesses = [
    describeHarnessAdapter({
      family: "codex",
      version: "platform-managed",
      capabilities: ["edit", "build", "test"],
      authBoundary: "platform-managed",
    }),
    describeHarnessAdapter({
      family: "claude_code",
      version: "platform-managed",
      capabilities: ["edit", "build", "test"],
      authBoundary: "platform-managed",
    }),
  ];
  return {
    contractVersion: "spec-230-v1",
    repositoryRef: input.repositoryRef,
    sourceRevision: discovery.sourceRevision,
    sourceDigest,
    trustedSkillRoot: "skills",
    discoveredSkills: discovery.discovered,
    loadedSkillIds: discovery.loaded.map(skill => skill.id),
    contextPack,
    harnesses,
  };
}
