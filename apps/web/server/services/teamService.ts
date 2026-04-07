/**
 * Team Service — CRUD operations for assistant teams.
 *
 * Creates and manages teams (backed by agencies), member profiles,
 * and integrates with template instantiation.
 */

import { eq, and, or, isNull, sql, count, getTableColumns, asc, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  agencies,
  agencyAgents,
  assistantTeams,
  assistantProfiles,
  assistantTeamTemplates,
  personaTemplates,
  teamRooms,
  workers,
  type AssistantTeam,
  type AssistantProfile,
  type PersonaTemplate,
} from "../../drizzle/schema";
import crypto from "crypto";
import { sanitizePersonaInput } from "./personaService";
import {
  buildBlueprintPersonaInput,
  findReusablePersonaForBlueprint,
  findTeamBlueprint,
  findTeamBlueprintMember,
  resolveLegacyTemplateBlueprintId,
} from "@shared/teamBlueprints";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TeamMemberKind = "assistant" | "human" | "external_connector";
export type TeamMemberRole =
  | "orchestrator"
  | "researcher"
  | "reviewer"
  | "publisher"
  | "specialist";

export interface CreateTeamMemberInput {
  memberKind?: TeamMemberKind;
  memberRole?: TeamMemberRole;
  personaId?: string;
  blueprintId?: string;
  blueprintMemberId?: string;
  humanUserId?: number;
  externalRef?: string;
  externalWorkerId?: string;
  externalConfigJson?: Record<string, unknown>;
  displayName: string;
  nickname?: string;
  roleTitle?: string;
  genderStyle?: string;
  specialtyTags?: string[];
  preferredModelId?: string;
  modelSelectionPolicy?: "fixed" | "cost_optimized" | "quality_optimized" | "auto";
  instructions?: string;
  isLead: boolean;
  isActive?: boolean;
  sortOrder?: number;
  toolPolicyJson?: Record<string, unknown>;
  approvalPolicyJson?: Record<string, unknown>;
  memoryPolicyJson?: Record<string, unknown>;
  visibilityPolicyJson?: Record<string, unknown>;
  preferredLanguage?: string;
}

export interface CreateTeamInput {
  tenantId: string;
  ownerUserId: number;
  name: string;
  description?: string;
  category?: string;
  defaultViewMode?: "transparent" | "milestone" | "summary";
  defaultSummaryMode?: string;
  defaultAutonomyLevel?: "manual" | "guided" | "autonomous";
  defaultModelId?: string;
  memoryPolicyJson?: Record<string, unknown>;
  artifactPolicyJson?: Record<string, unknown>;
  modelBudgetPolicy?: Record<string, unknown>;
  members: CreateTeamMemberInput[];
}

export interface UpdateTeamMemberInput {
  displayName?: string;
  nickname?: string;
  roleTitle?: string;
  memberRole?: TeamMemberRole;
  genderStyle?: string;
  specialtyTags?: string[];
  humanUserId?: number;
  externalRef?: string;
  externalWorkerId?: string | null;
  externalConfigJson?: Record<string, unknown>;
  preferredModelId?: string;
  modelSelectionPolicy?: "fixed" | "cost_optimized" | "quality_optimized" | "auto";
  instructions?: string;
  model?: string;
  isLead?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  toolPolicyJson?: Record<string, unknown>;
  approvalPolicyJson?: Record<string, unknown>;
  memoryPolicyJson?: Record<string, unknown>;
  visibilityPolicyJson?: Record<string, unknown>;
  preferredLanguage?: string;
}

export interface CreateTeamResult {
  teamId: string;
  agencyId: string;
  members: Array<{
    profileId: string;
    memberKind: TeamMemberKind;
    memberRole: TeamMemberRole;
    agencyAgentId: string | null;
    humanUserId: number | null;
    externalRef: string | null;
    externalWorkerId: string | null;
    displayName: string;
  }>;
}

export type TeamMemberRecord = AssistantProfile & {
  instructions: string | null;
  model: string | null;
};

export interface TeamWithMembers extends AssistantTeam {
  members: TeamMemberRecord[];
}

export interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  status: string | null;
  memberCount: number;
  createdAt: Date;
}

export interface BindableWorkerSummary {
  id: string;
  displayName: string;
  status: string;
  runtimeType: string;
  runtimeVersion: string;
  externalReference: string;
  teamId: string | null;
  lastSeenAt: Date | null;
  warningFlagsJson: string[];
  boundProfileCount: number;
  availableForBinding: boolean;
  bindingReason: string | null;
}

function normalizeExternalRef(externalRef: string): string {
  return externalRef.trim().toLowerCase();
}

function resolveMemberIdentityKey(member: CreateTeamMemberInput): string | null {
  const kind = resolveMemberKind(member);
  if (kind === "assistant") {
    if (member.personaId?.trim()) return `assistant:${member.personaId.trim()}`;
    if (member.blueprintId?.trim() && member.blueprintMemberId?.trim()) {
      return `assistant-blueprint:${member.blueprintId.trim()}:${member.blueprintMemberId.trim()}`;
    }
    return null;
  }
  if (kind === "human") {
    return member.humanUserId ? `human:${member.humanUserId}` : null;
  }
  if (member.externalWorkerId?.trim()) {
    return `external-worker:${member.externalWorkerId.trim()}`;
  }
  return member.externalRef?.trim() ? `external:${normalizeExternalRef(member.externalRef)}` : null;
}

