/**
 * Skill Template Selector Component
 * 
 * A gallery-style component for browsing and selecting skill templates.
 * Features:
 * - Template cards with preview
 * - Category filtering
 * - Search functionality
 * - Quick inject action
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SkillTemplate } from '../types/skill';

interface SkillTemplateSelectorProps {
  templates: SkillTemplate[];
  onSelect: (template: SkillTemplate) => void;
  onInject: (templateName: string) => Promise<void>;
  isLoading?: boolean;
  selectedTemplates?: string[];
}

// Template category icons
const CATEGORY_ICONS: Record<string, string> = {
  conventions: '📋',
  api: '🔌',
  database: '🗄️',
  security: '🔒',
  testing: '🧪',
  error: '⚠️',
  performance: '⚡',
  documentation: '📝',
  default: '📦',
};

// Get icon for template based on tags
function getTemplateIcon(template: SkillTemplate): string {
  for (const tag of template.tags) {
    if (CATEGORY_ICONS[tag]) {
      return CATEGORY_ICONS[tag];
    }
  }
  return CATEGORY_ICONS.default;
}

// Get category color
function getCategoryColor(template: SkillTemplate): string {
  const tag = template.tags[0] || 'default';
  const colors: Record<string, string> = {
    conventions: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    api: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    database: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    security: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    testing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    error: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    performance: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
    documentation: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
    default: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  };
  return colors[tag] || colors.default;
}

export function SkillTemplateSelector({
  templates,
  onSelect,
  onInject,
  isLoading,
  selectedTemplates = [],
}: SkillTemplateSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [injectingTemplate, setInjectingTemplate] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<SkillTemplate | null>(null);

  // Get unique categories from templates
  const categories = useMemo(() => {
    const cats = new Set<string>();
    templates.forEach((t) => t.tags.forEach((tag) => cats.add(tag)));
    return Array.from(cats).sort();
  }, [templates]);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = template.name.toLowerCase().includes(query);
        const matchesDesc = template.description.toLowerCase().includes(query);
        const matchesTags = template.tags.some((t) => t.toLowerCase().includes(query));
        if (!matchesName && !matchesDesc && !matchesTags) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory && !template.tags.includes(selectedCategory)) {
        return false;
      }

      return true;
    });
  }, [templates, searchQuery, selectedCategory]);

  // Handle inject
  const handleInject = async (templateName: string) => {
    setInjectingTemplate(templateName);
    try {
      await onInject(templateName);
    } finally {
      setInjectingTemplate(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Skill Templates
        </h2>

        {/* Search */}
        <div className="relative mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              selectedCategory === null
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedCategory === category
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {CATEGORY_ICONS[category] || '📦'} {category}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <svg className="animate-spin h-8 w-8 text-indigo-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-lg font-medium">No templates found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => {
              const isSelected = selectedTemplates.includes(template.name);
              const isInjecting = injectingTemplate === template.name;

              return (
                <motion.div
                  key={template.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`relative p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-800'
                  }`}
                  onClick={() => onSelect(template)}
                >
                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <svg className="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}

                  {/* Icon & Name */}
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{getTemplateIcon(template)}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {template.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </h3>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${getCategoryColor(template)}`}>
                        {template.mode}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                    {template.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {template.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                    {template.tags.length > 3 && (
                      <span className="px-2 py-0.5 text-gray-500 text-xs">
                        +{template.tags.length - 3}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewTemplate(template);
                      }}
                      className="flex-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Preview
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInject(template.name);
                      }}
                      disabled={isInjecting || isSelected}
                      className="flex-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {isInjecting ? (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : isSelected ? (
                        'Added'
                      ) : (
                        'Add'
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewTemplate && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewTemplate(null)}
              className="fixed inset-0 bg-black/50 z-40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-4 md:inset-10 bg-white dark:bg-gray-900 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getTemplateIcon(previewTemplate)}</span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {previewTemplate.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {previewTemplate.description}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-auto p-6">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-mono bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  {previewTemplate.preview}
                </pre>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    handleInject(previewTemplate.name);
                    setPreviewTemplate(null);
                  }}
                  disabled={selectedTemplates.includes(previewTemplate.name)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {selectedTemplates.includes(previewTemplate.name) ? 'Already Added' : 'Add to Project'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SkillTemplateSelector;
