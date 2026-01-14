// Spec Builder Service - Frontend service for Visual Spec Builder
//
// Provides:
// - Document management
// - Canvas state management
// - Component operations
// - Export operations

import { invoke } from '@tauri-apps/api/core';
import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';

// ============================================
// Types
// ============================================

export interface SpecDocument {
  id: string;
  name: string;
  description?: string;
  version: string;
  created_at: number;
  updated_at: number;
  canvas: Canvas;
  metadata: SpecMetadata;
}

export interface SpecMetadata {
  author?: string;
  project_id?: string;
  tags: string[];
  status: SpecStatus;
}

export type SpecStatus = 'draft' | 'review' | 'approved' | 'archived';

export interface Canvas {
  width: number;
  height: number;
  zoom: number;
  pan_x: number;
  pan_y: number;
  grid_enabled: boolean;
  snap_to_grid: boolean;
  grid_size: number;
  components: CanvasComponent[];
  connections: Connection[];
}

export interface CanvasComponent {
  id: string;
  component_type: ComponentType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  locked: boolean;
  visible: boolean;
  properties: ComponentProperties;
  style: ComponentStyle;
}

export type ComponentType =
  | 'section' | 'container' | 'card'
  | 'heading' | 'paragraph' | 'list' | 'table' | 'image'
  | 'user_story' | 'requirement' | 'acceptance_criteria'
  | 'api_endpoint' | 'data_model' | 'flow_chart' | 'sequence'
  | 'button' | 'input' | 'form' | 'navigation'
  | 'note' | 'comment' | 'arrow' | 'connector';

export interface ComponentProperties {
  title?: string;
  content?: string;
  items?: string[];
  priority?: Priority;
  status?: ItemStatus;
  assignee?: string;
  due_date?: string;
  custom: Record<string, unknown>;
}

export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ItemStatus = 'todo' | 'in_progress' | 'done' | 'blocked';

export interface ComponentStyle {
  background_color?: string;
  border_color?: string;
  border_width?: number;
  border_radius?: number;
  text_color?: string;
  font_size?: number;
  font_weight?: string;
  padding?: number;
  opacity?: number;
  shadow?: boolean;
}

export interface Connection {
  id: string;
  from_component: string;
  from_anchor: Anchor;
  to_component: string;
  to_anchor: Anchor;
  connection_type: ConnectionType;
  label?: string;
  style: ConnectionStyle;
}

export type Anchor = 'top' | 'right' | 'bottom' | 'left' | 'center';
export type ConnectionType = 'arrow' | 'line' | 'dashed' | 'dependency' | 'flow';

export interface ConnectionStyle {
  color: string;
  width: number;
  arrow_size: number;
}

export interface ComponentLibrary {
  categories: ComponentCategory[];
}

export interface ComponentCategory {
  id: string;
  name: string;
  icon: string;
  components: ComponentTemplate[];
}

export interface ComponentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  component_type: ComponentType;
  default_width: number;
  default_height: number;
  default_properties: ComponentProperties;
  default_style: ComponentStyle;
}

export interface DocumentSummary {
  id: string;
  name: string;
  description?: string;
  status: string;
  component_count: number;
  updated_at: number;
}

export interface ComponentUpdate {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  locked?: boolean;
  visible?: boolean;
  properties?: ComponentProperties;
  style?: ComponentStyle;
}

// ============================================
// API Functions
// ============================================

export async function getLibrary(): Promise<ComponentLibrary> {
  return invoke('spec_get_library');
}

export async function getCategories(): Promise<ComponentCategory[]> {
  return invoke('spec_get_categories');
}

export async function createDocument(name: string, description?: string): Promise<SpecDocument> {
  return invoke('spec_create_document', { name, description });
}

export async function getDocument(documentId: string): Promise<SpecDocument> {
  return invoke('spec_get_document', { documentId });
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  return invoke('spec_list_documents');
}

export async function saveDocument(document: SpecDocument): Promise<void> {
  return invoke('spec_save_document', { document });
}

export async function deleteDocument(documentId: string): Promise<void> {
  return invoke('spec_delete_document', { documentId });
}

export async function updateCanvas(documentId: string, canvas: Canvas): Promise<void> {
  return invoke('spec_update_canvas', { documentId, canvas });
}

