/**
 * Skill Management Types
 * 
 * Type definitions for Kilo Code skill management.
 */

export type SkillScope = 'global' | 'project' | 'user';
export type SkillMode = 'generic' | 'code' | 'architect' | 'debug' | 'ask';
export type SkillFormat = 'kilo' | 'claude' | 'universal';

export interface Skill {
  name: string;
  description: string;
  content: string;
  scope: SkillScope;
  mode: SkillMode;
  tags: string[];
  // Kilo Code fields
  version?: string;
  author?: string;
  // Claude Code specific fields
  allowedTools?: string[];
  model?: string;
  // Metadata
  sourceFormat?: SkillFormat;
  file_path?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillCreate {
  name: string;
  description: string;
  content: string;
  scope?: SkillScope;
  mode?: SkillMode;
  tags?: string[];
  // Kilo Code fields
  version?: string;
  author?: string;
  // Claude Code specific fields
  allowedTools?: string[];
  model?: string;
  // Target formats
  formats?: SkillFormat[];
}

export interface SkillUpdate {
  description?: string;
  content?: string;
  scope?: SkillScope;
  mode?: SkillMode;
  tags?: string[];
}

export interface SkillTemplate {
  name: string;
  description: string;
  mode: string;
  tags: string[];
  preview: string;
  content?: string;
}

export interface SkillListResponse {
  skills: Skill[];
  total: number;
}

export interface TemplateListResponse {
  templates: SkillTemplate[];
  total: number;
}

export interface SkillInjectionResponse {
  success: boolean;
  skill_path: string;
  message: string;
}

export interface ProjectSkillsSetupResult {
  success: boolean;
  results: Array<{
    template: string;
    success: boolean;
    path?: string;
    error?: string;
  }>;
  message: string;
}

// UI State types
export interface SkillEditorState {
  isEditing: boolean;
  isDirty: boolean;
  currentSkill: Skill | null;
  errors: Record<string, string>;
}

export interface SkillManagerState {
  skills: Skill[];
  templates: SkillTemplate[];
  loading: boolean;
  error: string | null;
  selectedSkill: Skill | null;
  editorState: SkillEditorState;
}

// Default values
export const DEFAULT_SKILL: SkillCreate = {
  name: '',
  description: '',
  content: `# Skill Name

## Description
Brief description of what this skill provides.

## Instructions
- Instruction 1
- Instruction 2
- Instruction 3

## Examples
### Good
\`\`\`typescript
// Good example
\`\`\`

### Bad
\`\`\`typescript
// Bad example
\`\`\`

## Context
Additional context about when to use this skill.
`,
  scope: 'project',
  mode: 'generic',
  tags: [],
};

export const SKILL_MODES: { value: SkillMode; label: string; description: string }[] = [
  { value: 'generic', label: 'Generic', description: 'Available in all modes' },
  { value: 'code', label: 'Code', description: 'For code generation tasks' },
  { value: 'architect', label: 'Architect', description: 'For architecture design' },
  { value: 'debug', label: 'Debug', description: 'For debugging tasks' },
  { value: 'ask', label: 'Ask', description: 'For Q&A tasks' },
];

export const SKILL_SCOPES: { value: SkillScope; label: string; description: string }[] = [
  { value: 'global', label: 'Global', description: 'Available across all projects' },
  { value: 'project', label: 'Project', description: 'Specific to this project' },
  { value: 'user', label: 'User', description: 'Personal skill for this user' },
];