export function assertDistinctMembers(members: CreateTeamMemberInput[]): void {
  const seen = new Set<string>();
  for (const member of members) {
    const identityKey = resolveMemberIdentityKey(member);
    if (!identityKey) continue;
    if (seen.has(identityKey)) {
      throw new Error("Team contains duplicate members");
    }
    seen.add(identityKey);
  }
}

function resolveMemberKind(member: Pick<CreateTeamMemberInput, "memberKind">): TeamMemberKind {
  return member.memberKind ?? "assistant";
}

function resolveMemberRole(member: Pick<CreateTeamMemberInput, "memberKind" | "memberRole" | "isLead">): TeamMemberRole {
  if (member.memberRole) return member.memberRole;
  if (resolveMemberKind(member) === "assistant" && member.isLead) {
    return "orchestrator";
  }
  return "specialist";
}

function validateTeamMember(member: CreateTeamMemberInput): void {
  const kind = resolveMemberKind(member);
  const role = resolveMemberRole(member);
  if (member.isLead && kind !== "assistant") {
    throw new Error("Only assistant members can be team lead");
  }
  if (role === "orchestrator" && kind !== "assistant") {
    throw new Error("Only assistant members can be orchestrator");
  }
  if (kind === "assistant") {
    const hasPersonaId = Boolean(member.personaId?.trim());
    const hasBlueprintRef = Boolean(member.blueprintId?.trim() && member.blueprintMemberId?.trim());
    if (!hasPersonaId && !hasBlueprintRef) {
      throw new Error("Every assistant member must have a personaId or blueprint reference");
    }
    if (!member.instructions?.trim()) {
      throw new Error("Every assistant member must have instructions");
    }
    if (hasBlueprintRef && !findTeamBlueprintMember(member.blueprintId!.trim(), member.blueprintMemberId!.trim())) {
      throw new Error("Assistant member references an unknown team blueprint member");
    }
    return;
  }
  if (kind === "human") {
    if (!member.humanUserId) {
      throw new Error("Every human member must have a humanUserId");
    }
    if (member.externalWorkerId) {
      throw new Error("Only external connector members can bind an external worker");
    }
    return;
  }
  if (!member.externalRef?.trim()) {
    throw new Error("Every external connector member must have an externalRef");
  }
  return;
}

function workerSupportsBoundConnector(worker: {
  runtimeType?: string | null;
  capabilitiesJson?: Record<string, unknown> | null;
}): boolean {
  if (worker.runtimeType === "openclaw_gateway") {
    return true;
  }
  const capabilityFlag = worker.capabilitiesJson && typeof worker.capabilitiesJson === "object"
    ? (worker.capabilitiesJson as Record<string, unknown>).supportsBoundConnector
    : undefined;
  return capabilityFlag === true;
}

async function assertExternalWorkerBinding(
  tx: DbTransaction,
  tenantId: string,
  ownerUserId: number,
  externalWorkerId: string | null | undefined,
): Promise<void> {
  if (!externalWorkerId?.trim()) {
    return;
  }

  const [worker] = await tx
    .select({
      id: workers.id,
      tenantId: workers.tenantId,
      runtimeType: workers.runtimeType,
      status: workers.status,
      registeredByUserId: workers.registeredByUserId,
      capabilitiesJson: workers.capabilitiesJson,
    })
    .from(workers)
    .where(and(eq(workers.id, externalWorkerId.trim()), eq(workers.tenantId, tenantId)))
    .limit(1);

  if (!worker) {
    throw new Error("Bound external worker was not found");
  }
  if (worker.registeredByUserId !== ownerUserId) {
    throw new Error("You can only bind your own personal workers");
  }
  if (!workerSupportsBoundConnector(worker)) {
    throw new Error("This worker runtime is not eligible for bound-connector flows");
  }
  if (worker.status === "disabled") {
    throw new Error("Disabled workers cannot be bound to external connectors");
  }
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateTeamInput(input: CreateTeamInput): void {
  if (!input.members || input.members.length < 1) {
    throw new Error("Team must have at least 1 member");
  }
  if (input.members.length > 10) {
    throw new Error("Team members must not exceed 10");
  }

  const assistantLeads = input.members.filter((m) => resolveMemberKind(m) === "assistant" && m.isLead);
  if (assistantLeads.length !== 1) {
    throw new Error("Team must have exactly one lead assistant member");
  }

  const assistantOrchestrators = input.members.filter(
    (m) => resolveMemberKind(m) === "assistant" && resolveMemberRole(m) === "orchestrator",
  );
  if (assistantOrchestrators.length > 1) {
    throw new Error("Team must not have more than one orchestrator assistant member");
  }

  assertDistinctMembers(input.members);

  for (const member of input.members) {
    validateTeamMember(member);
  }
}

// ─── Slug ───────────────────────────────────────────────────────────────────

export function generateTeamSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 80);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

type DbTransaction = any;

async function listReusablePersonasForOwner(
  tx: DbTransaction,
  ownerUserId: number,
  tenantId: string,
): Promise<Array<Pick<PersonaTemplate, "id" | "name" | "sourceTemplateIds" | "tone">>> {
  return tx
    .select({
      id: personaTemplates.id,
      name: personaTemplates.name,
      sourceTemplateIds: personaTemplates.sourceTemplateIds,
      tone: personaTemplates.tone,
    })
    .from(personaTemplates)
    .where(
      or(
        and(eq(personaTemplates.scope, "platform"), isNull(personaTemplates.tenantId)),
        and(eq(personaTemplates.scope, "tenant"), eq(personaTemplates.tenantId, tenantId)),
        and(eq(personaTemplates.scope, "user"), eq(personaTemplates.userId, ownerUserId)),
      ),
    );
}

