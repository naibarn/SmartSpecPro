// CLI Service - Frontend service for OpenCode CLI
//
// Provides:
// - Command execution
// - File operations
// - Code suggestions
// - History management

import { invoke } from '@tauri-apps/api/core';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface CommandResult {
  command: string;
  status: CommandStatus;
  output: OutputBlock[];
  suggestions: CodeSuggestion[];
  files_read: string[];
  files_modified: string[];
  execution_time_ms: number;
}

export type CommandStatus = 
  | { type: 'Success' }
  | { type: 'Pending' }
  | { type: 'Error'; message: string }
  | { type: 'Streaming' };

export interface OutputBlock {
  block_type: OutputBlockType;
  content: string;
  metadata?: Record<string, string>;
}

export type OutputBlockType = 
  | 'Text'
  | 'Code'
  | 'Diff'
  | 'FileList'
  | 'TaskList'
  | 'Error'
  | 'Warning'
  | 'Info'
  | 'Progress';

export interface CodeSuggestion {
  id: string;
  file_path: string;
  original_content?: string;
  suggested_content: string;
  diff_hunks: DiffHunk[];
  description: string;
  status: SuggestionStatus;
}

export interface DiffHunk {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  line_type: DiffLineType;
  content: string;
  old_line_no?: number;
  new_line_no?: number;
}

export type DiffLineType = 'Context' | 'Addition' | 'Deletion';

export type SuggestionStatus = 'Pending' | 'Accepted' | 'Rejected' | 'Modified';

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
  size?: number;
  modified?: string;
  extension?: string;
}

export interface FileContent {
  path: string;
  content: string;
  language: string;
  line_count: number;
  size: number;
}

export interface SearchResult {
  file_path: string;
  line_number: number;
  line_content: string;
  match_start: number;
  match_end: number;
}

export interface CliCommandInfo {
  command_type: string;
  args: Record<string, string>;
}

// ============================================
// API Functions
// ============================================

export async function setWorkspace(path: string): Promise<void> {
  return invoke('cli_set_workspace', { path });
}

export async function getWorkspace(): Promise<string | null> {
  return invoke('cli_get_workspace');
}

export async function parseCommand(input: string): Promise<CliCommandInfo> {
  return invoke('cli_parse_command', { input });
}

export async function executeCommand(input: string): Promise<CommandResult> {
  return invoke('cli_execute_command', { input });
}

export async function getHistory(): Promise<string[]> {
  return invoke('cli_get_history');
}

export async function searchHistory(query: string): Promise<string[]> {
  return invoke('cli_search_history', { query });
}

// Suggestion APIs
export async function addSuggestion(suggestion: CodeSuggestion): Promise<void> {
  return invoke('cli_add_suggestion', { suggestion });
}

export async function getSuggestion(id: string): Promise<CodeSuggestion | null> {
  return invoke('cli_get_suggestion', { id });
}

export async function acceptSuggestion(id: string): Promise<void> {
  return invoke('cli_accept_suggestion', { id });
}

export async function rejectSuggestion(id: string): Promise<void> {
  return invoke('cli_reject_suggestion', { id });
}

export async function modifySuggestion(id: string, modifiedContent: string): Promise<void> {
  return invoke('cli_modify_suggestion', { id, modifiedContent });
}

export async function getPendingSuggestions(): Promise<CodeSuggestion[]> {
  return invoke('cli_get_pending_suggestions');
}

export async function clearSuggestions(): Promise<void> {
  return invoke('cli_clear_suggestions');
}

