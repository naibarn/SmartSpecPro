/**
 * Skill types shared across web and desktop apps
 */

export type SkillScope = 'global' | 'project' | 'user';
export type SkillMode = 'generic' | 'code' | 'architect' | 'debug' | 'ask';
export type SkillFormat = 'kilo' | 'claude' | 'universal';

export interface SkillBase {
  name: string;
  description: string;
  content: string;
  scope: SkillScope;
  mode: SkillMode;
  tags: string[];
  version?: string;
  author?: string;
}