async function resolveAssistantBlueprintMembers(
  tx: DbTransaction,
  input: CreateTeamInput,
  members: CreateTeamMemberInput[],
): Promise<CreateTeamMemberInput[]> {
  if (!members.some((member) => resolveMemberKind(member) === "assistant" && !member.personaId?.trim())) {
    return members;
  }

  const reusablePersonas = await listReusablePersonasForOwner(tx, input.ownerUserId, input.tenantId);

  const resolvedMembers: CreateTeamMemberInput[] = [];
  for (const member of members) {
    if (resolveMemberKind(member) !== "assistant" || member.personaId?.trim()) {
      resolvedMembers.push(member);
      continue;
    }

    const blueprintId = member.blueprintId?.trim();
    const blueprintMemberId = member.blueprintMemberId?.trim();
    if (!blueprintId || !blueprintMemberId) {
      throw new Error(`Assistant member ${member.displayName} is missing a persona blueprint reference`);
    }

    const blueprintMember = findTeamBlueprintMember(blueprintId, blueprintMemberId);
    if (!blueprintMember) {
      throw new Error(`Unknown blueprint member ${blueprintId}/${blueprintMemberId}`);
    }

    const reusablePersona = findReusablePersonaForBlueprint(reusablePersonas, blueprintMember.persona);
    if (reusablePersona) {
      resolvedMembers.push({
        ...member,
        personaId: reusablePersona.id,
      });
      continue;
    }

    const sanitizedPersona = sanitizePersonaInput({
      ...buildBlueprintPersonaInput(blueprintMember.persona),
      userId: input.ownerUserId,
      tenantId: input.tenantId,
      provisionedByBlueprintId: blueprintId,
      provisionedByBlueprintMemberId: blueprintMemberId,
    });

    const [createdPersona] = await tx
      .insert(personaTemplates)
      .values({
        name: sanitizedPersona.name,
        description: sanitizedPersona.description,
        assistantNickname: sanitizedPersona.assistantNickname || null,
        assistantGender: sanitizedPersona.assistantGender || "neutral",
        workingHours: sanitizedPersona.workingHours || null,
        sourceTemplateIds: sanitizedPersona.sourceTemplateIds || [],
        sourceTemplateLabels: sanitizedPersona.sourceTemplateLabels || [],
        sourceTemplateCategories: sanitizedPersona.sourceTemplateCategories || [],
        systemPromptPrefix: sanitizedPersona.systemPromptPrefix,
        tone: sanitizedPersona.tone,
        language: sanitizedPersona.language || "auto",
        responseStyle: sanitizedPersona.responseStyle || {},
        restrictions: sanitizedPersona.restrictions || [],
        scope: sanitizedPersona.scope,
        tenantId: sanitizedPersona.tenantId || null,
        userId: sanitizedPersona.userId || null,
        isDefault: sanitizedPersona.isDefault || false,
        provisionedByBlueprintId: sanitizedPersona.provisionedByBlueprintId || null,
        provisionedByBlueprintMemberId: sanitizedPersona.provisionedByBlueprintMemberId || null,
      })
      .returning();

    reusablePersonas.push({
      id: createdPersona.id,
      name: createdPersona.name,
      sourceTemplateIds: createdPersona.sourceTemplateIds,
      tone: createdPersona.tone,
    });

    resolvedMembers.push({
      ...member,
      personaId: createdPersona.id,
    });
  }

  return resolvedMembers;
}

async function assertNoDuplicateMemberInTeam(
  tx: DbTransaction,
  teamId: string,
  member: CreateTeamMemberInput,
  excludeProfileId?: string,
): Promise<void> {
  const kind = resolveMemberKind(member);
  let rows: Array<{ id: string }> = [];

  if (kind === "assistant" && member.personaId?.trim()) {
    rows = await tx
      .select({ id: assistantProfiles.id })
      .from(assistantProfiles)
      .where(
        and(
          eq(assistantProfiles.teamId, teamId),
          eq(assistantProfiles.memberKind, "assistant"),
          eq(assistantProfiles.personaId, member.personaId.trim()),
          excludeProfileId ? sql`${assistantProfiles.id} != ${excludeProfileId}` : sql`true`,
        ),
      )
      .limit(1);
  } else if (kind === "human" && member.humanUserId) {
    rows = await tx
      .select({ id: assistantProfiles.id })
      .from(assistantProfiles)
      .where(
        and(
          eq(assistantProfiles.teamId, teamId),
          eq(assistantProfiles.memberKind, "human"),
          eq(assistantProfiles.humanUserId, member.humanUserId),
          excludeProfileId ? sql`${assistantProfiles.id} != ${excludeProfileId}` : sql`true`,
        ),
      )
      .limit(1);
  } else if (kind === "external_connector" && member.externalRef?.trim()) {
    if (member.externalWorkerId?.trim()) {
      rows = await tx
        .select({ id: assistantProfiles.id })
        .from(assistantProfiles)
        .where(
          and(
            eq(assistantProfiles.teamId, teamId),
            eq(assistantProfiles.memberKind, "external_connector"),
            eq(assistantProfiles.externalWorkerId, member.externalWorkerId.trim()),
            excludeProfileId ? sql`${assistantProfiles.id} != ${excludeProfileId}` : sql`true`,
          ),
        )
        .limit(1);
    } else {
      const normalizedExternalRef = normalizeExternalRef(member.externalRef);
      rows = await tx
        .select({ id: assistantProfiles.id })
        .from(assistantProfiles)
        .where(
          and(
            eq(assistantProfiles.teamId, teamId),
            eq(assistantProfiles.memberKind, "external_connector"),
            sql`lower(${assistantProfiles.externalRef}) = ${normalizedExternalRef}`,
            excludeProfileId ? sql`${assistantProfiles.id} != ${excludeProfileId}` : sql`true`,
          ),
        )
        .limit(1);
    }
  }

  if (rows.length > 0) {
    throw new Error("This member is already in the team");
  }
}

