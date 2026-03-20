import type { SkillDefinition } from "@smartspec/skills";

export function getInternalSkillDefinitions(): SkillDefinition[] {
  return [];
}

export function isInternalSkillId(_skillId: string): boolean {
  return false;
}