export async function addComponent(
  documentId: string,
  templateId: string,
  x: number,
  y: number
): Promise<string> {
  return invoke('spec_add_component', { documentId, templateId, x, y });
}

export async function updateComponent(
  documentId: string,
  componentId: string,
  updates: ComponentUpdate
): Promise<void> {
  return invoke('spec_update_component', { documentId, componentId, updates });
}

export async function deleteComponent(documentId: string, componentId: string): Promise<void> {
  return invoke('spec_delete_component', { documentId, componentId });
}

export async function duplicateComponent(
  documentId: string,
  componentId: string,
  offsetX: number,
  offsetY: number
): Promise<string> {
  return invoke('spec_duplicate_component', { documentId, componentId, offsetX, offsetY });
}

export async function addConnection(
  documentId: string,
  fromComponent: string,
  fromAnchor: Anchor,
  toComponent: string,
  toAnchor: Anchor,
  connectionType: ConnectionType
): Promise<string> {
  return invoke('spec_add_connection', {
    documentId,
    fromComponent,
    fromAnchor,
    toComponent,
    toAnchor,
    connectionType,
  });
}

export async function deleteConnection(documentId: string, connectionId: string): Promise<void> {
  return invoke('spec_delete_connection', { documentId, connectionId });
}

export async function exportMarkdown(documentId: string): Promise<string> {
  return invoke('spec_export_markdown', { documentId });
}

export async function exportJson(documentId: string): Promise<string> {
  return invoke('spec_export_json', { documentId });
}

// ============================================
// Spec Builder Context
// ============================================

interface SpecBuilderContextValue {
  // Library
  library: ComponentLibrary | null;
  
  // Documents
  documents: DocumentSummary[];
  currentDocument: SpecDocument | null;
  isLoading: boolean;
  error: string | null;
  
  // Selection
  selectedComponentIds: string[];
  hoveredComponentId: string | null;
  
  // Canvas state
  tool: CanvasTool;
  setTool: (tool: CanvasTool) => void;
  
  // Actions
  loadLibrary: () => Promise<void>;
  loadDocuments: () => Promise<void>;
  createNewDocument: (name: string, description?: string) => Promise<void>;
  openDocument: (documentId: string) => Promise<void>;
  saveCurrentDocument: () => Promise<void>;
  closeDocument: () => void;
  
  // Component actions
  addComponentToCanvas: (templateId: string, x: number, y: number) => Promise<void>;
  updateComponentOnCanvas: (componentId: string, updates: ComponentUpdate) => Promise<void>;
  deleteSelectedComponents: () => Promise<void>;
  duplicateSelectedComponents: () => Promise<void>;
  selectComponent: (componentId: string, addToSelection?: boolean) => void;
  deselectAll: () => void;
  setHoveredComponent: (componentId: string | null) => void;
  
  // Connection actions
  startConnection: (componentId: string, anchor: Anchor) => void;
  completeConnection: (componentId: string, anchor: Anchor) => Promise<void>;
  cancelConnection: () => void;
  connectionInProgress: ConnectionInProgress | null;
  
  // Canvas actions
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  toggleGrid: () => void;
  toggleSnapToGrid: () => void;
  
  // Export
  exportToMarkdown: () => Promise<string>;
  exportToJson: () => Promise<string>;
  
  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export type CanvasTool = 'select' | 'pan' | 'connect';

interface ConnectionInProgress {
  fromComponent: string;
  fromAnchor: Anchor;
}

const SpecBuilderContext = createContext<SpecBuilderContextValue | null>(null);

export function SpecBuilderProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<ComponentLibrary | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [currentDocument, setCurrentDocument] = useState<SpecDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>([]);
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [connectionInProgress, setConnectionInProgress] = useState<ConnectionInProgress | null>(null);
  