async function createTeamRecords(
  tx: DbTransaction,
  input: CreateTeamInput,
): Promise<CreateTeamResult> {
  const agencyId = crypto.randomUUID();
  const teamId = crypto.randomUUID();
  const slug = generateTeamSlug(input.name);
  const memberResults: CreateTeamResult["members"] = [];

  const resolvedMembers = await resolveAssistantBlueprintMembers(tx, input, input.members);
  assertDistinctMembers(resolvedMembers);

  await tx.insert(agencies).values({
    id: agencyId,
    tenantId: input.tenantId,
    slug,
    name: input.name,
    description: input.description ?? null,
    status: "active",
    createdBy: input.ownerUserId,
  });

  await tx.insert(assistantTeams).values({
    id: teamId,
    tenantId: input.tenantId,
    ownerUserId: input.ownerUserId,
    agencyId,
    name: input.name,
    description: input.description ?? null,
    category: input.category ?? null,
    defaultViewMode: input.defaultViewMode ?? "transparent",
    defaultSummaryMode: input.defaultSummaryMode ?? null,
    defaultAutonomyLevel: input.defaultAutonomyLevel ?? "guided",
    defaultModelId: input.defaultModelId ?? null,
    memoryPolicyJson: input.memoryPolicyJson ?? null,
    artifactPolicyJson: input.artifactPolicyJson ?? null,
    modelBudgetPolicy: input.modelBudgetPolicy ?? null,
    status: "draft",
  });

  for (let i = 0; i < resolvedMembers.length; i++) {
    const member = resolvedMembers[i];
    const memberKind = resolveMemberKind(member);
    const memberRole = resolveMemberRole(member);
    const agentId = memberKind === "assistant" ? crypto.randomUUID() : null;
    const profileId = crypto.randomUUID();

    if (memberKind === "external_connector") {
      await assertExternalWorkerBinding(
        tx as DbTransaction,
        input.tenantId,
        input.ownerUserId,
        member.externalWorkerId ?? null,
      );
    }

    if (memberKind === "assistant") {
      await tx.insert(agencyAgents).values({
        id: agentId!,
        agencyId,
        name: member.displayName,
        description: member.roleTitle ?? null,
        instructions: member.instructions!,
        model: member.preferredModelId ?? null,
        isEntryPoint: member.isLead,
        nodeType: "agent",
      });
    }

    await tx.insert(assistantProfiles).values({
      id: profileId,
      tenantId: input.tenantId,
      teamId,
      memberKind,
      agencyAgentId: agentId,
      personaId: memberKind === "assistant" ? member.personaId ?? null : null,
      humanUserId: memberKind === "human" ? member.humanUserId ?? null : null,
      externalRef:
        memberKind === "external_connector" && member.externalRef
          ? normalizeExternalRef(member.externalRef)
          : null,
      externalWorkerId:
        memberKind === "external_connector" ? member.externalWorkerId?.trim() ?? null : null,
      externalConfigJson: memberKind === "external_connector" ? member.externalConfigJson ?? null : null,
      displayName: member.displayName,
      nickname: member.nickname ?? null,
      roleTitle: member.roleTitle ?? null,
      memberRole,
      genderStyle: member.genderStyle ?? null,
      specialtyTags: member.specialtyTags ?? null,
      preferredModelId: member.preferredModelId ?? null,
      modelSelectionPolicy: member.modelSelectionPolicy ?? "auto",
      toolPolicyJson: member.toolPolicyJson ?? null,
      approvalPolicyJson: member.approvalPolicyJson ?? null,
      memoryPolicyJson: member.memoryPolicyJson ?? null,
      visibilityPolicyJson: member.visibilityPolicyJson ?? null,
      preferredLanguage: member.preferredLanguage ?? null,
      sortOrder: member.sortOrder ?? i,
      isLead: member.isLead,
      isActive: member.isActive ?? true,
    });

    memberResults.push({
      profileId,
      memberKind,
      memberRole,
      agencyAgentId: agentId,
      humanUserId: memberKind === "human" ? member.humanUserId ?? null : null,
      externalRef:
        memberKind === "external_connector" && member.externalRef
          ? normalizeExternalRef(member.externalRef)
          : null,
      externalWorkerId:
        memberKind === "external_connector" ? member.externalWorkerId?.trim() ?? null : null,
      displayName: member.displayName,
    });
  }

  return { teamId, agencyId, members: memberResults };
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createTeam(
  input: CreateTeamInput,
): Promise<CreateTeamResult> {
  validateTeamInput(input);

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction((tx) => createTeamRecords(tx as DbTransaction, input));
}

export async function createTeamFromBlueprint(
  blueprintId: string,
  tenantId: string,
  ownerUserId: number,
  overrides?: Partial<CreateTeamInput>,
): Promise<CreateTeamResult> {
  const blueprint = findTeamBlueprint(blueprintId);
  if (!blueprint) {
    throw new Error(`Blueprint ${blueprintId} not found`);
  }

  const input: CreateTeamInput = {
    tenantId,
    ownerUserId,
    name: overrides?.name ?? blueprint.defaultTeamName,
    description: overrides?.description ?? blueprint.defaultTeamDescription,
    category: overrides?.category ?? blueprint.category,
    members: overrides?.members ?? blueprint.members.map((member) => ({
      memberKind: "assistant" as const,
      memberRole: member.memberRole,
      blueprintId: blueprint.id,
      blueprintMemberId: member.id,
      displayName: member.displayName,
      roleTitle: member.roleTitle,
      specialtyTags: member.specialtyTags,
      instructions: member.instructions,
      isLead: Boolean(member.isLead),
    })),
  };

  return createTeam(input);
}

export async function createFromTemplate(
  templateId: string,
  tenantId: string,
  ownerUserId: number,
  overrides?: Partial<CreateTeamInput>,
): Promise<CreateTeamResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [template] = await db
    .select()
    .from(assistantTeamTemplates)
    .where(eq(assistantTeamTemplates.id, templateId))
    .limit(1);

  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }

  // Verify access: either same tenant or platform template
  if (template.tenantId && template.tenantId !== tenantId) {
    throw new Error("Template not accessible for this tenant");
  }

  const mappedBlueprintId = resolveLegacyTemplateBlueprintId(template.id);
  if (mappedBlueprintId) {
    return createTeamFromBlueprint(mappedBlueprintId, tenantId, ownerUserId, {
      name: overrides?.name ?? template.name,
      description: overrides?.description ?? template.description ?? undefined,
      category: overrides?.category ?? template.category ?? undefined,
      defaultViewMode: overrides?.defaultViewMode,
      defaultAutonomyLevel: overrides?.defaultAutonomyLevel,
      defaultModelId: overrides?.defaultModelId,
    });
  }

  const teamConfig = (template.teamConfigJson as Record<string, unknown>) ?? {};
  const memberTemplates = (template.memberTemplateJson as Array<Record<string, unknown>>) ?? [];

  if (memberTemplates.some((memberTemplate) => !(memberTemplate.personaId as string | undefined)?.trim())) {
    throw new Error(`Template ${template.id} must be migrated to a team blueprint before it can be cloned`);
  }

  const members: CreateTeamMemberInput[] = memberTemplates.map(
    (mt, i) => ({
      memberKind: "assistant",
      memberRole: (mt.memberRole as TeamMemberRole) ?? ((mt.isLead as boolean) ? "orchestrator" : "specialist"),
      personaId: (mt.personaId as string) ?? "",
      displayName: (mt.role as string) ?? `Agent ${i + 1}`,
      roleTitle: (mt.role as string) ?? undefined,
      isLead: (mt.isLead as boolean) ?? false,
      instructions: (mt.instructions as string) ?? `You are a ${mt.role ?? "team member"}.`,
      specialtyTags: (mt.specialty as string[]) ?? undefined,
      modelSelectionPolicy: (mt.modelPolicy as any) ?? "auto",
    }),
  );

  const input: CreateTeamInput = {
    tenantId,
    ownerUserId,
    ...overrides,
    name: overrides?.name ?? template.name,
    description: overrides?.description ?? template.description ?? undefined,
    category: overrides?.category ?? template.category ?? undefined,
    defaultViewMode: (teamConfig.defaultViewMode as any) ?? "transparent",
    members: overrides?.members ?? members,
  };

  return createTeam(input);
}

