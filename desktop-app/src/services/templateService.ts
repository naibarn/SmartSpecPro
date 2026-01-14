// Template Service - Frontend service for Template Wizard
//
// Provides:
// - Template listing and search
// - Configuration wizard state
// - Project generation

import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface TemplateEntry {
  id: string;
  name: string;
  category: TemplateCategory;
  path: string;
}

export type TemplateCategory = 
  | 'saas' 
  | 'ecommerce' 
  | 'mobile' 
  | 'api' 
  | 'dashboard' 
  | 'landing' 
  | 'blog' 
  | 'portfolio' 
  | 'custom';

export interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  category: TemplateCategory;
  tags: string[];
  tech_stack: TechStack;
  features: TemplateFeature[];
  complexity: 'beginner' | 'intermediate' | 'advanced';
  estimated_time: string;
  preview_image?: string;
  author?: string;
}

export interface TechStack {
  frontend?: string;
  backend?: string;
  database?: string;
  auth?: string;
  payment?: string;
  hosting?: string;
}

export interface TemplateFeature {
  id: string;
  name: string;
  description: string;
  required: boolean;
  default: boolean;
  dependencies?: string[];
}

export interface ConfigSchema {
  fields: ConfigField[];
}

export interface ConfigField {
  id: string;
  name: string;
  field_type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'color' | 'file';
  required: boolean;
  default?: unknown;
  validation?: ValidationRule;
  options?: ConfigOption[];
  depends_on?: string;
  help_text?: string;
}

export interface ConfigOption {
  value: string;
  label: string;
  description?: string;
}

export interface ValidationRule {
  pattern?: string;
  min?: number;
  max?: number;
  min_length?: number;
  max_length?: number;
  message: string;
}

export interface ProjectConfig {
  template_id: string;
  project_name: string;
  project_description?: string;
  output_path: string;
  features: string[];
  variables: Record<string, unknown>;
}

export interface GenerationResult {
  success: boolean;
  project_path: string;
  files_created: string[];
  warnings: string[];
  next_steps: NextStep[];
  duration_ms: number;
}

export interface NextStep {
  title: string;
  description: string;
  command?: string;
  link?: string;
}

export interface GenerationProgress {
  stage: string;
  percent: number;
  current_file?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export interface QuickStartGuide {
  title: string;
  steps: QuickStartStep[];
  resources: QuickStartResource[];
}

export interface QuickStartStep {
  order: number;
  title: string;
  description: string;
  command?: string;
  completed: boolean;
}

export interface QuickStartResource {
  title: string;
  url: string;
  icon: string;
}

// ============================================
// Wizard State
// ============================================

export type WizardStep = 'category' | 'template' | 'features' | 'config' | 'generate' | 'complete';

export interface WizardState {
  currentStep: WizardStep;
  selectedCategory?: string;
  selectedTemplate?: TemplateMetadata;
  selectedFeatures: string[];
  config: Partial<ProjectConfig>;
  generationResult?: GenerationResult;
}

// ============================================
// API Functions
// ============================================

export async function loadRegistry(): Promise<void> {
  return invoke('template_load_registry');
}

export async function listTemplates(): Promise<TemplateEntry[]> {
  return invoke('template_list');
}

export async function searchTemplates(query: string, category?: string): Promise<TemplateEntry[]> {
  return invoke('template_search', { query, category });
}

export async function getCategories(): Promise<CategoryInfo[]> {
  return invoke('template_get_categories');
}

export async function getTemplateMetadata(templateId: string): Promise<TemplateMetadata> {
  return invoke('template_get_metadata', { templateId });
}

export async function getConfigSchema(templateId: string): Promise<ConfigSchema> {
  return invoke('template_get_config_schema', { templateId });
}

export async function generateProject(config: ProjectConfig): Promise<GenerationResult> {
  return invoke('template_generate_project', { config });
}

export async function validateConfig(config: ProjectConfig): Promise<ValidationResult> {
  return invoke('template_validate_config', { config });
}

export async function getQuickStart(templateId: string): Promise<QuickStartGuide> {
  return invoke('template_get_quick_start', { templateId });
}

// ============================================
// Template Context
// ============================================

interface TemplateContextValue {
  // Data
  categories: CategoryInfo[];
  templates: TemplateEntry[];
  isLoading: boolean;
  error: string | null;
  
  // Wizard State
  wizard: WizardState;
  
  // Actions
  loadTemplates: () => Promise<void>;
  searchTemplates: (query: string, category?: string) => Promise<void>;
  selectCategory: (categoryId: string) => void;
  selectTemplate: (templateId: string) => Promise<void>;
  toggleFeature: (featureId: string) => void;
  updateConfig: (updates: Partial<ProjectConfig>) => void;
  validateCurrentConfig: () => Promise<ValidationResult>;
  generateProject: () => Promise<void>;
  resetWizard: () => void;
  goToStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  
  // Progress
  generationProgress: GenerationProgress | null;
}

const TemplateContext = createContext<TemplateContextValue | null>(null);

const WIZARD_STEPS: WizardStep[] = ['category', 'template', 'features', 'config', 'generate', 'complete'];

export function TemplateProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  
  const [wizard, setWizard] = useState<WizardState>({
    currentStep: 'category',
    selectedFeatures: [],
    config: {},
  });

  // Load initial data
  useEffect(() => {
    const init = async () => {
      try {
        await loadRegistry();
        const [cats, temps] = await Promise.all([
          getCategories(),
          listTemplates(),
        ]);
        setCategories(cats);
        setTemplates(temps);
      } catch (e) {
        setError(String(e));
      }
    };
    init();
  }, []);

