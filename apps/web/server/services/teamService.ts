/**
 * Team Service — CRUD operations for assistant teams.
 *
 * Creates and manages teams (backed by agencies), member profiles,
 * and integrates with template instantiation.
 */

import { eq, and, sql, count } from "drizzle-orm";
import { getDb } from "../db";
import {
  agencies,
  agencyAgents,
  assistantTeams,
  assistantProfiles,
  assistantTeamTemplates,
  personaTemplates,
  teamRooms,
  type AssistantTeam,
  type AssistantProfile,
} from "../../drizzle/schema";
import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreateTeamMemberInput {
  personaId: string;
  displayName: string;
  nickname?: string;
  roleTitle?: string;
  genderStyle?: string;
  specialtyTags?: string[];
  preferredModelId?: string;
  modelSelectionPolicy?: "fixed" | "cost_optimized" | "quality_optimized" | "auto";
  instructions: string;
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
  genderStyle?: string;
  specialtyTags?: string[];
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
    agencyAgentId: string;
    displayName: string;
  }>;
}

export interface TeamWithMembers extends AssistantTeam {
  members: AssistantProfile[];
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

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateTeamInput(input: CreateTeamInput): void {
  if (!input.members || input.members.length < 1) {
    throw new Error("Team must have at least 1 member");
  }
  if (input.members.length > 10) {
    throw new Error("Team members must not exceed 10");
  }

  const leads = input.members.filter((m) => m.isLead);
  if (leads.length !== 1) {
    throw new Error("Team must have exactly one lead member");
  }

  for (const member of input.members) {
    if (!member.personaId?.trim()) {
      throw new Error("Every member must have a personaId");
    }
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

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createTeam(
  input: CreateTeamInput,
): Promise<CreateTeamResult> {
  validateTeamInput(input);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const agencyId = crypto.randomUUID();
  const teamId = crypto.randomUUID();
  const slug = generateTeamSlug(input.name);

  const memberResults: CreateTeamResult["members"] = [];

  await db.transaction(async (tx) => {
    // 1. Create backing agency
    await tx.insert(agencies).values({
      id: agencyId,
      tenantId: input.tenantId,
      slug,
      name: input.name,
      description: input.description ?? null,
      status: "active",
      createdBy: input.ownerUserId,
    });

    // 2. Create assistant team
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

    // 3. Create agents and profiles for each member
    for (let i = 0; i < input.members.length; i++) {
      const member = input.members[i];
      const agentId = crypto.randomUUID();
      const profileId = crypto.randomUUID();

      await tx.insert(agencyAgents).values({
        id: agentId,
        agencyId,
        name: member.displayName,
        description: member.roleTitle ?? null,
        instructions: member.instructions,
        model: member.preferredModelId ?? null,
        isEntryPoint: member.isLead,
        nodeType: "agent",
      });

      await tx.insert(assistantProfiles).values({
        id: profileId,
        tenantId: input.tenantId,
        teamId,
        agencyAgentId: agentId,
        personaId: member.personaId,
        displayName: member.displayName,
        nickname: member.nickname ?? null,
        roleTitle: member.roleTitle ?? null,
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
        agencyAgentId: agentId,
        displayName: member.displayName,
      });
    }
  });

  return { teamId, agencyId, members: memberResults };
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

  const teamConfig = (template.teamConfigJson as Record<string, unknown>) ?? {};
  const memberTemplates = (template.memberTemplateJson as Array<Record<string, unknown>>) ?? [];

  const members: CreateTeamMemberInput[] = memberTemplates.map(
    (mt, i) => ({
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

  await db.transaction(async (tx) => {
    // Update profile fields
    const profileUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.displayName !== undefined) profileUpdates.displayName = updates.displayName;
    if (updates.nickname !== undefined) profileUpdates.nickname = updates.nickname;
    if (updates.roleTitle !== undefined) profileUpdates.roleTitle = updates.roleTitle;
    if (updates.genderStyle !== undefined) profileUpdates.genderStyle = updates.genderStyle;
    if (updates.specialtyTags !== undefined) profileUpdates.specialtyTags = updates.specialtyTags;
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
    if (updates.instructions !== undefined || updates.model !== undefined) {
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
        .set({ isLead: true })
        .where(and(eq(assistantProfiles.id, profileId), eq(assistantProfiles.tenantId, tenantId)));
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
    .select()
    .from(assistantProfiles)
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
