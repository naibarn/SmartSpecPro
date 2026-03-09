import crypto from "crypto";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { eq, inArray } from "drizzle-orm";

import { signBearerToken } from "../_core/tokens";
import { getDb } from "../db";
import { startPythonSkillTask, type SkillExecutionResult } from "./skillExecutor";
import { getAllSkillsForUser, setSkillVisibility } from "./userSkillService";
import { hasRelativeSkillManifest, resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import {
  getSkillByIdAsync,
  refreshSkillCache,
  syncSingleSkillIfChanged,
} from "./skillRegistry";
import {
  skills,
} from "../../drizzle/schema";

const SKILLS_ROOT = path.resolve(process.cwd(), "skills");
const ISC_ROOT = path.resolve(SKILLS_ROOT, "intelligence-skill-creator");
const ISC_PROPOSALS_ROOT = path.resolve(ISC_ROOT, "runs", "proposals");

const MAX_TEXT_BLOCK_CHARS = 12000;
const MAX_REFERENCE_SNIPPET_CHARS = 4000;
const MAX_ZIP_TEXT_CHARS = 14000;
const MAX_ZIP_FILES = 40;

type StudioMode = "create" | "improve";
type DesiredVisibility = "private" | "pending_approval" | "public";

export interface SkillStudioRequest {
  mode: StudioMode;
  brief: string;
  targetSkillId?: number;
  newSkillSlug?: string;
  skillLanguage?: "auto" | "python" | "javascript";
  complexity?: "simple" | "moderate" | "complex";
  rounds?: number;
  allowTestExpansion?: boolean;
  askUser?: boolean;
  desiredVisibility?: DesiredVisibility;
  autoApplyProposal?: boolean;
  specText?: string;
  specFileName?: string;
  specFileContent?: string;
  cloneFromSkillId?: number;
  referenceSkillIds?: number[];
  zipFileName?: string;
  zipBase64?: string;
  llmGatewayMode?: "system" | "custom";
  llmModelSearch?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  llmApiKey?: string;
  llmTemperature?: number;
  llmTimeoutS?: number;
}

export interface SkillStudioLaunchContext {
  userId: number;
  userRole?: string | null;
  userToken?: string | null;
  publicUrl?: string | null;
}

export interface SkillStudioLaunchResult {
  taskId: string;
  mode: StudioMode;
  summary: string;
}

type AccessibleSkill = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  visibility: string;
  createdBy: number | null;
  isOwner?: boolean;
  ownerName?: string | null;
  hasLocalFolder?: boolean;
};

function truncateText(value: string | null | undefined, limit: number): string {
  const text = (value || "").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n...[truncated]`;
}

function normalizeDesiredVisibility(
  requested: DesiredVisibility | undefined,
  isAdmin: boolean,
): DesiredVisibility {
  if (isAdmin) {
    return requested || "private";
  }
  if (requested === "public") {
    return "pending_approval";
  }
  return requested || "private";
}

function createSkillExecutionToken(userId: number): string {
  return signBearerToken(
    {
      sub: String(userId),
      type: "access",
      scopes: ["skill:execute"],
      jti: `skill_studio_${Date.now()}_${crypto.randomBytes(10).toString("hex")}`,
    },
    "15m",
  );
}

function hasLocalSkillFolder(slug: string): boolean {
  return hasRelativeSkillManifest(path.join("skills", slug));
}

function slugify(raw: string): string {
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || "generated-skill";
}

async function resolveUniqueCreateSlug(
  requestedSlug: string | undefined,
  brief: string,
): Promise<string> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const baseSlug = slugify(requestedSlug?.trim() || brief.split(/\s+/).slice(0, 8).join(" "));
  const [existingBase] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(eq(skills.slug, baseSlug))
    .limit(1);

  if (requestedSlug?.trim()) {
    if (existingBase || hasLocalSkillFolder(baseSlug)) {
      throw new Error(`Skill slug '${baseSlug}' already exists. Please choose a new slug.`);
    }
    return baseSlug;
  }

  if (!existingBase && !hasLocalSkillFolder(baseSlug)) {
    return baseSlug;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseSlug.slice(0, 58)}-${index}`;
    const [existing] = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.slug, candidate))
      .limit(1);
    if (!existing && !hasLocalSkillFolder(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not generate a unique skill slug");
}

async function getAccessibleSkillsMap(userId: number, isAdmin: boolean): Promise<Map<number, AccessibleSkill>> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  if (isAdmin) {
    const rows = await db
      .select({
        id: skills.id,
        slug: skills.slug,
        name: skills.name,
        description: skills.description,
        visibility: skills.visibility,
        createdBy: skills.createdBy,
      })
      .from(skills);

    return new Map(
      rows.map((row) => [
        row.id,
        {
          ...row,
          isOwner: row.createdBy === userId,
          ownerName: null,
          hasLocalFolder: hasLocalSkillFolder(row.slug),
        },
      ]),
    );
  }

  const visible = await getAllSkillsForUser(userId, { limit: 500, offset: 0 });
  return new Map(
    visible.skills.map((row: any) => [
      row.id,
      {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description ?? null,
        visibility: row.visibility,
        createdBy: row.createdBy ?? null,
        isOwner: row.isOwner,
        ownerName: row.ownerName ?? null,
        hasLocalFolder: hasLocalSkillFolder(row.slug),
      },
    ]),
  );
}

