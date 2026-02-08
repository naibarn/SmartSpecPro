/**
 * TemplateBrowser - Workflow template marketplace browser.
 *
 * Allows users to browse, search, and load pre-built workflow templates.
 */

import React, { useState } from "react";
import { Search, Star, Download, Eye } from "lucide-react";

export interface WorkflowTemplate {
  id: number;
  name: string;
  description: string;
  author: string;
  category: string;
  tags: string[];
  rating: number;
  downloadCount: number;
  thumbnailUrl?: string;
  workflowJson: {
    nodes: any[];
    edges: any[];
  };
  status: "draft" | "pending_review" | "published" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface TemplateBrowserProps {
  templates: WorkflowTemplate[];
  onLoadTemplate: (template: WorkflowTemplate) => void;
  onClose?: () => void;
  className?: string;
}

/**
 * TemplateBrowser component.
 */
export function TemplateBrowser({
  templates,
  onLoadTemplate,
  onClose,
  className = "",
}: TemplateBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);

  // Extract unique categories
  const categories = Array.from(new Set(templates.map((t) => t.category)));

  // Filter templates
  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      searchQuery === "" ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = !selectedCategory || template.category === selectedCategory;

    return matchesSearch && matchesCategory && template.status === "published";
  });

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-xl font-bold">Workflow Templates</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="p-4 space-y-3 border-b bg-gray-50">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`
              px-3 py-1 rounded-full text-sm whitespace-nowrap
              ${
                selectedCategory === null
                  ? "bg-blue-500 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }
            `}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`
                px-3 py-1 rounded-full text-sm whitespace-nowrap
                ${
                  selectedCategory === category
                    ? "bg-blue-500 text-white"
                    : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                }
              `}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-medium">No templates found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isSelected={selectedTemplate?.id === template.id}
                onClick={() => setSelectedTemplate(template)}
                onLoad={() => onLoadTemplate(template)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Template Preview */}
      {selectedTemplate && (
        <div className="border-t p-4 bg-gray-50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-bold text-lg">{selectedTemplate.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{selectedTemplate.description}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span>By {selectedTemplate.author}</span>
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  {selectedTemplate.rating.toFixed(1)}
                </span>
                <span className="flex items-center gap-1">
                  <Download className="w-3 h-3" />
                  {selectedTemplate.downloadCount}
                </span>
              </div>
            </div>
            <button
              onClick={() => onLoadTemplate(selectedTemplate)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Use Template
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * TemplateCard - Individual template card in grid.
 */
interface TemplateCardProps {
  template: WorkflowTemplate;
  isSelected: boolean;
  onClick: () => void;
  onLoad: () => void;
}

function TemplateCard({ template, isSelected, onClick, onLoad }: TemplateCardProps) {
  return (
    <div
      className={`
        border rounded-lg overflow-hidden cursor-pointer transition-all
        ${
          isSelected
            ? "ring-2 ring-blue-500 shadow-lg"
            : "hover:shadow-md hover:border-gray-400"
        }
      `}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="h-32 bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
        {template.thumbnailUrl ? (
          <img
            src={template.thumbnailUrl}
            alt={template.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-gray-400 text-sm">
            {template.workflowJson.nodes.length} nodes
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <h3 className="font-semibold text-sm line-clamp-1">{template.name}</h3>
        <p className="text-xs text-gray-600 line-clamp-2">{template.description}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {template.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t">
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            {template.rating.toFixed(1)}
          </span>
          <span className="flex items-center gap-1">
            <Download className="w-3 h-3" />
            {template.downloadCount}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLoad();
            }}
            className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            <Eye className="w-3 h-3" />
            Use
          </button>
        </div>
      </div>
    </div>
  );
}