  // Listen for generation progress
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    
    const setup = async () => {
      unlisten = await listen<GenerationProgress>('template:progress', (event) => {
        setGenerationProgress(event.payload);
      });
    };
    
    setup();
    return () => {
      unlisten?.();
    };
  }, []);

  const loadTemplatesAction = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const temps = await listTemplates();
      setTemplates(temps);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchTemplatesAction = useCallback(async (query: string, category?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const temps = await searchTemplates(query, category);
      setTemplates(temps);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectCategory = useCallback((categoryId: string) => {
    setWizard(prev => ({
      ...prev,
      selectedCategory: categoryId,
    }));
    searchTemplatesAction('', categoryId);
  }, [searchTemplatesAction]);

  const selectTemplateAction = useCallback(async (templateId: string) => {
    setIsLoading(true);
    try {
      const metadata = await getTemplateMetadata(templateId);
      const defaultFeatures = metadata.features
        .filter(f => f.required || f.default)
        .map(f => f.id);
      
      setWizard(prev => ({
        ...prev,
        selectedTemplate: metadata,
        selectedFeatures: defaultFeatures,
        config: {
          ...prev.config,
          template_id: templateId,
        },
      }));
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleFeature = useCallback((featureId: string) => {
    setWizard(prev => {
      const features = prev.selectedFeatures.includes(featureId)
        ? prev.selectedFeatures.filter(f => f !== featureId)
        : [...prev.selectedFeatures, featureId];
      return { ...prev, selectedFeatures: features };
    });
  }, []);

  const updateConfig = useCallback((updates: Partial<ProjectConfig>) => {
    setWizard(prev => ({
      ...prev,
      config: { ...prev.config, ...updates },
    }));
  }, []);

  const validateCurrentConfig = useCallback(async (): Promise<ValidationResult> => {
    const config: ProjectConfig = {
      template_id: wizard.config.template_id || '',
      project_name: wizard.config.project_name || '',
      project_description: wizard.config.project_description,
      output_path: wizard.config.output_path || '',
      features: wizard.selectedFeatures,
      variables: wizard.config.variables || {},
    };
    return validateConfig(config);
  }, [wizard]);

  const generateProjectAction = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setGenerationProgress(null);
    
    try {
      const config: ProjectConfig = {
        template_id: wizard.config.template_id || '',
        project_name: wizard.config.project_name || '',
        project_description: wizard.config.project_description,
        output_path: wizard.config.output_path || '',
        features: wizard.selectedFeatures,
        variables: wizard.config.variables || {},
      };
      
      const result = await generateProject(config);
      setWizard(prev => ({
        ...prev,
        generationResult: result,
        currentStep: 'complete',
      }));
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [wizard]);

  const resetWizard = useCallback(() => {
    setWizard({
      currentStep: 'category',
      selectedFeatures: [],
      config: {},
    });
    setGenerationProgress(null);
    setError(null);
  }, []);

  const goToStep = useCallback((step: WizardStep) => {
    setWizard(prev => ({ ...prev, currentStep: step }));
  }, []);

  const nextStep = useCallback(() => {
    setWizard(prev => {
      const currentIndex = WIZARD_STEPS.indexOf(prev.currentStep);
      if (currentIndex < WIZARD_STEPS.length - 1) {
        return { ...prev, currentStep: WIZARD_STEPS[currentIndex + 1] };
      }
      return prev;
    });
  }, []);

  const prevStep = useCallback(() => {
    setWizard(prev => {
      const currentIndex = WIZARD_STEPS.indexOf(prev.currentStep);
      if (currentIndex > 0) {
        return { ...prev, currentStep: WIZARD_STEPS[currentIndex - 1] };
      }
      return prev;
    });
  }, []);

  const value: TemplateContextValue = {
    categories,
    templates,
    isLoading,
    error,
    wizard,
    loadTemplates: loadTemplatesAction,
    searchTemplates: searchTemplatesAction,
    selectCategory,
    selectTemplate: selectTemplateAction,
    toggleFeature,
    updateConfig,
    validateCurrentConfig,
    generateProject: generateProjectAction,
    resetWizard,
    goToStep,
    nextStep,
    prevStep,
    generationProgress,
  };

  return (
    <TemplateContext.Provider value={value}>
      {children}
    </TemplateContext.Provider>
  );
}

export function useTemplates() {
  const context = useContext(TemplateContext);
  if (!context) {
    throw new Error('useTemplates must be used within a TemplateProvider');
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

export function getCategoryIcon(category: TemplateCategory): string {
  const icons: Record<TemplateCategory, string> = {
    saas: '🚀',
    ecommerce: '🛒',
    mobile: '📱',
    api: '🔌',
    dashboard: '📊',
    landing: '🎯',
    blog: '📝',
    portfolio: '💼',
    custom: '⚙️',
  };
  return icons[category] || '📦';
}

export function getComplexityColor(complexity: string): string {
  switch (complexity) {
    case 'beginner':
      return 'green';
    case 'intermediate':
      return 'yellow';
    case 'advanced':
      return 'red';
    default:
      return 'gray';
  }
}

export function getComplexityLabel(complexity: string): string {
  switch (complexity) {
    case 'beginner':
      return 'Beginner Friendly';
    case 'intermediate':
      return 'Intermediate';
    case 'advanced':
      return 'Advanced';
    default:
      return complexity;
  }
}
