// Model Selector Component
// Dropdown for selecting LLM models with details

import { useState } from 'react';
import { LlmModel, formatTokenCount, formatCost } from '../../services/chatService';

interface ModelSelectorProps {
  models: LlmModel[];
  selectedModel: LlmModel | null;
  onSelect: (model: LlmModel) => void;
  className?: string;
}

export function ModelSelector({ 
  models, 
  selectedModel, 
  onSelect, 
  className = '' 
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const filteredModels = models.filter(model => 
    model.name.toLowerCase().includes(filter.toLowerCase()) ||
    model.id.toLowerCase().includes(filter.toLowerCase())
  );

  // Group models by provider
  const groupedModels = filteredModels.reduce((acc, model) => {
    const provider = model.id.split('/')[0];
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(model);
    return acc;
  }, {} as Record<string, LlmModel[]>);

  const providerNames: Record<string, string> = {
    anthropic: 'Anthropic (Claude)',
    openai: 'OpenAI (GPT)',
    deepseek: 'Deepseek',
    google: 'Google (Gemini)',
  };

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors w-full"
      >
        <div className="flex-1 text-left">
          {selectedModel ? (
            <>
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {selectedModel.name}
              </div>
              <div className="text-xs text-gray-500">
                {formatTokenCount(selectedModel.context_length)} context · ${selectedModel.input_cost_per_1k}/1K in
              </div>
            </>
          ) : (
            <span className="text-sm text-gray-500">Select a model</span>
          )}
        </div>
        <svg 
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-96 overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b border-gray-200 dark:border-gray-700">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search models..."
                className="w-full px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 border-0 rounded-md focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            {/* Model List */}
            <div className="overflow-y-auto max-h-80">
              {Object.entries(groupedModels).map(([provider, providerModels]) => (
                <div key={provider}>
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0">
                    {providerNames[provider] || provider}
                  </div>
                  {providerModels.map((model) => (
                    <ModelOption
                      key={model.id}
                      model={model}
                      isSelected={selectedModel?.id === model.id}
                      onSelect={() => { onSelect(model); setIsOpen(false); }}
                    />
                  ))}
                </div>
              ))}
              {filteredModels.length === 0 && (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                  No models found
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Model Option Component
function ModelOption({ 
  model, 
  isSelected, 
  onSelect 
}: { 
  model: LlmModel; 
  isSelected: boolean; 
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full px-3 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
        isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className={`text-sm font-medium ${
            isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'
          }`}>
            {model.name}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span>{formatTokenCount(model.context_length)} ctx</span>
            <span>${model.input_cost_per_1k}/1K in</span>
            <span>${model.output_cost_per_1k}/1K out</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {model.supports_vision && (
              <span className="px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                Vision
              </span>
            )}
            {model.supports_tools && (
              <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                Tools
              </span>
            )}
            {model.supports_streaming && (
              <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                Stream
              </span>
            )}
          </div>
        </div>
        {isSelected && (
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </div>
    </button>
  );
}

export default ModelSelector;
