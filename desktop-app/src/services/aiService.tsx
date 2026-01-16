// AI Enhancement Service - Frontend service for AI Features
//
// Provides:
// - Smart suggestions
// - Code completion
// - Quality analysis
// - Auto-documentation

import { invoke } from '@tauri-apps/api/core';
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface Suggestion {
  id: string;
  suggestion_type: SuggestionType;
  title: string;
  description: string;
  confidence: number;
  impact: Impact;
  code_snippet?: string;
  file_path?: string;
  line_range?: [number, number];
  actions: SuggestionAction[];
  created_at: number;
  dismissed: boolean;
  applied: boolean;
}

export type SuggestionType =
  | 'code_improvement'
  | 'bug_prediction'
  | 'security_issue'
  | 'performance_optimization'
  | 'documentation'
  | 'test_coverage'
  | 'refactoring'
  | 'best_practice';

export type Impact = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface SuggestionAction {
  action_type: ActionType;
  label: string;
  data: unknown;
}

export type ActionType = 'apply_fix' | 'view_details' | 'dismiss' | 'learn_more' | 'create_task';

export interface CompletionRequest {
  file_path: string;
  content: string;
  cursor_position: CursorPosition;
  language: string;
  context_files: ContextFile[];
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface ContextFile {
  path: string;
  content: string;
}

export interface CompletionResult {
  completions: Completion[];
  processing_time_ms: number;
}

export interface Completion {
  text: string;
  display_text: string;
  completion_type: CompletionType;
  confidence: number;
  documentation?: string;
  insert_range?: InsertRange;
}

export type CompletionType = 'function' | 'variable' | 'class' | 'module' | 'keyword' | 'snippet' | 'file' | 'text';

export interface InsertRange {
  start: CursorPosition;
  end: CursorPosition;
}

export interface QualityReport {
  id: string;
  project_id: string;
  overall_score: number;
  categories: QualityCategory[];
  issues: QualityIssue[];
  metrics: QualityMetrics;
  created_at: number;
}

export interface QualityCategory {
  name: string;
  score: number;
  weight: number;
  description: string;
}

export interface QualityIssue {
  id: string;
  category: string;
  severity: Impact;
  title: string;
  description: string;
  file_path?: string;
  line?: number;
  suggestion?: string;
}

export interface QualityMetrics {
  code_coverage?: number;
  complexity: number;
  maintainability: number;
  documentation_coverage: number;
  test_count: number;
  issue_count: number;
  lines_of_code: number;
}

export interface DocumentationRequest {
  content: string;
  language: string;
  doc_type: DocumentationType;
  style: DocumentationStyle;
}

export type DocumentationType = 'function' | 'class' | 'module' | 'api' | 'readme';
export type DocumentationStyle = 'jsdoc' | 'docstring' | 'markdown' | 'rustdoc' | 'javadoc';

export interface DocumentationResult {
  documentation: string;
  summary: string;
  parameters: ParameterDoc[];
  returns?: string;
  examples: string[];
}

export interface ParameterDoc {
  name: string;
  param_type: string;
  description: string;
  optional: boolean;
  default?: string;
}

export interface AiSettings {
  auto_suggestions: boolean;
  suggestion_types: SuggestionType[];
  min_confidence: number;
  completion_enabled: boolean;
  completion_delay_ms: number;
  quality_check_on_save: boolean;
  auto_documentation: boolean;
}

// ============================================
// API Functions
// ============================================

export async function analyzeCode(
  projectId: string,
  content: string,
  filePath: string
): Promise<Suggestion[]> {
  return invoke('ai_analyze_code', { projectId, content, filePath });
}

export async function getSuggestions(projectId: string): Promise<Suggestion[]> {
  return invoke('ai_get_suggestions', { projectId });
}

export async function dismissSuggestion(projectId: string, suggestionId: string): Promise<void> {
  return invoke('ai_dismiss_suggestion', { projectId, suggestionId });
}

export async function applySuggestion(projectId: string, suggestionId: string): Promise<void> {
  return invoke('ai_apply_suggestion', { projectId, suggestionId });
}

export async function getCompletions(request: CompletionRequest): Promise<CompletionResult> {
  return invoke('ai_get_completions', { request });
}

export async function analyzeQuality(
  projectId: string,
  files: [string, string][]
): Promise<QualityReport> {
  return invoke('ai_analyze_quality', { projectId, files });
}

export async function getQualityReport(projectId: string): Promise<QualityReport> {
  return invoke('ai_get_quality_report', { projectId });
}

export async function generateDocumentation(
  request: DocumentationRequest
): Promise<DocumentationResult> {
  return invoke('ai_generate_documentation', { request });
}

export async function getAiSettings(): Promise<AiSettings> {
  return invoke('ai_get_settings');
}

export async function updateAiSettings(settings: AiSettings): Promise<void> {
  return invoke('ai_update_settings', { settings });
}

// ============================================
// AI Context
// ============================================

interface AiContextValue {
  suggestions: Suggestion[];
  qualityReport: QualityReport | null;
  settings: AiSettings | null;
  isAnalyzing: boolean;
  error: string | null;
  
