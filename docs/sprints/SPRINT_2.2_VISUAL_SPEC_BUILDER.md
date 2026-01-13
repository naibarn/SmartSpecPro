# Sprint 2.2: Visual Spec Builder

**Duration:** 2 สัปดาห์ (10-14 วันทำงาน)  
**Priority:** High  
**Dependencies:** Sprint 2.1 (Template Wizard)  

---

## 🎯 Sprint Goal

สร้าง Visual Spec Builder ที่ช่วยให้ผู้ใช้ที่ไม่ใช่ developer สามารถ:
1. สร้าง specification ผ่าน drag-and-drop UI
2. ออกแบบ user flows และ data models
3. Generate spec document อัตโนมัติ
4. แปลง visual spec เป็น tasks สำหรับ AI agent

---

## 📋 User Stories

### US-2.2.1: Component Palette
> **As a** non-technical user  
> **I want** to drag pre-built components onto a canvas  
> **So that** I can describe my application visually

**Acceptance Criteria:**
- [ ] Component categories (UI, Data, Logic, Integration)
- [ ] Drag-and-drop functionality
- [ ] Component preview และ description
- [ ] Search components

### US-2.2.2: Visual Canvas
> **As a** user  
> **I want** to arrange and connect components on a canvas  
> **So that** I can define the structure of my application

**Acceptance Criteria:**
- [ ] Canvas with zoom/pan
- [ ] Component placement
- [ ] Connection lines between components
- [ ] Grouping และ labeling
- [ ] Undo/redo

### US-2.2.3: Flow Diagrams
> **As a** user  
> **I want** to create user flow diagrams  
> **So that** I can describe how users interact with my application

**Acceptance Criteria:**
- [ ] Start/End nodes
- [ ] Action nodes
- [ ] Decision nodes
- [ ] Swimlanes (optional)
- [ ] Export as image

### US-2.2.4: Data Model Designer
> **As a** user  
> **I want** to design data models visually  
> **So that** I can define what data my application needs

**Acceptance Criteria:**
- [ ] Entity creation
- [ ] Field definition (name, type, constraints)
- [ ] Relationship lines (1:1, 1:N, N:N)
- [ ] Auto-generate schema

### US-2.2.5: Spec Generation
> **As a** user  
> **I want** to generate a specification document from my visual design  
> **So that** the AI agent can implement it

**Acceptance Criteria:**
- [ ] Generate markdown spec
- [ ] Include all components และ flows
- [ ] Generate task breakdown
- [ ] Save to workspace knowledge

---

## 🏗️ Technical Architecture

### Component System

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           COMPONENT SYSTEM                                       │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  COMPONENT PALETTE                                                           │
    │                                                                              │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
    │  │ UI          │  │ Data        │  │ Logic       │  │ Integration │         │
    │  │             │  │             │  │             │  │             │         │
    │  │ • Page      │  │ • Entity    │  │ • Auth      │  │ • API       │         │
    │  │ • Form      │  │ • Field     │  │ • Condition │  │ • Webhook   │         │
    │  │ • List      │  │ • Relation  │  │ • Loop      │  │ • Payment   │         │
    │  │ • Card      │  │ • Enum      │  │ • Action    │  │ • Email     │         │
    │  │ • Button    │  │ • File      │  │ • Event     │  │ • Storage   │         │
    │  │ • Input     │  │             │  │             │  │             │         │
    │  │ • Table     │  │             │  │             │  │             │         │
    │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
    └──────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  VISUAL CANVAS                                                               │
    │                                                                              │
    │  ┌────────────────────────────────────────────────────────────────────────┐ │
    │  │                                                                        │ │
    │  │    ┌─────────┐         ┌─────────┐         ┌─────────┐                │ │
    │  │    │  Page   │────────►│  Form   │────────►│  API    │                │ │
    │  │    │ Login   │         │ Login   │         │ Auth    │                │ │
    │  │    └─────────┘         └─────────┘         └─────────┘                │ │
    │  │         │                   │                   │                      │ │
    │  │         │                   │                   │                      │ │
    │  │         ▼                   ▼                   ▼                      │ │
    │  │    ┌─────────┐         ┌─────────┐         ┌─────────┐                │ │
    │  │    │  Page   │◄────────│ Entity  │◄────────│ Action  │                │ │
    │  │    │Dashboard│         │  User   │         │Redirect │                │ │
    │  │    └─────────┘         └─────────┘         └─────────┘                │ │
    │  │                                                                        │ │
    │  └────────────────────────────────────────────────────────────────────────┘ │
    └──────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  SPEC GENERATOR                                                              │
    │                                                                              │
    │  • Parse canvas components                                                   │
    │  • Extract relationships                                                     │
    │  • Generate markdown spec                                                    │
    │  • Create task breakdown                                                     │
    │  • Save to knowledge base                                                    │
    └──────────────────────────────────────────────────────────────────────────────┘
