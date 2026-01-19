/**
 * Skill Customization Service
 * Handles API calls for skill prompt customization
 */

import { getAuthToken } from './authService';

const API_BASE_URL = 'http://localhost:8080/api/v1';

export interface CustomSkillPrompt {
  id: string;
  user_id: number;
  skill_id: string;
  custom_system_prompt: string;
  template_variables?: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SkillInfo {
  skill_id: string;
  name: string;
  category: string;
  description: string;
  default_prompt: string;
  template_variables: string[];
}

export interface PromptTemplate {
  id: string;
  skill_id: string;
  name: string;
  description?: string;
  system_prompt: string;
  template_variables?: Record<string, any>;
  category?: string;
  usage_count: number;
}

/**
 * Get list of customizable skills
 */
export async function listCustomizableSkills(): Promise<{ skills: SkillInfo[]; total: number }> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/skills/customizable`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to list skills');
  }

  return response.json();
}

/**
 * Get custom prompt for a skill
 */
export async function getCustomPrompt(skillId: string): Promise<CustomSkillPrompt | null> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/skills/${skillId}/custom-prompt`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get custom prompt');
  }

  return response.json();
}

/**
 * Save custom prompt for a skill
 */
export async function saveCustomPrompt(
  skillId: string,
  customPrompt: string,
  templateVariables?: Record<string, any>,
  isActive: boolean = true
): Promise<CustomSkillPrompt> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/skills/${skillId}/custom-prompt`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      custom_system_prompt: customPrompt,
      template_variables: templateVariables,
      is_active: isActive,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to save custom prompt');
  }

  return response.json();
}

/**
 * Delete custom prompt (reset to default)
 */
export async function deleteCustomPrompt(skillId: string): Promise<{ success: boolean; message: string }> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/skills/${skillId}/custom-prompt`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete custom prompt');
  }

  return response.json();
}

/**
 * Toggle custom prompt active/inactive
 */
export async function toggleCustomPrompt(skillId: string, isActive: boolean): Promise<CustomSkillPrompt> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/skills/${skillId}/custom-prompt/toggle`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ is_active: isActive }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to toggle custom prompt');
  }

  return response.json();
}

/**
 * List all custom prompts for current user
 */
export async function listUserCustomPrompts(): Promise<CustomSkillPrompt[]> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/skills/custom-prompts`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to list custom prompts');
  }

  return response.json();
}

/**
 * Get templates for a skill
 */
export async function getSkillTemplates(skillId: string): Promise<{ templates: PromptTemplate[]; total: number }> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/skills/${skillId}/templates`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get templates');
  }

  return response.json();
}

/**
 * Apply a template
 */
export async function applyTemplate(templateId: string): Promise<CustomSkillPrompt> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/skills/templates/${templateId}/apply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to apply template');
  }

  return response.json();
}

/**
 * Get effective prompt (for preview)
 */
export async function getEffectivePrompt(skillId: string): Promise<{
  skill_id: string;
  prompt: string;
  is_custom: boolean;
  source: 'custom' | 'default';
}> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/skills/${skillId}/effective-prompt`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get effective prompt');
  }

  return response.json();
}
