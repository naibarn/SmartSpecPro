// Properties Panel
// Edit properties of selected components

import { useState, useEffect } from 'react';
import {
  useSpecBuilder,
  CanvasComponent,
  ComponentProperties,
  ComponentStyle,
  Priority,
  ItemStatus,
  getComponentTypeIcon,
} from '../../services/specBuilderService';

interface PropertiesPanelProps {
  className?: string;
}

export function PropertiesPanel({ className = '' }: PropertiesPanelProps) {
  const {
    currentDocument,
    selectedComponentIds,
    updateComponentOnCanvas,
    deleteSelectedComponents,
    duplicateSelectedComponents,
  } = useSpecBuilder();

  const selectedComponent = currentDocument?.canvas.components.find(
    c => c.id === selectedComponentIds[0]
  );

  if (!currentDocument) {
    return (
      <div className={`p-4 text-center text-gray-500 ${className}`}>
        No document open
      </div>
    );
  }

  if (selectedComponentIds.length === 0) {
    return (
      <div className={`p-4 ${className}`}>
        <DocumentProperties />
      </div>
    );
  }

  if (selectedComponentIds.length > 1) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-center text-gray-500 mb-4">
          {selectedComponentIds.length} components selected
        </div>
        <div className="space-y-2">
          <button
            onClick={deleteSelectedComponents}
            className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
          >
            Delete All
          </button>
          <button
            onClick={duplicateSelectedComponents}
            className="w-full px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
          >
            Duplicate All
          </button>
        </div>
      </div>
    );
  }

  if (!selectedComponent) return null;

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 overflow-y-auto ${className}`}>
      <ComponentPropertiesEditor
        component={selectedComponent}
        onUpdate={(updates) => updateComponentOnCanvas(selectedComponent.id, updates)}
        onDelete={deleteSelectedComponents}
        onDuplicate={duplicateSelectedComponents}
      />
    </div>
  );
}

// ============================================
// Document Properties
// ============================================

function DocumentProperties() {
  const { currentDocument, saveCurrentDocument } = useSpecBuilder();

  if (!currentDocument) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900 dark:text-white">
        Document Properties
      </h3>

      <div>
        <label className="block text-sm text-gray-500 mb-1">Name</label>
        <div className="text-gray-900 dark:text-white">{currentDocument.name}</div>
      </div>

      <div>
        <label className="block text-sm text-gray-500 mb-1">Status</label>
        <div className="text-gray-900 dark:text-white capitalize">
          {currentDocument.metadata.status}
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-500 mb-1">Components</label>
        <div className="text-gray-900 dark:text-white">
          {currentDocument.canvas.components.length}
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-500 mb-1">Connections</label>
        <div className="text-gray-900 dark:text-white">
          {currentDocument.canvas.connections.length}
        </div>
      </div>

      <button
        onClick={saveCurrentDocument}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Save Document
      </button>
    </div>
  );
}

// ============================================
// Component Properties Editor
// ============================================

interface ComponentPropertiesEditorProps {
  component: CanvasComponent;
  onUpdate: (updates: Partial<{ properties: ComponentProperties; style: ComponentStyle; locked: boolean; visible: boolean }>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

function ComponentPropertiesEditor({
  component,
  onUpdate,
  onDelete,
  onDuplicate,
}: ComponentPropertiesEditorProps) {
  const [properties, setProperties] = useState(component.properties);
  const [style, setStyle] = useState(component.style);

  useEffect(() => {
    setProperties(component.properties);
    setStyle(component.style);
  }, [component]);

  const handlePropertyChange = (key: keyof ComponentProperties, value: unknown) => {
    const newProperties = { ...properties, [key]: value };
    setProperties(newProperties);
    onUpdate({ properties: newProperties });
  };

  const handleStyleChange = (key: keyof ComponentStyle, value: unknown) => {
    const newStyle = { ...style, [key]: value };
    setStyle(newStyle);
    onUpdate({ style: newStyle });
  };

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">{getComponentTypeIcon(component.component_type)}</span>
        <div>
          <div className="font-semibold text-gray-900 dark:text-white capitalize">
            {component.component_type.replace('_', ' ')}
          </div>
          <div className="text-xs text-gray-500">ID: {component.id.slice(0, 8)}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onDuplicate}
          className="flex-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          Duplicate
        </button>
        <button
          onClick={onDelete}
          className="flex-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Delete
        </button>
      </div>

      {/* Visibility & Lock */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={component.visible}
            onChange={(e) => onUpdate({ visible: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Visible</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={component.locked}
            onChange={(e) => onUpdate({ locked: e.target.checked })}
            className="rounded"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Locked</span>
        </label>
      </div>

      {/* Properties Section */}
      <div>
        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Properties
        </h4>

        {/* Title */}
        <div className="mb-3">
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
            Title
          </label>
          <input
            type="text"
            value={properties.title || ''}
            onChange={(e) => handlePropertyChange('title', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        {/* Content */}
        <div className="mb-3">
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
            Content
          </label>
          <textarea
            value={properties.content || ''}
            onChange={(e) => handlePropertyChange('content', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        {/* Priority */}
        <div className="mb-3">
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
            Priority
          </label>
          <select
            value={properties.priority || ''}
            onChange={(e) => handlePropertyChange('priority', e.target.value as Priority || undefined)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          >
            <option value="">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {/* Status */}
        <div className="mb-3">
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
            Status
          </label>
          <select
            value={properties.status || ''}
            onChange={(e) => handlePropertyChange('status', e.target.value as ItemStatus || undefined)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          >
            <option value="">None</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </div>

      {/* Style Section */}
      <div>
        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Style
        </h4>

        {/* Background Color */}
        <div className="mb-3">
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
            Background Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={style.background_color || '#ffffff'}
              onChange={(e) => handleStyleChange('background_color', e.target.value)}
              className="w-10 h-10 rounded cursor-pointer"
            />
            <input
              type="text"
              value={style.background_color || ''}
              onChange={(e) => handleStyleChange('background_color', e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
            />
          </div>
        </div>

        {/* Border Color */}
        <div className="mb-3">
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
            Border Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={style.border_color || '#e5e7eb'}
              onChange={(e) => handleStyleChange('border_color', e.target.value)}
              className="w-10 h-10 rounded cursor-pointer"
            />
            <input
              type="text"
              value={style.border_color || ''}
              onChange={(e) => handleStyleChange('border_color', e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
            />
          </div>
        </div>

        {/* Border Radius */}
        <div className="mb-3">
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
            Border Radius: {style.border_radius || 8}px
          </label>
          <input
            type="range"
            min="0"
            max="32"
            value={style.border_radius || 8}
            onChange={(e) => handleStyleChange('border_radius', Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Font Size */}
        <div className="mb-3">
          <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
            Font Size: {style.font_size || 14}px
          </label>
          <input
            type="range"
            min="10"
            max="32"
            value={style.font_size || 14}
            onChange={(e) => handleStyleChange('font_size', Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Shadow */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={style.shadow || false}
            onChange={(e) => handleStyleChange('shadow', e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Shadow</span>
        </label>
      </div>

      {/* Position Section */}
      <div>
        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Position
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">X</label>
            <div className="text-sm text-gray-900 dark:text-white">{Math.round(component.x)}</div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Y</label>
            <div className="text-sm text-gray-900 dark:text-white">{Math.round(component.y)}</div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Width</label>
            <div className="text-sm text-gray-900 dark:text-white">{Math.round(component.width)}</div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Height</label>
            <div className="text-sm text-gray-900 dark:text-white">{Math.round(component.height)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PropertiesPanel;
