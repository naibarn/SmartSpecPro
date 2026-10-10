/**
 * SPEC-268 keeps team-room-derived persistent memory fail-closed until source
 * provenance and tenant/project/App isolation have executable acceptance.
 * This is intentionally not environment-configurable; enabling it requires a
 * separately reviewed provenance and isolation change.
 */
const TEAM_ROOM_MEMORY_ENABLED: boolean = false;

export function isTeamRoomMemoryEnabled(): boolean {
  return TEAM_ROOM_MEMORY_ENABLED;
}

export function filterPromptScopesWithoutTeamRoomMemory<
  T extends { type: string },
>(scopes: readonly T[]): T[] {
  if (isTeamRoomMemoryEnabled()) return [...scopes];
  return scopes.filter(
    (scope) =>
      scope.type !== "room" && scope.type !== "team" && scope.type !== "run",
  );
}

export function isTeamRoomMemoryPromptEligible(memory: {
  ownerType: string;
  sourceRoomId?: string | null;
}): boolean {
  if (isTeamRoomMemoryEnabled()) return true;
  return (
    memory.ownerType !== "room" &&
    memory.ownerType !== "team" &&
    memory.ownerType !== "run" &&
    memory.sourceRoomId == null
  );
}