async function resolveOwnedTargetSkill(
  input: SkillStudioRequest,
  userId: number,
  isAdmin: boolean,
): Promise<AccessibleSkill | null> {
  if (input.mode !== "improve") return null;
  if (!input.targetSkillId) {
    throw new Error("targetSkillId is required for improve mode");
  }

  const accessibleSkills = await getAccessibleSkillsMap(userId, isAdmin);
  const target = accessibleSkills.get(input.targetSkillId);
  if (!target) {
    throw new Error("Target skill is not accessible");
  }
  if (!isAdmin && target.createdBy !== userId) {
    throw new Error("You can only improve skills you own");
  }
  if (!target.hasLocalFolder) {
    throw new Error("This skill cannot be improved with ISC because it has no local skill folder");
  }
  return target;
}

function summarizeSkillFolder(slug: string): string {
  const skillDir = resolveSkillDirCandidates(path.join("skills", slug)).find((candidate) => fs.existsSync(candidate));
  if (!skillDir) {
    return "No local skill folder found. Use database metadata only.";
  }

  const parts: string[] = [];
  const skillMdPath = resolveSkillManifestPath(skillDir);
  if (skillMdPath) {
    parts.push(
      `${path.basename(skillMdPath)} excerpt:\n${truncateText(fs.readFileSync(skillMdPath, "utf8"), MAX_REFERENCE_SNIPPET_CHARS)}`,
    );
  }

  const schemaDir = path.join(skillDir, "schemas");
  if (fs.existsSync(schemaDir)) {
    const schemaFiles = fs
      .readdirSync(schemaDir)
      .filter((file) => file.endsWith(".json"))
      .slice(0, 6);
    if (schemaFiles.length > 0) {
      parts.push(`Schema files: ${schemaFiles.join(", ")}`);
    }
  }

  for (const relativeCodePath of ["python/skill.py", "js/skill.js"]) {
    const codePath = path.join(skillDir, relativeCodePath);
    if (fs.existsSync(codePath)) {
      parts.push(
        `${relativeCodePath} excerpt:\n${truncateText(fs.readFileSync(codePath, "utf8"), 2200)}`,
      );
      break;
    }
  }

  const testsPath = path.join(skillDir, "tests", "tests.json");
  if (fs.existsSync(testsPath)) {
    parts.push(`tests/tests.json excerpt:\n${truncateText(fs.readFileSync(testsPath, "utf8"), 1800)}`);
  }

  return parts.join("\n\n");
}