export async function updateTeamMember(
  profileId: string,
  tenantId: string,
  updates: UpdateTeamMemberInput,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [profile] = await db
    .select()
    .from(assistantProfiles)
    .where(
      and(
        eq(assistantProfiles.id, profileId),
        eq(assistantProfiles.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!profile) {
    throw new Error(`Profile ${profileId} not found`);
  }

  if (updates.memberRole === "orchestrator" && profile.memberKind !== "assistant") {
    throw new Error("Only assistant members can be orchestrator");
  }

  await db.transaction(async (tx) => {
    const [team] = await tx
      .select({ ownerUserId: assistantTeams.ownerUserId })
      .from(assistantTeams)
      .where(and(eq(assistantTeams.id, profile.teamId), eq(assistantTeams.tenantId, tenantId)))
      .limit(1);
    if (!team) {
      throw new Error(`Team ${profile.teamId} not found`);
    }
    await assertNoDuplicateMemberInTeam(
      tx as DbTransaction,
      profile.teamId,
      {
        memberKind: profile.memberKind as TeamMemberKind,
        personaId: profile.personaId ?? undefined,
        humanUserId: updates.humanUserId ?? profile.humanUserId ?? undefined,
        externalRef: updates.externalRef ?? profile.externalRef ?? undefined,
        externalWorkerId: updates.externalWorkerId ?? profile.externalWorkerId ?? undefined,
        displayName: updates.displayName ?? profile.displayName ?? "Member",
        isLead: updates.isLead ?? profile.isLead,
        instructions: updates.instructions ?? "Follow team objectives",
      },
      profileId,
    );

    if (profile.memberKind === "external_connector") {
      await assertExternalWorkerBinding(
        tx as DbTransaction,
        tenantId,
        team.ownerUserId,
        updates.externalWorkerId ?? profile.externalWorkerId ?? null,
      );
    }

    // Update profile fields
    const profileUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.displayName !== undefined) profileUpdates.displayName = updates.displayName;
    if (updates.nickname !== undefined) profileUpdates.nickname = updates.nickname;
    if (updates.roleTitle !== undefined) profileUpdates.roleTitle = updates.roleTitle;
    if (updates.memberRole !== undefined) profileUpdates.memberRole = updates.memberRole;
    if (updates.genderStyle !== undefined) profileUpdates.genderStyle = updates.genderStyle;
    if (updates.specialtyTags !== undefined) profileUpdates.specialtyTags = updates.specialtyTags;
    if (updates.humanUserId !== undefined) profileUpdates.humanUserId = updates.humanUserId;
    if (updates.externalRef !== undefined) profileUpdates.externalRef = normalizeExternalRef(updates.externalRef);
    if (updates.externalWorkerId !== undefined) {
      profileUpdates.externalWorkerId = updates.externalWorkerId?.trim() ? updates.externalWorkerId.trim() : null;
    }
    if (updates.externalConfigJson !== undefined) profileUpdates.externalConfigJson = updates.externalConfigJson;
    if (updates.preferredModelId !== undefined) profileUpdates.preferredModelId = updates.preferredModelId;
    if (updates.modelSelectionPolicy !== undefined) profileUpdates.modelSelectionPolicy = updates.modelSelectionPolicy;
    if (updates.sortOrder !== undefined) profileUpdates.sortOrder = updates.sortOrder;
    if (updates.isActive !== undefined) profileUpdates.isActive = updates.isActive;
    if (updates.toolPolicyJson !== undefined) profileUpdates.toolPolicyJson = updates.toolPolicyJson;
    if (updates.approvalPolicyJson !== undefined) profileUpdates.approvalPolicyJson = updates.approvalPolicyJson;
    if (updates.memoryPolicyJson !== undefined) profileUpdates.memoryPolicyJson = updates.memoryPolicyJson;
    if (updates.visibilityPolicyJson !== undefined) profileUpdates.visibilityPolicyJson = updates.visibilityPolicyJson;
    if (updates.preferredLanguage !== undefined) profileUpdates.preferredLanguage = updates.preferredLanguage;

    await tx
      .update(assistantProfiles)
      .set(profileUpdates)
      .where(and(eq(assistantProfiles.id, profileId), eq(assistantProfiles.tenantId, tenantId)));

    // Update agent-level fields if present
    if (profile.memberKind === "assistant" && profile.agencyAgentId && (updates.instructions !== undefined || updates.model !== undefined)) {
      const agentUpdates: Record<string, unknown> = {};
      if (updates.instructions !== undefined) agentUpdates.instructions = updates.instructions;
      if (updates.model !== undefined) agentUpdates.model = updates.model;

      await tx
        .update(agencyAgents)
        .set(agentUpdates)
        .where(eq(agencyAgents.id, profile.agencyAgentId));
    }

    // Handle lead transfer
    if (updates.isLead === true) {
      if (profile.memberKind !== "assistant") {
        throw new Error("Only assistant members can be team lead");
      }
      await tx
        .update(assistantProfiles)
        .set({ isLead: false, updatedAt: new Date() })
        .where(
          and(
            eq(assistantProfiles.teamId, profile.teamId),
            sql`${assistantProfiles.id} != ${profileId}`,
          ),
        );
      await tx
        .update(assistantProfiles)
        .set({
          isLead: true,
          memberRole: updates.memberRole ?? "orchestrator",
        })
        .where(and(eq(assistantProfiles.id, profileId), eq(assistantProfiles.tenantId, tenantId)));
    }

    if (profile.memberKind === "assistant" && updates.memberRole === "orchestrator") {
      await tx
        .update(assistantProfiles)
        .set({ memberRole: "specialist", updatedAt: new Date() })
        .where(
          and(
            eq(assistantProfiles.teamId, profile.teamId),
            eq(assistantProfiles.memberKind, "assistant"),
            sql`${assistantProfiles.id} != ${profileId}`,
            eq(assistantProfiles.memberRole, "orchestrator"),
          ),
        );
    }
  });
}

export async function archiveTeam(
  teamId: string,
  tenantId: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [team] = await db
    .select()
    .from(assistantTeams)
    .where(
      and(
        eq(assistantTeams.id, teamId),
        eq(assistantTeams.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!team) {
    throw new Error(`Team ${teamId} not found`);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(assistantTeams)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(assistantTeams.id, teamId), eq(assistantTeams.tenantId, tenantId)));

    // Also archive the backing agency
    await tx
      .update(agencies)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(agencies.id, team.agencyId));
  });
}