  // Actions
  analyze: (projectId: string, content: string, filePath: string) => Promise<void>;
  loadSuggestions: (projectId: string) => Promise<void>;
  dismiss: (projectId: string, suggestionId: string) => Promise<void>;
  apply: (projectId: string, suggestionId: string) => Promise<void>;
  runQualityAnalysis: (projectId: string, files: [string, string][]) => Promise<void>;
  loadQualityReport: (projectId: string) => Promise<void>;
  generateDocs: (request: DocumentationRequest) => Promise<DocumentationResult>;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AiSettings) => Promise<void>;
}

const AiContext = createContext<AiContextValue | null>(null);

export function AiProvider({ children }: { children: ReactNode }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (projectId: string, content: string, filePath: string) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const newSuggestions = await analyzeCode(projectId, content, filePath);
      setSuggestions(prev => [...prev, ...newSuggestions]);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const loadSuggestions = useCallback(async (projectId: string) => {
    try {
      const data = await getSuggestions(projectId);
      setSuggestions(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const dismiss = useCallback(async (projectId: string, suggestionId: string) => {
    try {
      await dismissSuggestion(projectId, suggestionId);
      setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const apply = useCallback(async (projectId: string, suggestionId: string) => {
    try {
      await applySuggestion(projectId, suggestionId);
      setSuggestions(prev => prev.map(s => 
        s.id === suggestionId ? { ...s, applied: true } : s
      ));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const runQualityAnalysis = useCallback(async (projectId: string, files: [string, string][]) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const report = await analyzeQuality(projectId, files);
      setQualityReport(report);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const loadQualityReport = useCallback(async (projectId: string) => {
    try {
      const report = await getQualityReport(projectId);
      setQualityReport(report);
    } catch (e) {
      // No report found is not an error
      setQualityReport(null);
    }
  }, []);

  const generateDocs = useCallback(async (request: DocumentationRequest) => {
    return generateDocumentation(request);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await getAiSettings();
      setSettings(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const saveSettings = useCallback(async (newSettings: AiSettings) => {
    try {
      await updateAiSettings(newSettings);
      setSettings(newSettings);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const value: AiContextValue = {
    suggestions,
    qualityReport,
    settings,
    isAnalyzing,
    error,
    analyze,
    loadSuggestions,
    dismiss,
    apply,
    runQualityAnalysis,
    loadQualityReport,
    generateDocs,
    loadSettings,
    saveSettings,
  };

  return (
    <AiContext.Provider value={value}>
      {children}
    </AiContext.Provider>
  );
}

export function useAi() {
  const context = useContext(AiContext);
  if (!context) {
    throw new Error('useAi must be used within an AiProvider');
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

export function getSuggestionTypeIcon(type: SuggestionType): string {
  const icons: Record<SuggestionType, string> = {
    code_improvement: '💡',
    bug_prediction: '🐛',
    security_issue: '🔒',
    performance_optimization: '⚡',
    documentation: '📝',
    test_coverage: '🧪',
    refactoring: '🔧',
    best_practice: '✨',
  };
  return icons[type];
}

export function getImpactColor(impact: Impact): string {
  const colors: Record<Impact, string> = {
    critical: 'text-red-600 bg-red-100 dark:bg-red-900/30',
    high: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
    medium: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
    low: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    info: 'text-gray-600 bg-gray-100 dark:bg-gray-700',
  };
  return colors[impact];
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  if (score >= 40) return 'text-orange-600';
  return 'text-red-600';
}