// File APIs
export async function readFile(path: string): Promise<FileContent> {
  return invoke('cli_read_file', { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('cli_write_file', { path, content });
}

export async function listFiles(dir?: string): Promise<FileNode[]> {
  return invoke('cli_list_files', { dir });
}

export async function searchFiles(query: string, filePattern?: string): Promise<SearchResult[]> {
  return invoke('cli_search_files', { query, filePattern });
}

export async function generateDiff(original: string, modified: string): Promise<DiffHunk[]> {
  return invoke('cli_generate_diff', { original, modified });
}

// ============================================
// CLI Context
// ============================================

interface CliContextValue {
  // Workspace
  workspace: string | null;
  setWorkspacePath: (path: string) => Promise<void>;
  
  // Commands
  executeCliCommand: (input: string) => Promise<CommandResult>;
  isExecuting: boolean;
  lastResult: CommandResult | null;
  
  // History
  history: string[];
  historyIndex: number;
  navigateHistory: (direction: 'up' | 'down') => string | null;
  
  // Files
  files: FileNode[];
  selectedFile: FileContent | null;
  openFile: (path: string) => Promise<void>;
  refreshFiles: () => Promise<void>;
  
  // Suggestions
  suggestions: CodeSuggestion[];
  handleAccept: (id: string) => Promise<void>;
  handleReject: (id: string) => Promise<void>;
  handleModify: (id: string, content: string) => Promise<void>;
}

const CliContext = createContext<CliContextValue | null>(null);

export function CliProvider({ children }: { children: ReactNode }) {
  // Workspace state
  const [workspace, setWorkspaceState] = useState<string | null>(null);
  
  // Command state
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  
  // History state
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // File state
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  
  // Suggestion state
  const [suggestions, setSuggestions] = useState<CodeSuggestion[]>([]);

  const setWorkspacePath = useCallback(async (path: string) => {
    await setWorkspace(path);
    setWorkspaceState(path);
    
    // Load files
    const fileList = await listFiles();
    setFiles(fileList);
    
    // Load history
    const hist = await getHistory();
    setHistory(hist);
  }, []);

  const executeCliCommand = useCallback(async (input: string): Promise<CommandResult> => {
    setIsExecuting(true);
    try {
      const result = await executeCommand(input);
      setLastResult(result);
      
      // Update history
      const hist = await getHistory();
      setHistory(hist);
      setHistoryIndex(-1);
      
      // Update suggestions
      if (result.suggestions.length > 0) {
        setSuggestions(prev => [...prev, ...result.suggestions]);
      }
      
      return result;
    } finally {
      setIsExecuting(false);
    }
  }, []);

  const navigateHistory = useCallback((direction: 'up' | 'down'): string | null => {
    if (history.length === 0) return null;
    
    let newIndex: number;
    if (direction === 'up') {
      newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
    } else {
      newIndex = historyIndex > 0 ? historyIndex - 1 : -1;
    }
    
    setHistoryIndex(newIndex);
    return newIndex >= 0 ? history[history.length - 1 - newIndex] : null;
  }, [history, historyIndex]);

  const openFile = useCallback(async (path: string) => {
    const content = await readFile(path);
    setSelectedFile(content);
  }, []);

  const refreshFiles = useCallback(async () => {
    const fileList = await listFiles();
    setFiles(fileList);
  }, []);

  const handleAccept = useCallback(async (id: string) => {
    await acceptSuggestion(id);
    setSuggestions(prev => prev.filter(s => s.id !== id));
    await refreshFiles();
  }, [refreshFiles]);

  const handleReject = useCallback(async (id: string) => {
    await rejectSuggestion(id);
    setSuggestions(prev => prev.filter(s => s.id !== id));
  }, []);

  const handleModify = useCallback(async (id: string, content: string) => {
    await modifySuggestion(id, content);
    setSuggestions(prev => prev.filter(s => s.id !== id));
    await refreshFiles();
  }, [refreshFiles]);

  const value: CliContextValue = {
    workspace,
    setWorkspacePath,
    executeCliCommand,
    isExecuting,
    lastResult,
    history,
    historyIndex,
    navigateHistory,
    files,
    selectedFile,
    openFile,
    refreshFiles,
    suggestions,
    handleAccept,
    handleReject,
    handleModify,
  };

  return (
    <CliContext.Provider value={value}>
      {children}
    </CliContext.Provider>
  );
}

export function useCli() {
  const context = useContext(CliContext);
  if (!context) {
    throw new Error('useCli must be used within a CliProvider');
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

export function getLanguageIcon(language: string): string {
  const icons: Record<string, string> = {
    typescript: '🔷',
    javascript: '🟨',
    rust: '🦀',
    python: '🐍',
    go: '🐹',
    java: '☕',
    csharp: '🟣',
    ruby: '💎',
    php: '🐘',
    swift: '🍎',
    kotlin: '🟠',
    html: '🌐',
    css: '🎨',
    json: '📋',
    yaml: '📄',
    markdown: '📝',
    shell: '🖥️',
  };
  return icons[language] || '📄';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getOutputBlockIcon(type: OutputBlockType): string {
  const icons: Record<OutputBlockType, string> = {
    Text: '📝',
    Code: '💻',
    Diff: '📊',
    FileList: '📁',
    TaskList: '✅',
    Error: '❌',
    Warning: '⚠️',
    Info: 'ℹ️',
    Progress: '⏳',
  };
  return icons[type];
}

export function getDiffLineClass(type: DiffLineType): string {
  switch (type) {
    case 'Addition':
      return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200';
    case 'Deletion':
      return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
}