```

### Component Definition

```typescript
interface ComponentDefinition {
  id: string;
  type: string;
  category: 'ui' | 'data' | 'logic' | 'integration';
  name: string;
  description: string;
  icon: string;
  
  // Visual properties
  defaultSize: { width: number; height: number };
  resizable: boolean;
  
  // Configuration
  properties: PropertyDefinition[];
  
  // Connections
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  
  // Spec generation
  specTemplate: string;
  taskTemplate: string;
}

interface PropertyDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect' | 'entity';
  label: string;
  default?: any;
  options?: { value: string; label: string }[];
  required?: boolean;
}

interface PortDefinition {
  id: string;
  type: 'data' | 'flow' | 'event';
  label: string;
  multiple?: boolean;
}
```

### Canvas State

```typescript
interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: { x: number; y: number; zoom: number };
  selectedNodes: string[];
  history: CanvasState[];
  historyIndex: number;
}

interface CanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  properties: Record<string, any>;
  label?: string;
  group?: string;
}

interface CanvasEdge {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  type: 'data' | 'flow' | 'event';
  label?: string;
}
```

---

## 📁 Implementation Tasks

### Week 1: Canvas & Components

#### Task 2.2.1: Component Registry
**File:** `desktop-app/src/services/specBuilder/componentRegistry.ts`

```typescript
import { ComponentDefinition } from './types';

// UI Components
const PAGE_COMPONENT: ComponentDefinition = {
  id: 'page',
  type: 'page',
  category: 'ui',
  name: 'Page',
  description: 'A page or screen in your application',
  icon: '📄',
  defaultSize: { width: 200, height: 150 },
  resizable: true,
  properties: [
    { name: 'name', type: 'string', label: 'Page Name', required: true },
    { name: 'route', type: 'string', label: 'URL Route' },
    { name: 'auth', type: 'boolean', label: 'Requires Authentication', default: false },
    { name: 'layout', type: 'select', label: 'Layout', options: [
      { value: 'default', label: 'Default' },
      { value: 'dashboard', label: 'Dashboard' },
      { value: 'fullscreen', label: 'Fullscreen' },
    ]},
  ],
  inputs: [
    { id: 'nav', type: 'flow', label: 'Navigation' },
  ],
  outputs: [
    { id: 'content', type: 'flow', label: 'Content', multiple: true },
  ],
  specTemplate: `
### Page: {{name}}
- Route: \`{{route}}\`
- Authentication: {{#if auth}}Required{{else}}Public{{/if}}
- Layout: {{layout}}
`,
  taskTemplate: 'Create page {{name}} at route {{route}}',
};

const FORM_COMPONENT: ComponentDefinition = {
  id: 'form',
  type: 'form',
  category: 'ui',
  name: 'Form',
  description: 'A form for user input',
  icon: '📝',
  defaultSize: { width: 180, height: 120 },
  resizable: true,
  properties: [
    { name: 'name', type: 'string', label: 'Form Name', required: true },
    { name: 'fields', type: 'multiselect', label: 'Fields' },
    { name: 'submitAction', type: 'string', label: 'Submit Action' },
    { name: 'validation', type: 'boolean', label: 'Enable Validation', default: true },
  ],
  inputs: [
    { id: 'data', type: 'data', label: 'Initial Data' },
  ],
  outputs: [
    { id: 'submit', type: 'event', label: 'On Submit' },
    { id: 'data', type: 'data', label: 'Form Data' },
  ],
  specTemplate: `
### Form: {{name}}
- Fields: {{#each fields}}{{this}}, {{/each}}
- Validation: {{#if validation}}Enabled{{else}}Disabled{{/if}}
- Submit Action: {{submitAction}}
`,
  taskTemplate: 'Create form {{name}} with fields: {{fields}}',
};

