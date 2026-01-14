// Component Library Panel
// Sidebar with draggable component templates

import { useState } from 'react';
import { useSpecBuilder, ComponentCategory, ComponentTemplate } from '../../services/specBuilderService';

interface ComponentLibraryProps {
  className?: string;
}

export function ComponentLibrary({ className = '' }: ComponentLibraryProps) {
  const { library } = useSpecBuilder();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  if (!library) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  const filteredCategories = library.categories.map(category => ({
    ...category,
    components: category.components.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(c => c.components.length > 0);

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
          Components
        </h3>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search components..."
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
        />
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto">
        {filteredCategories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            isExpanded={expandedCategory === category.id || searchQuery.length > 0}
            onToggle={() => setExpandedCategory(
              expandedCategory === category.id ? null : category.id
            )}
          />
        ))}
      </div>

      {/* Help */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
        Drag components to the canvas to add them
      </div>
    </div>
  );
}

// ============================================
// Category Section
// ============================================

function CategorySection({
  category,
  isExpanded,
  onToggle,
}: {
  category: ComponentCategory;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <div className="flex items-center gap-2">
          <span>{category.icon}</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {category.name}
          </span>
          <span className="text-xs text-gray-500">
            ({category.components.length})
          </span>
        </div>
        <span className="text-gray-400">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>

      {isExpanded && (
        <div className="px-2 pb-2 grid grid-cols-2 gap-2">
          {category.components.map((template) => (
            <DraggableTemplate key={template.id} template={template} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Draggable Template
// ============================================

function DraggableTemplate({ template }: { template: ComponentTemplate }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('template-id', template.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-grab hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
      title={template.description}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{template.icon}</span>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
          {template.name}
        </span>
      </div>
    </div>
  );
}

export default ComponentLibrary;
