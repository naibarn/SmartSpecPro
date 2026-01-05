/**
 * SmartSpec Pro - Global State Management
 * Priority 5: Performance Optimization
 * 
 * Features:
 * - Zustand-based state management
 * - Selective subscriptions for performance
 * - Persistence middleware
 * - DevTools integration
 * - Optimized re-renders
 */

import { create } from 'zustand';
import { persist, createJSONStorage, devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Mode } from '../components/ModeSelector';

// Types
interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

interface LLMSettings {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
}

interface KiloSettings {
  autoApproval: boolean;
  parallelMode: boolean;
  maxParallelTasks: number;
  defaultMode: 'code' | 'architect' | 'debug' | 'ask';
  skillsDirectory: string;
}

interface MemorySettings {
  semanticEnabled: boolean;
  episodicEnabled: boolean;
  maxSemanticItems: number;
  maxEpisodicItems: number;
  autoCleanup: boolean;
  cleanupDays: number;
}

interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: boolean;
  telemetry: boolean;
}

interface WorkflowExecution {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  progress: number;
  startedAt: Date;
}

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

// State interface
interface AppState {
  // User
  user: User | null;
  isAuthenticated: boolean;
  
  // UI State
  activeView: string;
  selectedMode: Mode;
  sidebarCollapsed: boolean;
  
  // Settings
  llmSettings: LLMSettings;
  kiloSettings: KiloSettings;
  memorySettings: MemorySettings;
  appSettings: AppSettings;
  
  // Runtime State
  currentWorkspace: string | null;
  activeExecutions: WorkflowExecution[];
  notifications: Notification[];
  
  // Loading States
  isLoading: boolean;
  loadingMessage: string | null;
}

// Actions interface
interface AppActions {
  // User actions
  setUser: (user: User | null) => void;
  logout: () => void;
  
  // UI actions
  setActiveView: (view: string) => void;
  setSelectedMode: (mode: Mode) => void;
  toggleSidebar: () => void;
  
  // Settings actions
  updateLLMSettings: (settings: Partial<LLMSettings>) => void;
  updateKiloSettings: (settings: Partial<KiloSettings>) => void;
  updateMemorySettings: (settings: Partial<MemorySettings>) => void;
  updateAppSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
  
  // Workspace actions
  setCurrentWorkspace: (workspace: string | null) => void;
  
  // Execution actions
  addExecution: (execution: WorkflowExecution) => void;
  updateExecution: (id: string, updates: Partial<WorkflowExecution>) => void;
  removeExecution: (id: string) => void;
  
  // Notification actions
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  
  // Loading actions
  setLoading: (isLoading: boolean, message?: string) => void;
}

// Default values
const defaultLLMSettings: LLMSettings = {
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 4096,
};

const defaultKiloSettings: KiloSettings = {
  autoApproval: false,
  parallelMode: false,
  maxParallelTasks: 4,
  defaultMode: 'code',
  skillsDirectory: '.kilocode/skills',
};

const defaultMemorySettings: MemorySettings = {
  semanticEnabled: true,
  episodicEnabled: true,
  maxSemanticItems: 1000,
  maxEpisodicItems: 5000,
  autoCleanup: true,
  cleanupDays: 30,
};

const defaultAppSettings: AppSettings = {
  theme: 'system',
  language: 'en',
  notifications: true,
  telemetry: false,
};

const initialState: AppState = {
  user: null,
  isAuthenticated: false,
  activeView: 'chat',
  selectedMode: 'orchestrator',
  sidebarCollapsed: false,
  llmSettings: defaultLLMSettings,
  kiloSettings: defaultKiloSettings,
  memorySettings: defaultMemorySettings,
  appSettings: defaultAppSettings,
  currentWorkspace: null,
  activeExecutions: [],
  notifications: [],
  isLoading: false,
  loadingMessage: null,
};

