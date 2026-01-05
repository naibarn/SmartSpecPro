/**
 * useSkills Hook
 * 
 * Custom hook for managing skill state and operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { skillService } from '../services/skillService';
import type {
  Skill,
  SkillCreate,
  SkillUpdate,
  SkillTemplate,
  SkillMode,
  SkillScope,
} from '../types/skill';

interface UseSkillsOptions {
  workspace: string;
  autoLoad?: boolean;
}

interface UseSkillsReturn {
  // State
  skills: Skill[];
  templates: SkillTemplate[];
  loading: boolean;
  error: string | null;
  
  // Actions
  loadSkills: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  createSkill: (skill: SkillCreate) => Promise<Skill>;
  updateSkill: (name: string, update: SkillUpdate, mode?: SkillMode) => Promise<Skill>;
  deleteSkill: (name: string, mode?: SkillMode) => Promise<void>;
  injectTemplate: (templateName: string, variables?: Record<string, string>) => Promise<void>;
  injectContext: (userId?: string, projectId?: string) => Promise<void>;
  setupProject: (templates?: string[]) => Promise<void>;
  clearError: () => void;
}

export function useSkills({ workspace, autoLoad = true }: UseSkillsOptions): UseSkillsReturn {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [templates, setTemplates] = useState<SkillTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load skills
  const loadSkills = useCallback(async () => {
    if (!workspace) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await skillService.listSkills(workspace);
      setSkills(response.skills);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load skills';
      setError(message);
      console.error('Failed to load skills:', err);
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  // Load templates
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await skillService.listTemplates();
      setTemplates(response.templates);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load templates';
      setError(message);
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create skill
  const createSkill = useCallback(async (skill: SkillCreate): Promise<Skill> => {
    setError(null);
    try {
      const created = await skillService.createSkill(workspace, skill);
      setSkills((prev) => [...prev, created]);
      return created;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create skill';
      setError(message);
      throw err;
    }
  }, [workspace]);

  // Update skill
  const updateSkill = useCallback(async (
    name: string,
    update: SkillUpdate,
    mode?: SkillMode
  ): Promise<Skill> => {
    setError(null);
    try {
      const updated = await skillService.updateSkill(workspace, name, update, mode);
      setSkills((prev) => prev.map((s) => (s.name === name ? updated : s)));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update skill';
      setError(message);
      throw err;
    }
  }, [workspace]);

  // Delete skill
  const deleteSkill = useCallback(async (name: string, mode?: SkillMode): Promise<void> => {
    setError(null);
    try {
      await skillService.deleteSkill(workspace, name, mode);
      setSkills((prev) => prev.filter((s) => s.name !== name));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete skill';
      setError(message);
      throw err;
    }
  }, [workspace]);

  // Inject template
  const injectTemplate = useCallback(async (
    templateName: string,
    variables?: Record<string, string>
  ): Promise<void> => {
    setError(null);
    try {
      await skillService.injectTemplate(workspace, templateName, variables);
      await loadSkills(); // Reload to get the new skill
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to inject template';
      setError(message);
      throw err;
    }
  }, [workspace, loadSkills]);

  // Inject SmartSpec context
  const injectContext = useCallback(async (
    userId?: string,
    projectId?: string
  ): Promise<void> => {
    setError(null);
    try {
      await skillService.injectContext(workspace, { userId, projectId });
      await loadSkills(); // Reload to get the new skill
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to inject context';
      setError(message);
      throw err;
    }
  }, [workspace, loadSkills]);

  // Setup project
  const setupProject = useCallback(async (templateNames?: string[]): Promise<void> => {
    setError(null);
    try {
      await skillService.setupProjectSkills(workspace, templateNames);
      await loadSkills(); // Reload to get all new skills
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to setup project';
      setError(message);
      throw err;
    }
  }, [workspace, loadSkills]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad && workspace) {
      loadSkills();
      loadTemplates();
    }
  }, [autoLoad, workspace, loadSkills, loadTemplates]);

  return {
    skills,
    templates,
    loading,
    error,
    loadSkills,
    loadTemplates,
    createSkill,
    updateSkill,
    deleteSkill,
    injectTemplate,
    injectContext,
    setupProject,
    clearError,
  };
}

export default useSkills;
