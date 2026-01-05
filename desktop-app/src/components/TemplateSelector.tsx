import { useState } from "react";
import {
  workflowTemplates,
  getCategories,
  type WorkflowTemplate,
} from "../data/templates";

interface TemplateSelectorProps {
  onSelect: (template: WorkflowTemplate) => void;
  onCancel: () => void;
}

export function TemplateSelector({ onSelect, onCancel }: TemplateSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const categories = ["all", ...getCategories()];

  const filteredTemplates = workflowTemplates.filter((template) => {
    const matchesCategory =
      selectedCategory === "all" || template.category === selectedCategory;
    const matchesSearch =
      searchTerm === "" ||
      template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Choose a Workflow Template
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Start with a pre-configured template and customize as needed
          </p>
        </div>

        {/* Search & Filter */}
        <div className="border-b border-gray-200 px-6 py-4 space-y-3">
          {/* Search */}
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search templates..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Categories */}
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  selectedCategory === category
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {category === "all" ? "All" : category}
              </button>
            ))}
          </div>
        </div>

        {/* Templates Grid */}
        <div className="flex-1 overflow-auto p-6">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No templates found</p>
              <p className="text-sm mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => onSelect(template)}
                  className="text-left p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start space-x-3">
                    <div className="text-3xl">{template.icon}</div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {template.name}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {template.description}
                      </p>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {template.category}
                        </span>
                        <span className="text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          Use template →
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Config Preview */}
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                      View configuration
                    </summary>
                    <div className="mt-2 bg-gray-50 rounded p-2 font-mono text-xs overflow-auto max-h-32">
                      {JSON.stringify(template.config, null, 2)}
                    </div>
                  </details>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-between items-center">
          <p className="text-sm text-gray-600">
            {filteredTemplates.length} template(s) available
          </p>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
