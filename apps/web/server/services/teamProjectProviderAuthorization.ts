import { and, eq, inArray, sql } from "drizzle-orm";
import {
  assistantTeams,
  assistantProfiles,
  canonicalProjectMemberships,
  canonicalProjects,
  teamRoomParticipants,
  teamRuns,
  teamRooms,
} from "../../drizzle/schema";
import { getDb } from "../db";

export interface TeamProjectProviderContextBinding {
  version: "team-room-provider-context.v1";
  tenantId: string;
  roomId: string;
  teamId: string;
  userId: number;
  runId: string | null;
  historyScope: "room" | "run";
  /** Exact project binding observed on the server-owned team room. */
  projectId: string | null;
  /** Current association classification; this alone never authorizes memory. */
  projectAuthority: "canonical-member" | "room-only";
}

export class TeamProjectProviderAuthorizationError extends Error {
  readonly code = "TEAM_PROJECT_AUTHORIZATION_DENIED";

  constructor() {
    super("Team project context is no longer authorized");
    this.name = "TeamProjectProviderAuthorizationError";
  }
}

export interface TeamContextAuthorityInput {
  tenantId: string;
  roomId: string;
  teamId: string;
  userId: number;
  runId?: string | null;
}

/**
 * Reads the authenticated user's tenant, team, room, run, and canonical Project
 * authority in one database statement. It is an invocation binding, not a
 * reusable authorization proof; team-room prompt memory remains disabled
 * separately until its source provenance can be verified.
 */
async function readCurrentTeamProjectAuthority(
  input: TeamContextAuthorityInput,
): Promise<TeamProjectProviderContextBinding> {
  try {
    const db = await getDb();
    if (
      !db ||
      !input.tenantId ||
      !input.roomId ||
      !input.teamId ||
      !Number.isSafeInteger(input.userId) ||
      input.userId < 1
    ) {
      throw new TeamProjectProviderAuthorizationError();
    }

    const [row] = await db
      .select({
        tenantId: teamRooms.tenantId,
        roomId: teamRooms.id,
        teamId: teamRooms.teamId,
        roomStatus: teamRooms.status,
        orchestratorUserId: teamRooms.orchestratorUserId,
        projectId: teamRooms.projectId,
        participantUserId: teamRoomParticipants.participantUserId,
        activeTeamHumanUserId: assistantProfiles.humanUserId,
        teamRunId: teamRuns.id,
        canonicalProjectId: canonicalProjects.projectId,
        canonicalTenantId: canonicalProjects.tenantId,
        canonicalLifecycle: canonicalProjects.lifecycle,
        activeMembershipPrincipalId: canonicalProjectMemberships.principalId,
      })
      .from(teamRooms)
      .innerJoin(
        assistantTeams,
        and(
          eq(assistantTeams.id, teamRooms.teamId),
          eq(assistantTeams.tenantId, input.tenantId),
        ),
      )
      .innerJoin(
        teamRoomParticipants,
        and(
          eq(teamRoomParticipants.roomId, teamRooms.id),
          inArray(teamRoomParticipants.participantType, ["user", "observer"]),
          eq(teamRoomParticipants.participantUserId, input.userId)
        )
      )
      .leftJoin(
        assistantProfiles,
        and(
          eq(assistantProfiles.teamId, teamRooms.teamId),
          eq(assistantProfiles.tenantId, input.tenantId),
          eq(assistantProfiles.memberKind, "human"),
          eq(assistantProfiles.humanUserId, input.userId),
          eq(assistantProfiles.isActive, true),
        ),
      )
      .leftJoin(
        teamRuns,
        and(
          eq(teamRuns.id, input.runId ?? ""),
          eq(teamRuns.roomId, teamRooms.id),
          eq(teamRuns.teamId, teamRooms.teamId),
          eq(teamRuns.initiatedByUserId, input.userId),
        ),
      )
      .leftJoin(
        canonicalProjects,
        sql`${teamRooms.projectId}::text = ${canonicalProjects.projectId}`
      )
      .leftJoin(
        canonicalProjectMemberships,
        and(
          eq(canonicalProjectMemberships.tenantId, input.tenantId),
          eq(
            canonicalProjectMemberships.projectId,
            canonicalProjects.projectId
          ),
          eq(canonicalProjectMemberships.principalId, `user:${input.userId}`),
          eq(canonicalProjectMemberships.lifecycle, "ACTIVE")
        )
      )
      .where(
        and(
          eq(teamRooms.id, input.roomId),
          eq(teamRooms.tenantId, input.tenantId),
          eq(teamRooms.teamId, input.teamId)
        )
      )
      .limit(1);

    if (
      !row ||
      row.tenantId !== input.tenantId ||
      row.roomId !== input.roomId ||
      row.teamId !== input.teamId ||
      row.roomStatus !== "active" ||
      row.participantUserId !== input.userId ||
      (row.orchestratorUserId !== input.userId &&
        row.activeTeamHumanUserId !== input.userId) ||
      (input.runId != null && row.teamRunId !== input.runId)
    ) {
      throw new TeamProjectProviderAuthorizationError();
    }

    const projectId = row.projectId == null ? null : String(row.projectId);
    const hasCanonicalProject = row.canonicalProjectId != null;
    const canonicalMember =
      hasCanonicalProject &&
      row.canonicalProjectId === projectId &&
      row.canonicalTenantId === input.tenantId &&
      row.canonicalLifecycle === "ACTIVE" &&
      row.activeMembershipPrincipalId === `user:${input.userId}`;

    // A canonical identity without a current active membership is a hard deny.
    if (hasCanonicalProject && !canonicalMember) {
      throw new TeamProjectProviderAuthorizationError();
    }

    return {
      version: "team-room-provider-context.v1",
      tenantId: input.tenantId,
      roomId: input.roomId,
      teamId: input.teamId,
      userId: input.userId,
      runId: input.runId ?? null,
      historyScope: input.runId ? "run" : "room",
      projectId,
      projectAuthority: canonicalMember ? "canonical-member" : "room-only",
    };
  } catch (error) {
    if (error instanceof TeamProjectProviderAuthorizationError) throw error;
    // Do not turn database or authorization lookup failures into a permissive fallback.
    throw new TeamProjectProviderAuthorizationError();
  }
}

export async function captureTeamProjectProviderContextBinding(
  input: TeamContextAuthorityInput
): Promise<TeamProjectProviderContextBinding> {
  return readCurrentTeamProjectAuthority(input);
}

export async function revalidateTeamProjectProviderContextBinding(
  binding: TeamProjectProviderContextBinding,
  input: TeamContextAuthorityInput
): Promise<void> {
  if (
    binding.version !== "team-room-provider-context.v1" ||
    binding.tenantId !== input.tenantId ||
    binding.roomId !== input.roomId ||
    binding.teamId !== input.teamId ||
    binding.userId !== input.userId ||
    binding.runId !== (input.runId ?? null) ||
    binding.historyScope !== (input.runId ? "run" : "room")
  ) {
    throw new TeamProjectProviderAuthorizationError();
  }

  const current = await readCurrentTeamProjectAuthority(input);
  if (
    current.projectId !== binding.projectId ||
    current.projectAuthority !== binding.projectAuthority
  ) {
    throw new TeamProjectProviderAuthorizationError();
  }
}