export async function addTeamMember(
  teamId: string,
  tenantId: string,
  member: CreateTeamMemberInput,
): Promise<{
  profileId: string;
  memberKind: TeamMemberKind;
  memberRole: TeamMemberRole;
  agencyAgentId: string | null;
  humanUserId: number | null;
  externalRef: string | null;
  externalWorkerId: string | null;
}> {
  validateTeamMember(member);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [team] = await db
    .select()
    .from(assistantTeams)
    .where(and(eq(assistantTeams.id, teamId), eq(assistantTeams.tenantId, tenantId)))
    .limit(1);

  if (!team) throw new Error(`Team ${teamId} not found`);

  // Count existing members for sort order
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(assistantProfiles)
    .where(eq(assistantProfiles.teamId, teamId));

  return db.transaction(async (tx) => {
    const [resolvedMember] = await resolveAssistantBlueprintMembers(
      tx as DbTransaction,
      {
        tenantId,
        ownerUserId: team.ownerUserId,
        name: team.name,
        description: team.description ?? undefined,
        members: [member],
      },
      [member],
    );
    await assertNoDuplicateMemberInTeam(tx as DbTransaction, teamId, resolvedMember);

    const resolvedMemberKind = resolveMemberKind(resolvedMember);
    const resolvedMemberRole = resolveMemberRole(resolvedMember);
    const agentId = resolvedMemberKind === "assistant" ? crypto.randomUUID() : null;
    const profileId = crypto.randomUUID();

    if (resolvedMemberKind === "external_connector") {
      await assertExternalWorkerBinding(
        tx as DbTransaction,
        tenantId,
        team.ownerUserId,
        resolvedMember.externalWorkerId ?? null,
      );
    }

    if (resolvedMemberKind === "assistant") {
      await tx.insert(agencyAgents).values({
        id: agentId!,
        agencyId: team.agencyId,
        name: resolvedMember.displayName,
        description: resolvedMember.roleTitle ?? null,
        instructions: resolvedMember.instructions!,
        model: resolvedMember.preferredModelId ?? null,
        isEntryPoint: resolvedMember.isLead,
        nodeType: "agent",
      });
    }

    await tx.insert(assistantProfiles).values({
      id: profileId,
      tenantId,
      teamId,
      memberKind: resolvedMemberKind,
      agencyAgentId: agentId,
      personaId: resolvedMemberKind === "assistant" ? resolvedMember.personaId ?? null : null,
      humanUserId: resolvedMemberKind === "human" ? resolvedMember.humanUserId ?? null : null,
      externalRef:
        resolvedMemberKind === "external_connector" && resolvedMember.externalRef
          ? normalizeExternalRef(resolvedMember.externalRef)
          : null,
      externalWorkerId:
        resolvedMemberKind === "external_connector" ? resolvedMember.externalWorkerId?.trim() ?? null : null,
      externalConfigJson: resolvedMemberKind === "external_connector" ? resolvedMember.externalConfigJson ?? null : null,
      displayName: resolvedMember.displayName,
      nickname: resolvedMember.nickname ?? null,
      roleTitle: resolvedMember.roleTitle ?? null,
      memberRole: resolvedMemberRole,
      genderStyle: resolvedMember.genderStyle ?? null,
      specialtyTags: resolvedMember.specialtyTags ?? null,
      preferredModelId: resolvedMember.preferredModelId ?? null,
      modelSelectionPolicy: resolvedMember.modelSelectionPolicy ?? "auto",
      preferredLanguage: resolvedMember.preferredLanguage ?? null,
      sortOrder: resolvedMember.sortOrder ?? Number(cnt),
      isLead: resolvedMember.isLead,
      isActive: resolvedMember.isActive ?? true,
    });

    // Handle lead transfer if new member is lead
    if (resolvedMember.isLead) {
      await tx
        .update(assistantProfiles)
        .set({ isLead: false, updatedAt: new Date() })
        .where(
          and(
            eq(assistantProfiles.teamId, teamId),
            sql`${assistantProfiles.id} != ${profileId}`,
          ),
        );
    }

    if (resolvedMemberKind === "assistant" && resolvedMemberRole === "orchestrator") {
      await tx
        .update(assistantProfiles)
        .set({ memberRole: "specialist", updatedAt: new Date() })
        .where(
          and(
            eq(assistantProfiles.teamId, teamId),
            eq(assistantProfiles.memberKind, "assistant"),
            sql`${assistantProfiles.id} != ${profileId}`,
            eq(assistantProfiles.memberRole, "orchestrator"),
          ),
        );
    }
    return {
      profileId,
      memberKind: resolvedMemberKind,
      memberRole: resolvedMemberRole,
      agencyAgentId: agentId,
      humanUserId: resolvedMemberKind === "human" ? resolvedMember.humanUserId ?? null : null,
      externalRef:
        resolvedMemberKind === "external_connector" && resolvedMember.externalRef
          ? normalizeExternalRef(resolvedMember.externalRef)
          : null,
      externalWorkerId:
        resolvedMemberKind === "external_connector" ? resolvedMember.externalWorkerId?.trim() ?? null : null,
    };
  });
}