  // History for undo/redo
  const historyRef = useRef<SpecDocument[]>([]);
  const historyIndexRef = useRef(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Load library on mount
  useEffect(() => {
    loadLibrary();
    loadDocuments();
  }, []);

  const loadLibrary = useCallback(async () => {
    try {
      const lib = await getLibrary();
      setLibrary(lib);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const createNewDocument = useCallback(async (name: string, description?: string) => {
    setIsLoading(true);
    try {
      const doc = await createDocument(name, description);
      setCurrentDocument(doc);
      await loadDocuments();
      pushHistory(doc);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [loadDocuments]);

  const openDocument = useCallback(async (documentId: string) => {
    setIsLoading(true);
    try {
      const doc = await getDocument(documentId);
      setCurrentDocument(doc);
      setSelectedComponentIds([]);
      historyRef.current = [doc];
      historyIndexRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveCurrentDocument = useCallback(async () => {
    if (!currentDocument) return;
    setIsLoading(true);
    try {
      await saveDocument(currentDocument);
      await loadDocuments();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [currentDocument, loadDocuments]);

  const closeDocument = useCallback(() => {
    setCurrentDocument(null);
    setSelectedComponentIds([]);
    historyRef.current = [];
    historyIndexRef.current = -1;
  }, []);

  const pushHistory = useCallback((doc: SpecDocument) => {
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(JSON.parse(JSON.stringify(doc)));
    historyRef.current = newHistory.slice(-50); // Keep last 50 states
    historyIndexRef.current = historyRef.current.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      setCurrentDocument(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(true);
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      setCurrentDocument(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current])));
      setCanUndo(true);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    }
  }, []);

  // Component actions
  const addComponentToCanvas = useCallback(async (templateId: string, x: number, y: number) => {
    if (!currentDocument) return;
    try {
      const componentId = await addComponent(currentDocument.id, templateId, x, y);
      const updatedDoc = await getDocument(currentDocument.id);
      setCurrentDocument(updatedDoc);
      setSelectedComponentIds([componentId]);
      pushHistory(updatedDoc);
    } catch (e) {
      setError(String(e));
    }
  }, [currentDocument, pushHistory]);

  const updateComponentOnCanvas = useCallback(async (componentId: string, updates: ComponentUpdate) => {
    if (!currentDocument) return;
    try {
      await updateComponent(currentDocument.id, componentId, updates);
      const updatedDoc = await getDocument(currentDocument.id);
      setCurrentDocument(updatedDoc);
      pushHistory(updatedDoc);
    } catch (e) {
      setError(String(e));
    }
  }, [currentDocument, pushHistory]);

  const deleteSelectedComponents = useCallback(async () => {
    if (!currentDocument || selectedComponentIds.length === 0) return;
    try {
      for (const id of selectedComponentIds) {
        await deleteComponent(currentDocument.id, id);
      }
      const updatedDoc = await getDocument(currentDocument.id);
      setCurrentDocument(updatedDoc);
      setSelectedComponentIds([]);
      pushHistory(updatedDoc);
    } catch (e) {
      setError(String(e));
    }
  }, [currentDocument, selectedComponentIds, pushHistory]);

  const duplicateSelectedComponents = useCallback(async () => {
    if (!currentDocument || selectedComponentIds.length === 0) return;
    try {
      const newIds: string[] = [];
      for (const id of selectedComponentIds) {
        const newId = await duplicateComponent(currentDocument.id, id, 20, 20);
        newIds.push(newId);
      }
      const updatedDoc = await getDocument(currentDocument.id);
      setCurrentDocument(updatedDoc);
      setSelectedComponentIds(newIds);
      pushHistory(updatedDoc);
    } catch (e) {
      setError(String(e));
    }
  }, [currentDocument, selectedComponentIds, pushHistory]);

  const selectComponent = useCallback((componentId: string, addToSelection = false) => {
    if (addToSelection) {
      setSelectedComponentIds(prev => 
        prev.includes(componentId)
          ? prev.filter(id => id !== componentId)
          : [...prev, componentId]
      );
    } else {
      setSelectedComponentIds([componentId]);
    }
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedComponentIds([]);
  }, []);

  // Connection actions
  const startConnection = useCallback((componentId: string, anchor: Anchor) => {
    setConnectionInProgress({ fromComponent: componentId, fromAnchor: anchor });
    setTool('connect');
  }, []);

  const completeConnection = useCallback(async (componentId: string, anchor: Anchor) => {
    if (!currentDocument || !connectionInProgress) return;
    try {
      await addConnection(
        currentDocument.id,
        connectionInProgress.fromComponent,
        connectionInProgress.fromAnchor,
        componentId,
        anchor,
        'arrow'
      );
      const updatedDoc = await getDocument(currentDocument.id);
      setCurrentDocument(updatedDoc);
      pushHistory(updatedDoc);
    } catch (e) {
      setError(String(e));
    } finally {
      setConnectionInProgress(null);
      setTool('select');
    }
  }, [currentDocument, connectionInProgress, pushHistory]);

  const cancelConnection = useCallback(() => {
    setConnectionInProgress(null);
    setTool('select');
  }, []);

  // Canvas actions
  const setZoom = useCallback((zoom: number) => {
    if (!currentDocument) return;
    setCurrentDocument(prev => prev ? {
      ...prev,
      canvas: { ...prev.canvas, zoom: Math.max(0.1, Math.min(3, zoom)) }
    } : null);
  }, [currentDocument]);

  const setPan = useCallback((x: number, y: number) => {
    if (!currentDocument) return;
    setCurrentDocument(prev => prev ? {
      ...prev,
      canvas: { ...prev.canvas, pan_x: x, pan_y: y }
    } : null);
  }, [currentDocument]);

  const toggleGrid = useCallback(() => {
    if (!currentDocument) return;
    setCurrentDocument(prev => prev ? {
      ...prev,
      canvas: { ...prev.canvas, grid_enabled: !prev.canvas.grid_enabled }
    } : null);
  }, [currentDocument]);

  const toggleSnapToGrid = useCallback(() => {
    if (!currentDocument) return;
    setCurrentDocument(prev => prev ? {
      ...prev,
      canvas: { ...prev.canvas, snap_to_grid: !prev.canvas.snap_to_grid }
    } : null);
  }, [currentDocument]);

  // Export
  const exportToMarkdown = useCallback(async (): Promise<string> => {
    if (!currentDocument) return '';
    return exportMarkdown(currentDocument.id);
  }, [currentDocument]);

  const exportToJson = useCallback(async (): Promise<string> => {
    if (!currentDocument) return '';
    return exportJson(currentDocument.id);
  }, [currentDocument]);

  const value: SpecBuilderContextValue = {
    library,
    documents,
    currentDocument,
    isLoading,
    error,
    selectedComponentIds,
    hoveredComponentId,
    tool,
    setTool,
    loadLibrary,
    loadDocuments,
    createNewDocument,
    openDocument,
    saveCurrentDocument,
    closeDocument,
    addComponentToCanvas,
    updateComponentOnCanvas,
    deleteSelectedComponents,
    duplicateSelectedComponents,
    selectComponent,
    deselectAll,
    setHoveredComponent: setHoveredComponentId,
    startConnection,
    completeConnection,
    cancelConnection,
    connectionInProgress,
    setZoom,
    setPan,
    toggleGrid,
    toggleSnapToGrid,
    exportToMarkdown,
    exportToJson,
    undo,
    redo,
    canUndo,
    canRedo,
  };

  return (
    <SpecBuilderContext.Provider value={value}>
      {children}
    </SpecBuilderContext.Provider>
  );
}

export function useSpecBuilder() {
  const context = useContext(SpecBuilderContext);
  if (!context) {
    throw new Error('useSpecBuilder must be used within a SpecBuilderProvider');
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

export function getComponentTypeIcon(type: ComponentType): string {
  const icons: Record<ComponentType, string> = {
    section: '📦',
    container: '📁',
    card: '🃏',
    heading: '🔤',
    paragraph: '📄',
    list: '📋',
    table: '📊',
    image: '🖼️',
    user_story: '👤',
    requirement: '📌',
    acceptance_criteria: '✓',
    api_endpoint: '🔌',
    data_model: '🗃️',
    flow_chart: '📈',
    sequence: '🔀',
    button: '🔘',
    input: '📝',
    form: '📑',
    navigation: '🧭',
    note: '📝',
    comment: '💬',
    arrow: '➡️',
    connector: '🔗',
  };
  return icons[type] || '📦';
}

export function getPriorityColor(priority: Priority): string {
  const colors: Record<Priority, string> = {
    low: '#22c55e',
    medium: '#eab308',
    high: '#f97316',
    critical: '#ef4444',
  };
  return colors[priority];
}

export function getStatusColor(status: ItemStatus): string {
  const colors: Record<ItemStatus, string> = {
    todo: '#6b7280',
    in_progress: '#3b82f6',
    done: '#22c55e',
    blocked: '#ef4444',
  };
  return colors[status];
}
