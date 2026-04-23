import { canReadAutoTeamArtifacts, type AutoTeamCallerContext } from "./autoTeamAccessPolicy";
import { toArtifactRefProjection } from "./autoTeamArtifactRefService";
import type { AutoTeamArtifactRefRow } from "../../drizzle/schema";

export interface AutoTeamArtifactAccessInput {
  caller: AutoTeamCallerContext;
  artifact: AutoTeamArtifactRefRow;
}

export function resolveAutoTeamArtifactProjection(
  input: AutoTeamArtifactAccessInput,
): Record<string, unknown> {
  const access = canReadAutoTeamArtifacts(input.caller, {
    tenantId: input.artifact.tenantId,
    teamId: input.artifact.teamId,
    roomId: input.artifact.roomId,
    runId: input.artifact.runId,
    artifactId: input.artifact.id,
  });
  return toArtifactRefProjection(input.artifact, access.allowed);
}

export function canCallAutoTeamArtifactDownload(
  input: AutoTeamArtifactAccessInput,
): boolean {
  return canReadAutoTeamArtifacts(input.caller, {
    tenantId: input.artifact.tenantId,
    teamId: input.artifact.teamId,
    roomId: input.artifact.roomId,
    runId: input.artifact.runId,
    artifactId: input.artifact.id,
  }).allowed;
}