// Create store with middleware
export const useAppStore = create<AppState & AppActions>()(
  devtools(
    subscribeWithSelector(
      persist(
        immer((set, get) => ({
          ...initialState,
          
          // User actions
          setUser: (user) => set((state) => {
            state.user = user;
            state.isAuthenticated = user !== null;
          }),
          
          logout: () => set((state) => {
            state.user = null;
            state.isAuthenticated = false;
            state.currentWorkspace = null;
            state.activeExecutions = [];
          }),
          
          // UI actions
          setActiveView: (view) => set((state) => {
            state.activeView = view;
          }),
          
          setSelectedMode: (mode) => set((state) => {
            state.selectedMode = mode;
          }),
          
          toggleSidebar: () => set((state) => {
            state.sidebarCollapsed = !state.sidebarCollapsed;
          }),
          
          // Settings actions
          updateLLMSettings: (settings) => set((state) => {
            Object.assign(state.llmSettings, settings);
          }),
          
          updateKiloSettings: (settings) => set((state) => {
            Object.assign(state.kiloSettings, settings);
          }),
          
          updateMemorySettings: (settings) => set((state) => {
            Object.assign(state.memorySettings, settings);
          }),
          
          updateAppSettings: (settings) => set((state) => {
            Object.assign(state.appSettings, settings);
          }),
          
          resetSettings: () => set((state) => {
            state.llmSettings = defaultLLMSettings;
            state.kiloSettings = defaultKiloSettings;
            state.memorySettings = defaultMemorySettings;
            state.appSettings = defaultAppSettings;
          }),
          
          // Workspace actions
          setCurrentWorkspace: (workspace) => set((state) => {
            state.currentWorkspace = workspace;
          }),
          
          // Execution actions
          addExecution: (execution) => set((state) => {
            state.activeExecutions.push(execution);
          }),
          
          updateExecution: (id, updates) => set((state) => {
            const index = state.activeExecutions.findIndex(e => e.id === id);
            if (index !== -1) {
              Object.assign(state.activeExecutions[index], updates);
            }
          }),
          
          removeExecution: (id) => set((state) => {
            state.activeExecutions = state.activeExecutions.filter(e => e.id !== id);
          }),
          
          // Notification actions
          addNotification: (notification) => set((state) => {
            state.notifications.unshift({
              ...notification,
              id: crypto.randomUUID(),
              timestamp: new Date(),
              read: false,
            });
            // Keep only last 50 notifications
            if (state.notifications.length > 50) {
              state.notifications = state.notifications.slice(0, 50);
            }
          }),
          
          markNotificationRead: (id) => set((state) => {
            const notification = state.notifications.find(n => n.id === id);
            if (notification) {
              notification.read = true;
            }
          }),
          
          clearNotifications: () => set((state) => {
            state.notifications = [];
          }),
          
          // Loading actions
          setLoading: (isLoading, message) => set((state) => {
            state.isLoading = isLoading;
            state.loadingMessage = message || null;
          }),
        })),
        {
          name: 'smartspec-storage',
          storage: createJSONStorage(() => localStorage),
          partialize: (state) => ({
            // Only persist these fields
            llmSettings: state.llmSettings,
            kiloSettings: state.kiloSettings,
            memorySettings: state.memorySettings,
            appSettings: state.appSettings,
            sidebarCollapsed: state.sidebarCollapsed,
            currentWorkspace: state.currentWorkspace,
          }),
        }
      )
    ),
    { name: 'SmartSpec Store' }
  )
);

// Selectors for optimized subscriptions
export const selectUser = (state: AppState) => state.user;
export const selectIsAuthenticated = (state: AppState) => state.isAuthenticated;
export const selectActiveView = (state: AppState) => state.activeView;
export const selectSelectedMode = (state: AppState) => state.selectedMode;
export const selectSidebarCollapsed = (state: AppState) => state.sidebarCollapsed;
export const selectLLMSettings = (state: AppState) => state.llmSettings;
export const selectKiloSettings = (state: AppState) => state.kiloSettings;
export const selectMemorySettings = (state: AppState) => state.memorySettings;
export const selectAppSettings = (state: AppState) => state.appSettings;
export const selectCurrentWorkspace = (state: AppState) => state.currentWorkspace;
export const selectActiveExecutions = (state: AppState) => state.activeExecutions;
export const selectNotifications = (state: AppState) => state.notifications;
export const selectUnreadNotifications = (state: AppState) => 
  state.notifications.filter(n => !n.read);
export const selectIsLoading = (state: AppState) => state.isLoading;
export const selectRunningExecutions = (state: AppState) =>
  state.activeExecutions.filter(e => e.status === 'running');

// Hooks for common patterns
export const useUser = () => useAppStore(selectUser);
export const useIsAuthenticated = () => useAppStore(selectIsAuthenticated);
export const useActiveView = () => useAppStore(selectActiveView);
export const useSelectedMode = () => useAppStore(selectSelectedMode);
export const useLLMSettings = () => useAppStore(selectLLMSettings);
export const useKiloSettings = () => useAppStore(selectKiloSettings);
export const useMemorySettings = () => useAppStore(selectMemorySettings);
export const useAppSettings = () => useAppStore(selectAppSettings);
export const useNotifications = () => useAppStore(selectNotifications);
export const useRunningExecutions = () => useAppStore(selectRunningExecutions);

// Subscribe to specific state changes
export const subscribeToExecutions = (callback: (executions: WorkflowExecution[]) => void) => {
  return useAppStore.subscribe(
    (state) => state.activeExecutions,
    callback,
    { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
  );
};

export const subscribeToNotifications = (callback: (notifications: Notification[]) => void) => {
  return useAppStore.subscribe(
    (state) => state.notifications,
    callback
  );
};