// Data Components
const ENTITY_COMPONENT: ComponentDefinition = {
  id: 'entity',
  type: 'entity',
  category: 'data',
  name: 'Entity',
  description: 'A data entity/model',
  icon: '🗃️',
  defaultSize: { width: 200, height: 180 },
  resizable: true,
  properties: [
    { name: 'name', type: 'string', label: 'Entity Name', required: true },
    { name: 'fields', type: 'entity', label: 'Fields' },
    { name: 'timestamps', type: 'boolean', label: 'Include Timestamps', default: true },
    { name: 'softDelete', type: 'boolean', label: 'Soft Delete', default: false },
  ],
  inputs: [],
  outputs: [
    { id: 'data', type: 'data', label: 'Entity Data', multiple: true },
  ],
  specTemplate: `
### Entity: {{name}}
| Field | Type | Constraints |
|-------|------|-------------|
{{#each fields}}
| {{this.name}} | {{this.type}} | {{this.constraints}} |
{{/each}}
`,
  taskTemplate: 'Create entity {{name}} with fields',
};

// Logic Components
const AUTH_COMPONENT: ComponentDefinition = {
  id: 'auth',
  type: 'auth',
  category: 'logic',
  name: 'Authentication',
  description: 'User authentication logic',
  icon: '🔐',
  defaultSize: { width: 160, height: 100 },
  resizable: false,
  properties: [
    { name: 'methods', type: 'multiselect', label: 'Auth Methods', options: [
      { value: 'email', label: 'Email/Password' },
      { value: 'google', label: 'Google OAuth' },
      { value: 'github', label: 'GitHub OAuth' },
      { value: 'magic', label: 'Magic Link' },
    ]},
    { name: 'mfa', type: 'boolean', label: 'Enable MFA', default: false },
  ],
  inputs: [
    { id: 'credentials', type: 'data', label: 'Credentials' },
  ],
  outputs: [
    { id: 'success', type: 'flow', label: 'On Success' },
    { id: 'failure', type: 'flow', label: 'On Failure' },
    { id: 'user', type: 'data', label: 'User Data' },
  ],
  specTemplate: `
### Authentication
- Methods: {{#each methods}}{{this}}, {{/each}}
- MFA: {{#if mfa}}Enabled{{else}}Disabled{{/if}}
`,
  taskTemplate: 'Implement authentication with {{methods}}',
};

// Integration Components
const API_COMPONENT: ComponentDefinition = {
  id: 'api',
  type: 'api',
  category: 'integration',
  name: 'API Endpoint',
  description: 'REST API endpoint',
  icon: '⚡',
  defaultSize: { width: 160, height: 100 },
  resizable: false,
  properties: [
    { name: 'method', type: 'select', label: 'HTTP Method', options: [
      { value: 'GET', label: 'GET' },
      { value: 'POST', label: 'POST' },
      { value: 'PUT', label: 'PUT' },
      { value: 'DELETE', label: 'DELETE' },
    ]},
    { name: 'path', type: 'string', label: 'Path', required: true },
    { name: 'auth', type: 'boolean', label: 'Requires Auth', default: true },
  ],
  inputs: [
    { id: 'request', type: 'data', label: 'Request' },
  ],
  outputs: [
    { id: 'response', type: 'data', label: 'Response' },
  ],
  specTemplate: `
### API: {{method}} {{path}}
- Authentication: {{#if auth}}Required{{else}}Public{{/if}}
`,
  taskTemplate: 'Create {{method}} {{path}} endpoint',
};

export class ComponentRegistry {
  private components: Map<string, ComponentDefinition> = new Map();
  
  constructor() {
    this.registerDefaults();
  }
  
  private registerDefaults() {
    // UI
    this.register(PAGE_COMPONENT);
    this.register(FORM_COMPONENT);
    this.register(LIST_COMPONENT);
    this.register(CARD_COMPONENT);
    this.register(TABLE_COMPONENT);
    this.register(BUTTON_COMPONENT);
    this.register(INPUT_COMPONENT);
    this.register(MODAL_COMPONENT);
    
    // Data
    this.register(ENTITY_COMPONENT);
    this.register(FIELD_COMPONENT);
    this.register(RELATION_COMPONENT);
    this.register(ENUM_COMPONENT);
    
    // Logic
    this.register(AUTH_COMPONENT);
    this.register(CONDITION_COMPONENT);
    this.register(LOOP_COMPONENT);
    this.register(ACTION_COMPONENT);
    this.register(EVENT_COMPONENT);
    
    // Integration
    this.register(API_COMPONENT);
    this.register(WEBHOOK_COMPONENT);
    this.register(PAYMENT_COMPONENT);
    this.register(EMAIL_COMPONENT);
    this.register(STORAGE_COMPONENT);
  }
  