export async function getTeam(
  teamId: string,
  tenantId: string,
): Promise<TeamWithMembers | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [team] = await db
    .select()
    .from(assistantTeams)
    .where(
      and(
        eq(assistantTeams.id, teamId),
        eq(assistantTeams.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!team) return null;

  const members = await db
    .select({
      ...getTableColumns(assistantProfiles),
      instructions: agencyAgents.instructions,
      model: agencyAgents.model,
    })
    .from(assistantProfiles)
    .leftJoin(agencyAgents, eq(assistantProfiles.agencyAgentId, agencyAgents.id))
    .where(eq(assistantProfiles.teamId, teamId))
    .orderBy(assistantProfiles.sortOrder);

  return { ...team, members };
}

export async function listTeams(
  tenantId: string,
  ownerUserId?: number,
  status?: string,
): Promise<TeamSummary[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(assistantTeams.tenantId, tenantId)];
  if (ownerUserId !== undefined) {
    conditions.push(eq(assistantTeams.ownerUserId, ownerUserId));
  }
  if (status) {
    conditions.push(sql`${assistantTeams.status} = ${status}`);
  }

  const teams = await db
    .select({
      id: assistantTeams.id,
      name: assistantTeams.name,
      description: assistantTeams.description,
      category: assistantTeams.category,
      status: assistantTeams.status,
      createdAt: assistantTeams.createdAt,
    })
    .from(assistantTeams)
    .where(and(...conditions))
    .orderBy(assistantTeams.createdAt);

  // Get member counts
  const teamIds = teams.map((t) => t.id);
  if (teamIds.length === 0) return [];

  const counts = await db
    .select({
      teamId: assistantProfiles.teamId,
      memberCount: count(),
    })
    .from(assistantProfiles)
    .where(sql`${assistantProfiles.teamId} IN (${sql.join(teamIds.map(id => sql`${id}`), sql`, `)})`)
    .groupBy(assistantProfiles.teamId);

  const countMap = new Map(counts.map((c) => [c.teamId, Number(c.memberCount)]));

  // Get room counts per team
  const roomCounts = teamIds.length > 0
    ? await db
        .select({
          teamId: teamRooms.teamId,
          roomCount: count(),
        })
        .from(teamRooms)
        .where(
          and(
            sql`${teamRooms.teamId} IN (${sql.join(teamIds.map(id => sql`${id}`), sql`, `)})`,
            eq(teamRooms.tenantId, tenantId),
          ),
        )
        .groupBy(teamRooms.teamId)
    : [];

  const roomCountMap = new Map(roomCounts.map((c) => [c.teamId, Number(c.roomCount)]));

  return teams.map((t) => ({
    ...t,
    memberCount: countMap.get(t.id) ?? 0,
    roomCount: roomCountMap.get(t.id) ?? 0,
  }));
}

