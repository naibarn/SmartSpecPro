/**
 * SmartSpec Pro - Long Memory Store
 * 
 * Workspace-scoped Long Memory that is shared across all pages:
 * - KiloCli
 * - LLMChat
 * - Terminal
 * 
 * Features:
 * - Project-scoped memories (by workspace)
 * - Automatic memory retrieval and extraction
 * - Manual memory save with confirmation
 * - Memory panel for viewing and managing
 */

import { create } from 'zustand';
import { persist, createJSONStorage, devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { 
  Memory, 
  MemoryType, 
  Project,
  kiloGetOrCreateProject,
  kiloGetProjectMemories,
  kiloSaveMemory,
  kiloDeleteMemory,
  kiloSearchMemories,
  kiloGetRelevantMemories,
  kiloExtractMemories,
  ConversationMessage
} from '../services/kiloCli';

// State interface
interface MemoryState {
  // Project state
  project: Project | null;
  projectLoading: boolean;
  projectError: string | null;
  
  // Memory state
  memories: Memory[];
  memoriesLoading: boolean;
  memoriesError: string | null;
  
  // UI state
  showMemoryPanel: boolean;
  showMemoryDialog: boolean;
  memoryDialogData: {
    text: string;
    suggestedTitle: string;
    suggestedType: MemoryType;
    importance: number;
    isAutoSuggestion: boolean;
  } | null;
  
  // Context menu state
  selectedText: string;
  contextMenuPos: { x: number; y: number } | null;
}

// Actions interface
interface MemoryActions {
  // Project actions
  initProject: (workspace: string) => Promise<void>;
  clearProject: () => void;
  
  // Memory CRUD actions
  loadMemories: (limit?: number) => Promise<void>;
  saveMemory: (
    type: MemoryType,
    title: string,
    content: string,
    options?: {
      importance?: number;
      tags?: string[];
      source?: string;
    }
  ) => Promise<Memory | null>;
  deleteMemory: (memoryId: string) => Promise<void>;
  
  // Memory retrieval actions
  searchMemories: (query: string, options?: {
    types?: MemoryType[];
    minImportance?: number;
    limit?: number;
  }) => Promise<Memory[]>;
  getRelevantMemories: (query: string, options?: {
    types?: MemoryType[];
    limit?: number;
  }) => Promise<{ memories: Memory[]; context: string }>;
  extractMemories: (
    conversation: ConversationMessage[],
    source?: string
  ) => Promise<Memory[]>;
  
  // UI actions
  setShowMemoryPanel: (show: boolean) => void;
  toggleMemoryPanel: () => void;
  
  // Dialog actions
  openMemoryDialog: (text: string, isAutoSuggestion?: boolean) => void;
  closeMemoryDialog: () => void;
  
  // Context menu actions
  setSelectedText: (text: string) => void;
  setContextMenuPos: (pos: { x: number; y: number } | null) => void;
}

// Helper: Detect important content patterns
const detectImportantContent = (text: string): { type: MemoryType; importance: number; title: string } | null => {
  const patterns = [
    { regex: /(?:decision|ตัดสินใจ|เลือก|ใช้|กำหนด).*?(?:ว่า|ให้|เป็น)/i, type: 'decision' as MemoryType, importance: 8, prefix: 'Decision: ' },
    { regex: /(?:plan|แผน|roadmap|milestone|phase|ขั้นตอน)/i, type: 'plan' as MemoryType, importance: 9, prefix: 'Plan: ' },
    { regex: /(?:architecture|โครงสร้าง|design pattern|layer|module)/i, type: 'architecture' as MemoryType, importance: 9, prefix: 'Architecture: ' },
    { regex: /(?:component|function|class|hook|service|util).*?(?:สร้าง|ทำ|มี|ใช้)/i, type: 'component' as MemoryType, importance: 7, prefix: 'Component: ' },
    { regex: /(?:todo|task|งาน|ต้อง|ยังไม่|ค้าง)/i, type: 'task' as MemoryType, importance: 6, prefix: 'Task: ' },
    { regex: /(?:important|สำคัญ|หมายเหตุ|note|remember|จำไว้)/i, type: 'code_knowledge' as MemoryType, importance: 8, prefix: 'Note: ' },
  ];
  
  for (const p of patterns) {
    if (p.regex.test(text)) {
      const title = text.length > 50 ? text.substring(0, 47) + '...' : text;
      return { type: p.type, importance: p.importance, title: p.prefix + title };
    }
  }
  return null;
};

// Debounce/Cache tracking to prevent rate limiting
let lastInitWorkspace: string | null = null;
let initInProgress = false;
let lastInitTime = 0;
const INIT_DEBOUNCE_MS = 2000; // 2 seconds debounce
let loadMemoriesInProgress = false;
let lastLoadMemoriesTime = 0;
const LOAD_MEMORIES_DEBOUNCE_MS = 3000; // 3 seconds debounce

// Initial state
const initialState: MemoryState = {
  project: null,
  projectLoading: false,
  projectError: null,
  memories: [],
  memoriesLoading: false,
  memoriesError: null,
  showMemoryPanel: false,
  showMemoryDialog: false,
  memoryDialogData: null,
  selectedText: '',
  contextMenuPos: null,
};

// Create store
export const useMemoryStore = create<MemoryState & MemoryActions>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...initialState,
        
        // Project actions
        initProject: async (workspace: string) => {
          if (!workspace) return;
          
          // Debounce: Skip if same workspace was initialized recently
          const now = Date.now();
          if (lastInitWorkspace === workspace && (now - lastInitTime) < INIT_DEBOUNCE_MS) {
            console.log('📁 initProject debounced (same workspace, too soon)');
            return;
          }
          
          // Skip if already in progress
          if (initInProgress) {
            console.log('📁 initProject skipped (already in progress)');
            return;
          }
          
          // Skip if project already loaded for this workspace
          const currentProject = get().project;
          if (currentProject && currentProject.workspace_path === workspace) {
            console.log('📁 Project already loaded for this workspace');
            return;
          }
          
          initInProgress = true;
          lastInitWorkspace = workspace;
          lastInitTime = now;
          
          set(state => {
            state.projectLoading = true;
            state.projectError = null;
          });
          
          try {
            const projectName = workspace.split('/').pop() || 'default';
            const project = await kiloGetOrCreateProject(projectName, workspace);
            
            set(state => {
              state.project = project;
              state.projectLoading = false;
            });
            
            console.log('📁 Project initialized:', project.id, project.name);
            
            // Load memories for this project (with small delay to avoid rate limit)
            setTimeout(() => {
              get().loadMemories().catch(console.error);
            }, 500);
          } catch (err) {
            console.error('❌ Failed to initialize project:', err);
            set(state => {
              state.projectLoading = false;
              state.projectError = String(err);
            });
          } finally {
            initInProgress = false;
          }
        },
        
        clearProject: () => {
          set(state => {
            state.project = null;
            state.memories = [];
          });
        },
        
        // Memory CRUD actions
        loadMemories: async (limit = 50) => {
          const { project, memories: existingMemories } = get();
          if (!project?.id) return;
          
          // Debounce: Skip if loaded recently
          const now = Date.now();
          if ((now - lastLoadMemoriesTime) < LOAD_MEMORIES_DEBOUNCE_MS && existingMemories.length > 0) {
            console.log('🧠 loadMemories debounced (loaded recently)');
            return;
          }
          
          // Skip if already in progress
          if (loadMemoriesInProgress) {
            console.log('🧠 loadMemories skipped (already in progress)');
            return;
          }
          
          loadMemoriesInProgress = true;
          lastLoadMemoriesTime = now;
          
          set(state => {
            state.memoriesLoading = true;
            state.memoriesError = null;
          });
          
          try {
            const memories = await kiloGetProjectMemories(project.id, { limit });
            
            set(state => {
              state.memories = memories;
              state.memoriesLoading = false;
            });
            
            console.log('🧠 Loaded', memories.length, 'memories');
          } catch (err) {
            console.error('❌ Failed to load memories:', err);
            set(state => {
              state.memoriesLoading = false;
              state.memoriesError = String(err);
            });
          } finally {
            loadMemoriesInProgress = false;
          }
        },
        
        saveMemory: async (type, title, content, options) => {
          const { project } = get();
          if (!project?.id) {
            console.error('No project ID');
            return null;
          }
          
          try {
            const memory = await kiloSaveMemory(project.id, type, title, content, {
              importance: options?.importance ?? 5,
              tags: options?.tags ?? [],
              source: options?.source ?? 'manual',
            });
            
            // Add to local state
            set(state => {
              state.memories = [memory, ...state.memories].slice(0, 100);
              state.showMemoryDialog = false;
              state.memoryDialogData = null;
            });
            
            console.log('🧠 Saved memory:', memory.title);
            return memory;
          } catch (err) {
            console.error('❌ Failed to save memory:', err);
            return null;
          }
        },
        
        deleteMemory: async (memoryId: string) => {
          try {
            await kiloDeleteMemory(memoryId);
            
            set(state => {
              state.memories = state.memories.filter(m => m.id !== memoryId);
            });
            
            console.log('🗑️ Deleted memory:', memoryId);
          } catch (err) {
            console.error('❌ Failed to delete memory:', err);
          }
        },
        
        // Memory retrieval actions
        searchMemories: async (query, options) => {
          const { project } = get();
          if (!project?.id) return [];
          
          try {
            return await kiloSearchMemories(project.id, query, options);
          } catch (err) {
            console.error('❌ Failed to search memories:', err);
            return [];
          }
        },
        
        getRelevantMemories: async (query, options) => {
          const { project } = get();
          if (!project?.id) return { memories: [], context: '' };
          
          try {
            return await kiloGetRelevantMemories(project.id, query, options);
          } catch (err) {
            console.error('❌ Failed to get relevant memories:', err);
            return { memories: [], context: '' };
          }
        },
        
        extractMemories: async (conversation, source) => {
          const { project } = get();
          if (!project?.id) return [];
          
          try {
            const extracted = await kiloExtractMemories(project.id, conversation, source);
            
            if (extracted.length > 0) {
              set(state => {
                state.memories = [...extracted, ...state.memories].slice(0, 100);
              });
              console.log('🧠 Extracted', extracted.length, 'memories');
            }
            
            return extracted;
          } catch (err) {
            console.error('❌ Failed to extract memories:', err);
            return [];
          }
        },
        
        // UI actions
        setShowMemoryPanel: (show) => {
          set(state => {
            state.showMemoryPanel = show;
          });
        },
        
        toggleMemoryPanel: () => {
          set(state => {
            state.showMemoryPanel = !state.showMemoryPanel;
          });
        },
        
        // Dialog actions
        openMemoryDialog: (text, isAutoSuggestion = false) => {
          const detected = detectImportantContent(text);
          
          set(state => {
            state.memoryDialogData = {
              text,
              suggestedTitle: detected?.title || (text.length > 50 ? text.substring(0, 47) + '...' : text),
              suggestedType: detected?.type || 'code_knowledge',
              importance: detected?.importance || 5,
              isAutoSuggestion,
            };
            state.showMemoryDialog = true;
            state.contextMenuPos = null;
          });
        },
        
        closeMemoryDialog: () => {
          set(state => {
            state.showMemoryDialog = false;
            state.memoryDialogData = null;
          });
        },
        
        // Context menu actions
        setSelectedText: (text) => {
          set(state => {
            state.selectedText = text;
            if (!text) {
              state.contextMenuPos = null;
            }
          });
        },
        
        setContextMenuPos: (pos) => {
          set(state => {
            state.contextMenuPos = pos;
          });
        },
      })),
      {
        name: 'smartspec-memory-store',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          // Only persist UI preferences, not data
          showMemoryPanel: state.showMemoryPanel,
        }),
      }
    ),
    { name: 'MemoryStore' }
  )
);

// Selectors for optimized subscriptions
export const selectProject = (state: MemoryState & MemoryActions) => state.project;
export const selectMemories = (state: MemoryState & MemoryActions) => state.memories;
export const selectMemoriesByType = (type: MemoryType) => (state: MemoryState & MemoryActions) => 
  state.memories.filter(m => m.type === type);
export const selectMemoryStats = (state: MemoryState & MemoryActions) => ({
  total: state.memories.length,
  decisions: state.memories.filter(m => m.type === 'decision').length,
  plans: state.memories.filter(m => m.type === 'plan').length,
  components: state.memories.filter(m => m.type === 'component').length,
  tasks: state.memories.filter(m => m.type === 'task').length,
});
export const selectShowMemoryPanel = (state: MemoryState & MemoryActions) => state.showMemoryPanel;
export const selectMemoryDialog = (state: MemoryState & MemoryActions) => ({
  show: state.showMemoryDialog,
  data: state.memoryDialogData,
});
export const selectContextMenu = (state: MemoryState & MemoryActions) => ({
  selectedText: state.selectedText,
  pos: state.contextMenuPos,
});

// Export helper
export { detectImportantContent };