  register(component: ComponentDefinition) {
    this.components.set(component.id, component);
  }
  
  get(id: string): ComponentDefinition | undefined {
    return this.components.get(id);
  }
  
  getByCategory(category: string): ComponentDefinition[] {
    return Array.from(this.components.values())
      .filter(c => c.category === category);
  }
  
  getAll(): ComponentDefinition[] {
    return Array.from(this.components.values());
  }
  
  search(query: string): ComponentDefinition[] {
    const q = query.toLowerCase();
    return Array.from(this.components.values())
      .filter(c => 
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
  }
}

export const componentRegistry = new ComponentRegistry();
```

**Deliverables:**
- [ ] Component definitions
- [ ] Registry class
- [ ] Default components (20+)

#### Task 2.2.2: Visual Canvas Component
**File:** `desktop-app/src/pages/SpecBuilder/VisualCanvas.tsx`

```typescript
import React, { useCallback, useRef, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  EdgeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { ComponentNode } from './nodes/ComponentNode';
import { EntityNode } from './nodes/EntityNode';
import { FlowNode } from './nodes/FlowNode';
import { CustomEdge } from './edges/CustomEdge';
import { useCanvasHistory } from './hooks/useCanvasHistory';

const nodeTypes: NodeTypes = {
  component: ComponentNode,
  entity: EntityNode,
  flow: FlowNode,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

interface VisualCanvasProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onNodesChange?: (nodes: Node[]) => void;
  onEdgesChange?: (edges: Edge[]) => void;
  onNodeSelect?: (node: Node | null) => void;
}

export function VisualCanvas({
  initialNodes = [],
  initialEdges = [],
  onNodesChange,
  onEdgesChange,
  onNodeSelect,
}: VisualCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, handleNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, handleEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  
  const { undo, redo, canUndo, canRedo, saveState } = useCanvasHistory(
    nodes,
    edges,
    setNodes,
    setEdges
  );
  
  // Handle connection
  const onConnect = useCallback(
    (params: Connection) => {
      saveState();
      setEdges((eds) => addEdge({ ...params, type: 'custom' }, eds));
    },
    [setEdges, saveState]
  );
  
  // Handle drop from palette
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      
      const type = event.dataTransfer.getData('application/reactflow/type');
      const componentData = JSON.parse(
        event.dataTransfer.getData('application/reactflow/data')
      );
      
      if (!type || !reactFlowInstance) return;
      
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      
      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type: componentData.category === 'data' ? 'entity' : 'component',
        position,
        data: {
          ...componentData,
          properties: {},
        },
      };
      
      saveState();
      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes, saveState]
  );
  
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  
  // Handle node selection
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect?.(node);
    },
    [onNodeSelect]
  );
  
  const onPaneClick = useCallback(() => {
    onNodeSelect?.(null);
  }, [onNodeSelect]);
  
  // Handle delete
  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      saveState();
    },
    [saveState]
  );
  
  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z' && !e.shiftKey && canUndo) {
          e.preventDefault();
          undo();
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          if (canRedo) {
            e.preventDefault();
            redo();
          }
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);
  
  return (
    <div className="visual-canvas" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodesDelete={onNodesDelete}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
      >
        <Controls />
        <MiniMap />
        <Background variant="dots" gap={15} size={1} />
      </ReactFlow>
      
      {/* Toolbar */}
      <div className="canvas-toolbar">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↩️
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          ↪️
        </button>
        <button onClick={() => reactFlowInstance?.fitView()} title="Fit View">
          🔍
        </button>
      </div>
    </div>
  );
}
```

**Deliverables:**
- [ ] React Flow integration
- [ ] Drag-and-drop support
- [ ] Undo/redo
- [ ] Zoom/pan controls
- [ ] Mini map

#### Task 2.2.3: Component Palette
**File:** `desktop-app/src/pages/SpecBuilder/ComponentPalette.tsx`

```typescript
import React, { useState } from 'react';
import { componentRegistry, ComponentDefinition } from '@/services/specBuilder/componentRegistry';
import { Input } from '@/components/ui/input';

const CATEGORIES = [
  { id: 'ui', name: 'UI Components', icon: '🎨' },
  { id: 'data', name: 'Data Models', icon: '🗃️' },
  { id: 'logic', name: 'Logic', icon: '⚙️' },
  { id: 'integration', name: 'Integrations', icon: '🔌' },
];