export async function listBindableWorkers(
  tenantId: string,
  ownerUserId: number,
  teamId?: string | null,
): Promise<BindableWorkerSummary[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select({
      id: workers.id,
      displayName: workers.displayName,
      status: workers.status,
      runtimeType: workers.runtimeType,
      runtimeVersion: workers.runtimeVersion,
      externalReference: workers.externalReference,
      teamId: workers.teamId,
      registeredByUserId: workers.registeredByUserId,
      capabilitiesJson: workers.capabilitiesJson,
      lastSeenAt: workers.lastSeenAt,
      warningFlagsJson: workers.warningFlagsJson,
      boundProfileCount: count(assistantProfiles.id),
    })
    .from(workers)
    .leftJoin(
      assistantProfiles,
      and(
        eq(assistantProfiles.externalWorkerId, workers.id),
        eq(assistantProfiles.tenantId, tenantId),
      ),
    )
    .where(
      and(
        eq(workers.tenantId, tenantId),
        eq(workers.registeredByUserId, ownerUserId),
      ),
    )
    .groupBy(
      workers.id,
      workers.displayName,
      workers.status,
      workers.runtimeType,
      workers.runtimeVersion,
      workers.externalReference,
      workers.teamId,
      workers.registeredByUserId,
      workers.capabilitiesJson,
      workers.lastSeenAt,
      workers.warningFlagsJson,
    )
    .orderBy(desc(workers.lastSeenAt), asc(workers.displayName));

  return rows.map((row) => {
    const boundProfileCount = Number(row.boundProfileCount ?? 0);
    const isTeamCompatible = !row.teamId || !teamId || row.teamId === teamId;
    const isRuntimeEligible = workerSupportsBoundConnector(row);
    const bindingReason = !isRuntimeEligible
      ? "Runtime is not eligible for bound connector use yet"
      : row.status === "disabled"
        ? "Worker is disabled"
        : !isTeamCompatible
          ? "Worker is pinned to another team"
          : null;
    return {
      id: row.id,
      displayName: row.displayName,
      status: row.status,
      runtimeType: row.runtimeType,
      runtimeVersion: row.runtimeVersion,
      externalReference: row.externalReference,
      teamId: row.teamId ?? null,
      lastSeenAt: row.lastSeenAt ?? null,
      warningFlagsJson: Array.isArray(row.warningFlagsJson) ? row.warningFlagsJson : [],
      boundProfileCount,
      availableForBinding: !bindingReason,
      bindingReason,
    };
  });
}

export async function listTeamTemplates(tenantId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select({
      id: assistantTeamTemplates.id,
      name: assistantTeamTemplates.name,
      description: assistantTeamTemplates.description,
      category: assistantTeamTemplates.category,
      isSystem: assistantTeamTemplates.isSystem,
    })
    .from(assistantTeamTemplates)
    .where(
      or(
        isNull(assistantTeamTemplates.tenantId),
        eq(assistantTeamTemplates.tenantId, tenantId),
      ),
    )
    .orderBy(assistantTeamTemplates.name);
}
