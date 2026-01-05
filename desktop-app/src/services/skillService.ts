/**
 * Skill Management Service
 * 
 * Service for interacting with the Skill Management API.
 */

import type {
  Skill,
  SkillCreate,
  SkillUpdate,
  SkillTemplate,
  SkillListResponse,
  TemplateListResponse,
  SkillInjectionResponse,
  ProjectSkillsSetupResult,
  SkillMode,
  SkillScope,
} from '../types/skill';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_PREFIX = '/api/v1/skills';

/**
 * Build URL with query parameters
 */
function buildUrl(path: string, params?: Record<string, string | undefined>): string {
  const url = new URL(`${API_BASE}${API_PREFIX}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, value);
      }
    });
  }
  return url.toString();
}

/**
 * Handle API response
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Skill Management Service
 */
export const skillService = {
  /**
   * List all skills in a workspace
   */
  async listSkills(
    workspace: string,
    options?: { mode?: SkillMode; scope?: SkillScope }
  ): Promise<SkillListResponse> {
    const response = await fetch(
      buildUrl('', {
        workspace,
        mode: options?.mode,
        scope: options?.scope,
      })
    );
    return handleResponse<SkillListResponse>(response);
  },

  /**
   * Get a specific skill by name
   */
  async getSkill(
    workspace: string,
    skillName: string,
    mode?: SkillMode
  ): Promise<Skill> {
    const response = await fetch(
      buildUrl(`/${skillName}`, { workspace, mode })
    );
    return handleResponse<Skill>(response);
  },

  /**
   * Create a new skill
   */
  async createSkill(workspace: string, skill: SkillCreate): Promise<Skill> {
    const response = await fetch(buildUrl('', { workspace }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(skill),
    });
    return handleResponse<Skill>(response);
  },

  /**
   * Update an existing skill
   */
  async updateSkill(
    workspace: string,
    skillName: string,
    update: SkillUpdate,
    mode?: SkillMode
  ): Promise<Skill> {
    const response = await fetch(
      buildUrl(`/${skillName}`, { workspace, mode }),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      }
    );
    return handleResponse<Skill>(response);
  },

  /**
   * Delete a skill
   */
  async deleteSkill(
    workspace: string,
    skillName: string,
    mode?: SkillMode
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(
      buildUrl(`/${skillName}`, { workspace, mode }),
      { method: 'DELETE' }
    );
    return handleResponse<{ success: boolean; message: string }>(response);
  },

  /**
   * List all available templates
   */
  async listTemplates(): Promise<TemplateListResponse> {
    const response = await fetch(buildUrl('/templates'));
    return handleResponse<TemplateListResponse>(response);
  },

  /**
   * Get a specific template
   */
  async getTemplate(templateName: string): Promise<SkillTemplate & { content: string }> {
    const response = await fetch(buildUrl(`/templates/${templateName}`));
    return handleResponse<SkillTemplate & { content: string }>(response);
  },

  /**
   * Inject a template into the workspace
   */
  async injectTemplate(
    workspace: string,
    templateName: string,
    variables?: Record<string, string>
  ): Promise<SkillInjectionResponse> {
    const response = await fetch(buildUrl('/inject/template', { workspace }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_name: templateName, variables: variables || {} }),
    });
    return handleResponse<SkillInjectionResponse>(response);
  },

  /**
   * Inject SmartSpec context as a skill
   */
  async injectContext(
    workspace: string,
    options?: {
      userId?: string;
      projectId?: string;
      includeEpisodic?: boolean;
    }
  ): Promise<SkillInjectionResponse> {
    const response = await fetch(buildUrl('/inject/context', { workspace }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: options?.userId,
        project_id: options?.projectId,
        include_episodic: options?.includeEpisodic ?? true,
      }),
    });
    return handleResponse<SkillInjectionResponse>(response);
  },

  /**
   * Setup default project skills
   */
  async setupProjectSkills(
    workspace: string,
    templates?: string[]
  ): Promise<ProjectSkillsSetupResult> {
    const url = new URL(`${API_BASE}${API_PREFIX}/setup-project`);
    url.searchParams.append('workspace', workspace);
    if (templates) {
      templates.forEach((t) => url.searchParams.append('templates', t));
    }
    
    const response = await fetch(url.toString(), { method: 'POST' });
    return handleResponse<ProjectSkillsSetupResult>(response);
  },

  // ============================================================================
  // Sync Methods (Claude Code Compatibility)
  // ============================================================================

  /**
   * Sync skills between Kilo Code and Claude Code directories
   */
  async syncSkills(
    workspace: string,
    options?: {
      sourceFormat?: 'kilo' | 'claude';
      bidirectional?: boolean;
    }
  ): Promise<{
    success: boolean;
    synced_count: number;
    failed_count: number;
    results: Record<string, boolean>;
    message: string;
  }> {
    const response = await fetch(buildUrl('/sync', { workspace }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_format: options?.sourceFormat || 'kilo',
        bidirectional: options?.bidirectional || false,
      }),
    });
    return handleResponse(response);
  },

  /**
   * Get diff between Kilo Code and Claude Code skill directories
   */
  async diffSkills(
    workspace: string
  ): Promise<{
    synced: string[];
    only_kilo: string[];
    only_claude: string[];
    total_kilo: number;
    total_claude: number;
  }> {
    const response = await fetch(buildUrl('/diff', { workspace }));
    return handleResponse(response);
  },

  /**
   * Convert a single skill from one format to another
   */
  async convertSkill(
    workspace: string,
    skillName: string,
    options?: {
      sourceFormat?: 'kilo' | 'claude';
      targetFormat?: 'kilo' | 'claude';
    }
  ): Promise<{
    success: boolean;
    skill_name: string;
    source_format: string;
    target_format: string;
    target_path: string;
    message: string;
  }> {
    const response = await fetch(
      buildUrl('/convert', {
        workspace,
        skill_name: skillName,
        source_format: options?.sourceFormat || 'kilo',
        target_format: options?.targetFormat || 'claude',
      }),
      { method: 'POST' }
    );
    return handleResponse(response);
  },
};

export default skillService;