export function ComponentPalette() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>('ui');
  
  const getComponents = (category: string) => {
    if (searchQuery) {
      return componentRegistry.search(searchQuery)
        .filter(c => c.category === category);
    }
    return componentRegistry.getByCategory(category);
  };
  
  const onDragStart = (
    event: React.DragEvent,
    component: ComponentDefinition
  ) => {
    event.dataTransfer.setData('application/reactflow/type', component.type);
    event.dataTransfer.setData(
      'application/reactflow/data',
      JSON.stringify(component)
    );
    event.dataTransfer.effectAllowed = 'move';
  };
  
  return (
    <div className="component-palette">
      <div className="palette-header">
        <h3>Components</h3>
        <Input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="palette-search"
        />
      </div>
      
      <div className="palette-categories">
        {CATEGORIES.map((category) => {
          const components = getComponents(category.id);
          const isExpanded = expandedCategory === category.id;
          
          return (
            <div key={category.id} className="palette-category">
              <button
                className="category-header"
                onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
              >
                <span className="category-icon">{category.icon}</span>
                <span className="category-name">{category.name}</span>
                <span className="category-count">{components.length}</span>
                <span className="category-chevron">{isExpanded ? '▼' : '▶'}</span>
              </button>
              
              {isExpanded && (
                <div className="category-components">
                  {components.map((component) => (
                    <div
                      key={component.id}
                      className="component-item"
                      draggable
                      onDragStart={(e) => onDragStart(e, component)}
                    >
                      <span className="component-icon">{component.icon}</span>
                      <div className="component-info">
                        <span className="component-name">{component.name}</span>
                        <span className="component-description">
                          {component.description}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Deliverables:**
- [ ] Category accordion
- [ ] Component cards
- [ ] Drag initiation
- [ ] Search filtering

#### Task 2.2.4: Property Editor
**File:** `desktop-app/src/pages/SpecBuilder/PropertyEditor.tsx`

```typescript
import React from 'react';
import { Node } from 'reactflow';
import { ComponentDefinition, PropertyDefinition } from '@/services/specBuilder/componentRegistry';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';

interface PropertyEditorProps {
  node: Node | null;
  componentDef: ComponentDefinition | null;
  onPropertyChange: (nodeId: string, property: string, value: any) => void;
}

export function PropertyEditor({
  node,
  componentDef,
  onPropertyChange,
}: PropertyEditorProps) {
  if (!node || !componentDef) {
    return (
      <div className="property-editor empty">
        <p>Select a component to edit its properties</p>
      </div>
    );
  }
  
  const handleChange = (property: string, value: any) => {
    onPropertyChange(node.id, property, value);
  };
  
  return (
    <div className="property-editor">
      <div className="editor-header">
        <span className="component-icon">{componentDef.icon}</span>
        <h3>{componentDef.name}</h3>
      </div>
      
      <div className="editor-content">
        {componentDef.properties.map((prop) => (
          <PropertyField
            key={prop.name}
            definition={prop}
            value={node.data.properties?.[prop.name] ?? prop.default}
            onChange={(value) => handleChange(prop.name, value)}
          />
        ))}
      </div>
      
      {/* Connections info */}
      <div className="editor-connections">
        <h4>Connections</h4>
        <div className="connections-list">
          <div className="connection-group">
            <h5>Inputs</h5>
            {componentDef.inputs.map((input) => (
              <div key={input.id} className="connection-item">
                <span className={`connection-type ${input.type}`} />
                <span>{input.label}</span>
              </div>
            ))}
          </div>
          <div className="connection-group">
            <h5>Outputs</h5>
            {componentDef.outputs.map((output) => (
              <div key={output.id} className="connection-item">
                <span className={`connection-type ${output.type}`} />
                <span>{output.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertyField({
  definition,
  value,
  onChange,
}: {
  definition: PropertyDefinition;
  value: any;
  onChange: (value: any) => void;
}) {
  switch (definition.type) {
    case 'string':
      return (
        <div className="property-field">
          <label>{definition.label}</label>
          <Input
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            required={definition.required}
          />
        </div>
      );
    
    case 'number':
      return (
        <div className="property-field">
          <label>{definition.label}</label>
          <Input
            type="number"
            value={value || 0}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
      );
    
    case 'boolean':
      return (
        <div className="property-field checkbox">
          <Checkbox
            checked={value || false}
            onCheckedChange={onChange}
          />
          <label>{definition.label}</label>
        </div>
      );
    
    case 'select':
      return (
        <div className="property-field">
          <label>{definition.label}</label>
          <Select
            value={value}
            onValueChange={onChange}
            options={definition.options || []}
          />
        </div>
      );
    
    case 'multiselect':
      return (
        <div className="property-field">
          <label>{definition.label}</label>
          <MultiSelect
            value={value || []}
            onChange={onChange}
            options={definition.options || []}
          />
        </div>
      );
    
    case 'entity':
      return (
        <div className="property-field">
          <label>{definition.label}</label>
          <EntityFieldEditor
            value={value || []}
            onChange={onChange}
          />
        </div>
      );
    
    default:
      return null;
  }
}
```

**Deliverables:**
- [ ] Property form
- [ ] Field types
- [ ] Validation
- [ ] Connection info

---

### Week 2: Spec Generation & Testing

#### Task 2.2.5: Spec Generator Service
**File:** `desktop-app/src/services/specBuilder/specGenerator.ts`

```typescript
import Handlebars from 'handlebars';
import { Node, Edge } from 'reactflow';
import { componentRegistry } from './componentRegistry';

interface GeneratedSpec {
  markdown: string;
  tasks: Task[];
  entities: Entity[];
  flows: Flow[];
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  dependencies: string[];
  estimatedHours: number;
}

interface Entity {
  name: string;
  fields: { name: string; type: string; constraints: string }[];
  relations: { target: string; type: string }[];
}

interface Flow {
  name: string;
  steps: { action: string; next: string | null }[];
}

export class SpecGenerator {
  private handlebars: typeof Handlebars;
  
  constructor() {
    this.handlebars = Handlebars.create();
    this.registerHelpers();
  }
  
  private registerHelpers() {
    this.handlebars.registerHelper('if', function(conditional, options) {
      if (conditional) {
        return options.fn(this);
      }
      return options.inverse(this);
    });
    
    this.handlebars.registerHelper('each', function(context, options) {
      let ret = '';
      for (let i = 0; i < context.length; i++) {
        ret += options.fn(context[i]);
      }
      return ret;
    });
  }
  
  generate(nodes: Node[], edges: Edge[]): GeneratedSpec {
    const entities = this.extractEntities(nodes, edges);
    const flows = this.extractFlows(nodes, edges);
    const tasks = this.generateTasks(nodes, edges);
    const markdown = this.generateMarkdown(nodes, edges, entities, flows);
    
    return { markdown, tasks, entities, flows };
  }
  
  private extractEntities(nodes: Node[], edges: Edge[]): Entity[] {
    const entityNodes = nodes.filter(n => n.data.category === 'data' && n.data.type === 'entity');
    
    return entityNodes.map(node => {
      const relations = edges
        .filter(e => e.source === node.id || e.target === node.id)
        .map(e => {
          const targetId = e.source === node.id ? e.target : e.source;
          const targetNode = nodes.find(n => n.id === targetId);
          return {
            target: targetNode?.data.properties?.name || 'Unknown',
            type: e.data?.relationType || '1:N',
          };
        });
      
      return {
        name: node.data.properties?.name || 'Unnamed',
        fields: node.data.properties?.fields || [],
        relations,
      };
    });
  }
  
  private extractFlows(nodes: Node[], edges: Edge[]): Flow[] {
    // Find flow start nodes (pages or entry points)
    const startNodes = nodes.filter(n => 
      n.data.category === 'ui' && n.data.type === 'page'
    );
    
    return startNodes.map(startNode => {
      const steps: { action: string; next: string | null }[] = [];
      const visited = new Set<string>();
      
      const traverse = (nodeId: string) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        const outEdges = edges.filter(e => e.source === nodeId && e.type === 'flow');
        const nextNodeId = outEdges[0]?.target || null;
        
        steps.push({
          action: node.data.properties?.name || node.data.name,
          next: nextNodeId ? nodes.find(n => n.id === nextNodeId)?.data.properties?.name : null,
        });
        
        if (nextNodeId) {
          traverse(nextNodeId);
        }
      };
      
      traverse(startNode.id);
      
      return {
        name: startNode.data.properties?.name || 'Flow',
        steps,
      };
    });
  }
  
  private generateTasks(nodes: Node[], edges: Edge[]): Task[] {
    const tasks: Task[] = [];
    let taskId = 1;
    
    // Group by category for ordering
    const categories = ['data', 'logic', 'integration', 'ui'];
    
    for (const category of categories) {
      const categoryNodes = nodes.filter(n => n.data.category === category);
      
      for (const node of categoryNodes) {
        const componentDef = componentRegistry.get(node.data.type);
        if (!componentDef) continue;
        
        const template = this.handlebars.compile(componentDef.taskTemplate);
        const title = template(node.data.properties || {});
        
        // Find dependencies (nodes connected as inputs)
        const inputEdges = edges.filter(e => e.target === node.id);
        const dependencies = inputEdges
          .map(e => {
            const sourceNode = nodes.find(n => n.id === e.source);
            return sourceNode ? `task-${nodes.indexOf(sourceNode) + 1}` : null;
          })
          .filter(Boolean) as string[];
        
        tasks.push({
          id: `task-${taskId++}`,
          title,
          description: `Implement ${componentDef.name}: ${node.data.properties?.name || ''}`,
          priority: category === 'data' ? 'high' : category === 'logic' ? 'medium' : 'low',
          dependencies,
          estimatedHours: this.estimateHours(node.data.type),
        });
      }
    }
    
    return tasks;
  }
  
  private estimateHours(type: string): number {
    const estimates: Record<string, number> = {
      entity: 2,
      page: 4,
      form: 3,
      list: 2,
      auth: 8,
      api: 2,
      payment: 6,
    };
    return estimates[type] || 2;
  }
  
  private generateMarkdown(
    nodes: Node[],
    edges: Edge[],
    entities: Entity[],
    flows: Flow[]
  ): string {
    const sections: string[] = [];
    
    // Header
    sections.push('# Application Specification\n');
    sections.push('Generated by SmartSpecPro Visual Spec Builder\n');
    
    // Overview
    sections.push('## Overview\n');
    sections.push(`This specification describes an application with:\n`);
    sections.push(`- ${entities.length} data entities`);
    sections.push(`- ${nodes.filter(n => n.data.category === 'ui').length} UI components`);
    sections.push(`- ${flows.length} user flows\n`);
    
    // Data Model
    if (entities.length > 0) {
      sections.push('## Data Model\n');
      for (const entity of entities) {
        sections.push(`### ${entity.name}\n`);
        sections.push('| Field | Type | Constraints |');
        sections.push('|-------|------|-------------|');
        for (const field of entity.fields) {
          sections.push(`| ${field.name} | ${field.type} | ${field.constraints || '-'} |`);
        }
        sections.push('');
        
        if (entity.relations.length > 0) {
          sections.push('**Relations:**');
          for (const rel of entity.relations) {
            sections.push(`- ${rel.type} → ${rel.target}`);
          }
          sections.push('');
        }
      }
    }
    
    // User Flows
    if (flows.length > 0) {
      sections.push('## User Flows\n');
      for (const flow of flows) {
        sections.push(`### ${flow.name}\n`);
        sections.push('```');
        for (let i = 0; i < flow.steps.length; i++) {
          const step = flow.steps[i];
          const arrow = step.next ? ' → ' : '';
          sections.push(`${i + 1}. ${step.action}${arrow}${step.next || ''}`);
        }
        sections.push('```\n');
      }
    }
    
    // Components
    sections.push('## Components\n');
    const categories = [
      { id: 'ui', name: 'UI Components' },
      { id: 'logic', name: 'Logic' },
      { id: 'integration', name: 'Integrations' },
    ];
    
    for (const category of categories) {
      const categoryNodes = nodes.filter(n => n.data.category === category.id);
      if (categoryNodes.length === 0) continue;
      
      sections.push(`### ${category.name}\n`);
      for (const node of categoryNodes) {
        const componentDef = componentRegistry.get(node.data.type);
        if (!componentDef) continue;
        
        const template = this.handlebars.compile(componentDef.specTemplate);
        sections.push(template(node.data.properties || {}));
      }
    }
    
    return sections.join('\n');
  }
}

export const specGenerator = new SpecGenerator();
```

**Deliverables:**
- [ ] Entity extraction
- [ ] Flow extraction
- [ ] Task generation
- [ ] Markdown generation

#### Task 2.2.6: Spec Builder Page
**File:** `desktop-app/src/pages/SpecBuilder/SpecBuilder.tsx`

```typescript
import React, { useState, useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import { ComponentPalette } from './ComponentPalette';
import { VisualCanvas } from './VisualCanvas';
import { PropertyEditor } from './PropertyEditor';
import { SpecPreview } from './SpecPreview';
import { componentRegistry } from '@/services/specBuilder/componentRegistry';
import { specGenerator } from '@/services/specBuilder/specGenerator';
import { Button } from '@/components/ui/button';

type ViewMode = 'design' | 'preview';

export function SpecBuilder() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('design');
  const [generatedSpec, setGeneratedSpec] = useState<any>(null);
  
  const handleNodesChange = useCallback((newNodes: Node[]) => {
    setNodes(newNodes);
  }, []);
  
  const handleEdgesChange = useCallback((newEdges: Edge[]) => {
    setEdges(newEdges);
  }, []);
  
  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNode(node);
  }, []);
  
  const handlePropertyChange = useCallback((nodeId: string, property: string, value: any) => {
    setNodes(nodes => nodes.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          data: {
            ...node.data,
            properties: {
              ...node.data.properties,
              [property]: value,
            },
          },
        };
      }
      return node;
    }));
  }, []);
  
  const handleGenerateSpec = useCallback(() => {
    const spec = specGenerator.generate(nodes, edges);
    setGeneratedSpec(spec);
    setViewMode('preview');
  }, [nodes, edges]);
  
  const handleSaveSpec = useCallback(async () => {
    if (!generatedSpec) return;
    
    // Save to workspace knowledge
    await workspaceService.saveKnowledge({
      type: 'spec',
      title: 'Application Specification',
      content: generatedSpec.markdown,
      metadata: {
        entities: generatedSpec.entities,
        tasks: generatedSpec.tasks,
        flows: generatedSpec.flows,
      },
    });
    
    // Create tasks
    for (const task of generatedSpec.tasks) {
      await workspaceService.createTask(task);
    }
  }, [generatedSpec]);
  
  const selectedComponentDef = selectedNode
    ? componentRegistry.get(selectedNode.data.type)
    : null;
  
  return (
    <div className="spec-builder">
      {/* Header */}
      <div className="builder-header">
        <h2>Visual Spec Builder</h2>
        <div className="header-actions">
          <div className="view-toggle">
            <button
              className={viewMode === 'design' ? 'active' : ''}
              onClick={() => setViewMode('design')}
            >
              🎨 Design
            </button>
            <button
              className={viewMode === 'preview' ? 'active' : ''}
              onClick={() => setViewMode('preview')}
            >
              📄 Preview
            </button>
          </div>
          <Button onClick={handleGenerateSpec}>
            Generate Spec
          </Button>
          {generatedSpec && (
            <Button onClick={handleSaveSpec}>
              Save & Create Tasks
            </Button>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="builder-content">
        {viewMode === 'design' ? (
          <>
            {/* Component Palette */}
            <div className="builder-sidebar left">
              <ComponentPalette />
            </div>
            
            {/* Canvas */}
            <div className="builder-canvas">
              <VisualCanvas
                initialNodes={nodes}
                initialEdges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onNodeSelect={handleNodeSelect}
              />
            </div>
            
            {/* Property Editor */}
            <div className="builder-sidebar right">
              <PropertyEditor
                node={selectedNode}
                componentDef={selectedComponentDef}
                onPropertyChange={handlePropertyChange}
              />
            </div>
          </>
        ) : (
          <SpecPreview
            spec={generatedSpec}
            onEdit={() => setViewMode('design')}
          />
        )}
      </div>
    </div>
  );
}
```

**Deliverables:**
- [ ] Main page layout
- [ ] View mode toggle
- [ ] Generate/save actions

#### Task 2.2.7-2.2.10: Additional Tasks

- **2.2.7:** Flow Diagram Mode
- **2.2.8:** Data Model Designer
- **2.2.9:** Unit Tests
- **2.2.10:** Documentation

---

## 📊 Definition of Done

- [ ] Component palette ทำงานได้
- [ ] Drag-and-drop ทำงานได้
- [ ] Canvas zoom/pan ทำงานได้
- [ ] Undo/redo ทำงานได้
- [ ] Property editor ทำงานได้
- [ ] Spec generation ทำงานได้
- [ ] Task breakdown ทำงานได้
- [ ] Save to knowledge ทำงานได้
- [ ] Unit tests coverage > 80%

---

## 🚀 Next Sprint

**Sprint 2.3: Progress Dashboard**
- Task visualization
- Timeline view
- Burndown charts
- Status reports