function summarizeZipReference(fileName: string, base64Content: string): string {
  const buffer = Buffer.from(base64Content, "base64");
  const zip = new AdmZip(buffer);
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .slice(0, MAX_ZIP_FILES);

  const sections: string[] = [`ZIP reference: ${fileName}`, `Files included: ${entries.map((entry) => entry.entryName).join(", ")}`];
  let usedChars = sections.join("\n").length;

  for (const entry of entries) {
    if (usedChars >= MAX_ZIP_TEXT_CHARS) break;
    const ext = path.extname(entry.entryName).toLowerCase();
    if (![".md", ".txt", ".json", ".py", ".js", ".yaml", ".yml"].includes(ext)) continue;

    const content = truncateText(entry.getData().toString("utf8"), 1800);
    if (!content) continue;
    sections.push(`File: ${entry.entryName}\n${content}`);
    usedChars = sections.join("\n\n").length;
  }

  return truncateText(sections.join("\n\n"), MAX_ZIP_TEXT_CHARS);
}

async function buildReferenceContext(
  userId: number,
  isAdmin: boolean,
  input: SkillStudioRequest,
): Promise<string> {
  const accessibleSkills = await getAccessibleSkillsMap(userId, isAdmin);
  const sections: string[] = [];

  if (input.cloneFromSkillId) {
    const cloneSkill = accessibleSkills.get(input.cloneFromSkillId);
    if (!cloneSkill) {
      throw new Error("Clone source skill is not accessible");
    }
    sections.push(
      [
        `Clone baseline: ${cloneSkill.name} (${cloneSkill.slug})`,
        truncateText(cloneSkill.description || "", 1200),
        summarizeSkillFolder(cloneSkill.slug),
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  const uniqueReferenceIds = Array.from(new Set(input.referenceSkillIds || []))
    .filter((id) => id !== input.cloneFromSkillId)
    .slice(0, 4);

  for (const referenceId of uniqueReferenceIds) {
    const referenceSkill = accessibleSkills.get(referenceId);
    if (!referenceSkill) {
      throw new Error("One or more reference skills are not accessible");
    }
    sections.push(
      [
        `Reference skill: ${referenceSkill.name} (${referenceSkill.slug})`,
        truncateText(referenceSkill.description || "", 1200),
        summarizeSkillFolder(referenceSkill.slug),
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }

  if (input.zipBase64 && input.zipFileName) {
    sections.push(summarizeZipReference(input.zipFileName, input.zipBase64));
  }

  return sections.join("\n\n---\n\n");
}

async function buildStudioBrief(
  userId: number,
  isAdmin: boolean,
  input: SkillStudioRequest,
  targetSkill: AccessibleSkill | null,
): Promise<string> {
  const sections: string[] = [];

  if (input.mode === "create") {
    sections.push("Goal: create a brand-new SmartSpecPro skill that fits the current skill system.");
  } else if (targetSkill) {
    sections.push(
      `Goal: improve the existing skill "${targetSkill.name}" (${targetSkill.slug}) while preserving current working behavior unless the new request explicitly changes it.`,
    );
    sections.push(
      [
        `Current target summary`,
        `Name: ${targetSkill.name}`,
        `Slug: ${targetSkill.slug}`,
        targetSkill.description ? `Description: ${targetSkill.description}` : "",
        summarizeSkillFolder(targetSkill.slug),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (input.brief.trim()) {
    sections.push(`Primary request:\n${truncateText(input.brief, MAX_TEXT_BLOCK_CHARS)}`);
  }

  if (input.specText?.trim()) {
    sections.push(`Inline spec:\n${truncateText(input.specText, MAX_TEXT_BLOCK_CHARS)}`);
  }

  if (input.specFileContent?.trim()) {
    sections.push(
      `Spec file${input.specFileName ? ` (${input.specFileName})` : ""}:\n${truncateText(input.specFileContent, MAX_TEXT_BLOCK_CHARS)}`,
    );
  }

  const referenceContext = await buildReferenceContext(userId, isAdmin, input);
  if (referenceContext) {
    sections.push(`Reference materials:\n${referenceContext}`);
  }

  if (input.mode === "create") {
    sections.push(
      "Creation requirements:\n- Generate a complete skill usable in the current SmartSpecPro runtime\n- Prefer compatibility with existing categories, execution modes, schemas, and tests\n- Reuse the reference style and structure where it helps, but adapt it to current platform conventions",
    );
  } else {
    sections.push(
      "Improvement requirements:\n- Implement the requested fixes or new capability\n- Keep folder structure and runtime compatibility intact\n- Favor precise changes that preserve existing behavior\n- Update tests and docs only when needed to support the requested change",
    );
  }

  return sections.join("\n\n");
}

function extractCreatedSkillSlug(result: SkillExecutionResult): string | null {
  const skillPath = String(result.metadata?.skillPath || result.metadata?.skill_path || "").trim();
  if (skillPath) {
    return path.basename(skillPath);
  }

  const message = result.message || "";
  const locationMatch = message.match(/Location:\s*`?([^`\n]+)`?/i);
  if (locationMatch?.[1]) {
    return path.basename(locationMatch[1].trim());
  }

  const nameMatch = message.match(/Skill `([^`]+)` created successfully/i);
  if (nameMatch?.[1]) {
    return nameMatch[1].trim();
  }

  return null;
}

function extractSavedProposalFiles(result: SkillExecutionResult): string[] {
  const fromMetadata = Array.isArray(result.metadata?.savedProposals)
    ? result.metadata?.savedProposals
    : Array.isArray(result.metadata?.saved_proposals)
      ? result.metadata?.saved_proposals
      : [];

  const cleanedFromMetadata = (fromMetadata || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (cleanedFromMetadata.length > 0) {
    return cleanedFromMetadata;
  }

  const message = result.message || "";
  const matches = Array.from(message.matchAll(/`([^`]+\.diff)`/g)).map((match) => match[1]);
  return matches;
}

export async function applyIscProposalDiff(skillName: string, diffFile: string): Promise<{ output: string }> {
  const fsp = await import("fs/promises");
  const { spawnSync } = await import("child_process");

  const diffPath = path.resolve(ISC_PROPOSALS_ROOT, skillName, diffFile);
  const resolvedDiff = path.resolve(diffPath);
  if (!resolvedDiff.startsWith(ISC_PROPOSALS_ROOT)) {
    throw new Error("Invalid diff path");
  }

  const diffContent = await fsp.readFile(resolvedDiff, "utf8").catch(() => null);
  if (!diffContent) {
    throw new Error(`Diff file not found: ${diffFile}`);
  }

  const result = spawnSync("patch", ["-N", "-r", "-", "-p0"], {
    input: diffContent,
    encoding: "utf8",
    cwd: ISC_ROOT,
  });

  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || "patch failed").trim();
    throw new Error(msg);
  }

  await syncSingleSkillIfChanged(skillName);
  await refreshSkillCache();

  return { output: (result.stdout || "").trim() };
}

async function syncCreatedSkillRecord(
  userId: number,
  desiredVisibility: DesiredVisibility,
  createdSlug: string,
): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await syncSingleSkillIfChanged(createdSlug);

  const [row] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(eq(skills.slug, createdSlug))
    .limit(1);

  if (!row) {
    return null;
  }

  await db
    .update(skills)
    .set({
      createdBy: userId,
      importSource: "isc-studio",
      visibility: desiredVisibility,
      requestedPublishAt: desiredVisibility === "pending_approval" ? new Date() : null,
      approvedBy: desiredVisibility === "public" ? userId : null,
      approvedAt: desiredVisibility === "public" ? new Date() : null,
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(skills.id, row.id));

  await setSkillVisibility(userId, row.id, true);
  await refreshSkillCache();

  return row.id;
}

async function updateSkillVisibilityForReview(
  skillId: number,
  visibility: DesiredVisibility,
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .update(skills)
    .set({
      visibility,
      requestedPublishAt: visibility === "pending_approval" ? new Date() : null,
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(skills.id, skillId));
}

export async function launchSkillStudioTask(
  ctx: SkillStudioLaunchContext,
  input: SkillStudioRequest,
): Promise<SkillStudioLaunchResult> {
  const isAdmin = ctx.userRole === "admin";
  if (input.llmGatewayMode === "custom") {
    if (!input.llmBaseUrl?.trim()) {
      throw new Error("Custom endpoint requires a base URL");
    }
    if (!input.llmModel?.trim()) {
      throw new Error("Custom endpoint requires a model");
    }
    if (!input.llmApiKey?.trim()) {
      throw new Error("Custom endpoint requires an API key");
    }
  }
  const targetSkill = await resolveOwnedTargetSkill(input, ctx.userId, isAdmin);
  const desiredVisibility = normalizeDesiredVisibility(input.desiredVisibility, isAdmin);
  const resolvedCreateSlug = input.mode === "create"
    ? await resolveUniqueCreateSlug(input.newSkillSlug, input.brief)
    : undefined;
  const instructionBrief = await buildStudioBrief(ctx.userId, isAdmin, input, targetSkill);

  const iscSkill = await getSkillByIdAsync("intelligence-skill-creator");
  if (!iscSkill) {
    throw new Error("Intelligence Skill Creator is not available");
  }

  const extraParams: Record<string, unknown> = {
    mode: input.mode,
    llm_gateway_mode: input.llmGatewayMode || "system",
    llm_model_search: input.llmModelSearch || undefined,
    llm_base_url: input.llmBaseUrl || undefined,
    llm_model: input.llmModel || undefined,
    llm_temperature: input.llmTemperature ?? 0,
    llm_timeout_s: input.llmTimeoutS ?? 180,
    llm: input.llmGatewayMode === "custom"
      ? {
          base_url: input.llmBaseUrl || undefined,
          api_key: input.llmApiKey || undefined,
          model: input.llmModel || undefined,
          temperature: input.llmTemperature ?? 0,
          timeout_s: input.llmTimeoutS ?? 180,
        }
      : undefined,
  };

  if (input.mode === "create") {
    extraParams.description = instructionBrief;
    extraParams.skill_name = resolvedCreateSlug;
    extraParams.skill_language = input.skillLanguage || "auto";
    extraParams.complexity = input.complexity || "moderate";
  } else {
    extraParams.skill_name = targetSkill?.slug;
    extraParams.rounds = input.rounds ?? 3;
    extraParams.allow_test_expansion = input.allowTestExpansion ?? false;
    extraParams.ask_user = input.askUser ?? false;
    extraParams.improvement_request = instructionBrief;
  }

  const executionToken = ctx.userToken || createSkillExecutionToken(ctx.userId);
  const { taskId } = await startPythonSkillTask(
    iscSkill,
    {
      prompt: instructionBrief,
      extraParams,
      publicUrl: ctx.publicUrl || undefined,
    },
    ctx.userId,
    executionToken,
    async (result) => {
      if (!result.success) {
        return result;
      }

      if (input.mode === "create") {
        const createdSlug = extractCreatedSkillSlug(result);
        if (!createdSlug) {
          return {
            ...result,
            message: `${result.message || ""}\n\n⚠️ Skill files were generated but the new skill could not be synced to the database automatically.`,
          };
        }

        const skillId = await syncCreatedSkillRecord(ctx.userId, desiredVisibility, createdSlug);
        if (!skillId) {
          return {
            ...result,
            message: `${result.message || ""}\n\n⚠️ Skill files were generated, but no database record was found for ${createdSlug}.`,
          };
        }

        return {
          ...result,
          message: `${result.message || ""}\n\n✅ Skill synced to the Skills library (id: ${skillId}, visibility: ${desiredVisibility}).`,
          metadata: {
            ...(result.metadata || {}),
            syncedSkillId: skillId,
            syncedSkillSlug: createdSlug,
            desiredVisibility,
          },
        };
      }

      const proposalFiles = extractSavedProposalFiles(result);
      const latest = proposalFiles.length > 0 ? proposalFiles[proposalFiles.length - 1] : null;
      const latestDiffFile = latest ? path.basename(latest) : null;

      if (!isAdmin && latestDiffFile && targetSkill) {
        const applied = await applyIscProposalDiff(targetSkill.slug, latestDiffFile);
        await updateSkillVisibilityForReview(targetSkill.id, desiredVisibility);
        return {
          ...result,
          message: `${result.message || ""}\n\n✅ Changes applied to your skill.\n${desiredVisibility === "pending_approval" ? "The updated skill has been submitted for admin review." : "The updated skill remains private."}\n${applied.output}`.trim(),
          metadata: {
            ...(result.metadata || {}),
            appliedProposal: latestDiffFile,
            savedProposals: proposalFiles,
            desiredVisibility,
          },
        };
      }

      if (isAdmin && input.autoApplyProposal && proposalFiles.length > 0) {
        const diffFile = latestDiffFile!;
        const applied = await applyIscProposalDiff(targetSkill!.slug, diffFile);
        return {
          ...result,
          message: `${result.message || ""}\n\n✅ Latest proposal applied automatically.\n${applied.output}`.trim(),
          metadata: {
            ...(result.metadata || {}),
            appliedProposal: diffFile,
            savedProposals: proposalFiles,
          },
        };
      }

      return {
        ...result,
        message: `${result.message || ""}\n\n${isAdmin ? "Review and apply the generated proposal from the ISC proposal queue if needed." : "Proposal submitted for admin review in the ISC proposal queue."}`.trim(),
        metadata: {
          ...(result.metadata || {}),
          savedProposals: proposalFiles,
        },
      };
    },
  );

  return {
    taskId,
    mode: input.mode,
    summary: truncateText(input.mode === "create" ? `${resolvedCreateSlug}: ${instructionBrief}` : instructionBrief, 1200),
  };
}

export async function readIscProposalContent(skillName: string, diffFile: string): Promise<string> {
  const proposalPath = path.resolve(ISC_PROPOSALS_ROOT, skillName, diffFile);
  const resolvedPath = path.resolve(proposalPath);
  if (!resolvedPath.startsWith(ISC_PROPOSALS_ROOT)) {
    throw new Error("Invalid diff path");
  }
  return fs.readFileSync(resolvedPath, "utf8");
}

export async function listIscProposalsWithOwners(): Promise<Array<{
  skillName: string;
  diffFile: string;
  diffRelPath: string;
  createdAt: string;
  round: number;
  ownerId: number | null;
  ownerName: string | null;
}>> {
  const fsp = await import("fs/promises");
  const db = await getDb();

  let skillDirs: string[] = [];
  try {
    skillDirs = await fsp.readdir(ISC_PROPOSALS_ROOT);
  } catch {
    return [];
  }

  const proposals: Array<{
    skillName: string;
    diffFile: string;
    diffRelPath: string;
    createdAt: string;
    round: number;
    ownerId: number | null;
    ownerName: string | null;
  }> = [];

  const ownerRows = db && skillDirs.length > 0
    ? await db
        .select({
          id: skills.id,
          slug: skills.slug,
          createdBy: skills.createdBy,
        })
        .from(skills)
        .where(inArray(skills.slug, skillDirs))
    : [];

  const ownerMap = new Map(ownerRows.map((row) => [row.slug, row.createdBy]));

  for (const skillName of skillDirs) {
    const skillDir = path.join(ISC_PROPOSALS_ROOT, skillName);
    const stat = await fsp.stat(skillDir).catch(() => null);
    if (!stat?.isDirectory()) continue;

    const files = (await fsp.readdir(skillDir)).filter((file) => file.endsWith(".diff"));
    for (const file of files) {
      const match = file.match(/^(\d{8}T?\d{6})_r(\d+)\.diff$/);
      proposals.push({
        skillName,
        diffFile: file,
        diffRelPath: path.join("skills", "intelligence-skill-creator", "runs", "proposals", skillName, file),
        createdAt: match ? match[1] : file,
        round: match ? parseInt(match[2], 10) : 0,
        ownerId: ownerMap.get(skillName) ?? null,
        ownerName: null,
      });
    }
  }

  if (!db) {
    return proposals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const ownerIds = Array.from(new Set(proposals.map((proposal) => proposal.ownerId).filter((value): value is number => typeof value === "number")));
  if (ownerIds.length === 0) {
    return proposals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const { users } = await import("../../drizzle/schema");
  const userRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, ownerIds));
  const userMap = new Map(userRows.map((row) => [row.id, row.name || null]));

  return proposals
    .map((proposal) => ({
      ...proposal,
      ownerName: proposal.ownerId ? userMap.get(proposal.ownerId) ?? null : null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
