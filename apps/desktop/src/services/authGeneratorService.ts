/**
 * Auth Generator Service
 * API client for auth generator endpoints
 */

import {
  AuthGeneratorConfig,
  GenerationResult,
  PreviewResponse,
  TemplateInfo,
  ValidationResult,
  FeaturesResponse,
  PreviewFileType,
  DEFAULT_AUTH_CONFIG,
} from '../types/authGenerator';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Convert camelCase to snake_case for API requests
 */
function toSnakeCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;
  
  const result: any = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = toSnakeCase(obj[key]);
  }
  return result;
}

/**
 * Convert snake_case to camelCase for API responses
 */
function toCamelCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;
  
  const result: any = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = toCamelCase(obj[key]);
  }
  return result;
}

/**
 * Auth Generator Service
 */
export const authGeneratorService = {
  /**
   * List available templates
   */
  async listTemplates(): Promise<TemplateInfo[]> {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth-generator/templates`);
    if (!response.ok) {
      throw new Error(`Failed to fetch templates: ${response.statusText}`);
    }
    const data = await response.json();
    return toCamelCase(data);
  },

  /**
   * Get a specific template
   */
  async getTemplate(templateId: string): Promise<TemplateInfo> {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth-generator/templates/${templateId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch template: ${response.statusText}`);
    }
    const data = await response.json();
    return toCamelCase(data);
  },

  /**
   * Preview generated code
   */
  async previewCode(config: AuthGeneratorConfig, fileType: PreviewFileType = 'controller'): Promise<PreviewResponse> {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth-generator/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: toSnakeCase(config),
        file_type: fileType,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to preview code: ${response.statusText}`);
    }
    const data = await response.json();
    return toCamelCase(data);
  },

  /**
   * Generate authentication system
   */
  async generate(config: AuthGeneratorConfig): Promise<GenerationResult> {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth-generator/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toSnakeCase(config)),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || `Failed to generate: ${response.statusText}`);
    }
    const data = await response.json();
    return toCamelCase(data);
  },

  /**
   * Validate configuration
   */
  async validate(config: AuthGeneratorConfig): Promise<ValidationResult> {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth-generator/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toSnakeCase(config)),
    });
    if (!response.ok) {
      throw new Error(`Failed to validate: ${response.statusText}`);
    }
    const data = await response.json();
    return toCamelCase(data);
  },

  /**
   * List available features
   */
  async listFeatures(): Promise<FeaturesResponse> {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth-generator/features`);
    if (!response.ok) {
      throw new Error(`Failed to fetch features: ${response.statusText}`);
    }
    const data = await response.json();
    return toCamelCase(data);
  },

  /**
   * Create default config
   */
  createDefaultConfig(projectName: string = 'my-app', outputDir: string = './src/auth'): AuthGeneratorConfig {
    return {
      ...DEFAULT_AUTH_CONFIG,
      projectName,
      outputDir,
    };
  },

  /**
   * Apply template to config
   */
  applyTemplate(template: TemplateInfo, projectName: string, outputDir: string): AuthGeneratorConfig {
    return {
      ...template.config,
      projectName,
      outputDir,
    };
  },
};

export default authGeneratorService;
