// AI Suggestions Panel Component
// Display and manage AI-powered suggestions

import { useEffect } from 'react';
import {
  useAi,
  Suggestion,
  getSuggestionTypeIcon,
  getImpactColor,
} from '../../services/aiService';

interface AiSuggestionsPanelProps {
  projectId: string;
  className?: string;
}

export function AiSuggestionsPanel({ projectId, className = '' }: AiSuggestionsPanelProps) {
  const { suggestions, isAnalyzing, error, loadSuggestions, dismiss, apply } = useAi();

  useEffect(() => {
    loadSuggestions(projectId);
  }, [projectId, loadSuggestions]);

  const groupedSuggestions = suggestions.reduce((acc, suggestion) => {
    const key = suggestion.impact;
    if (!acc[key]) acc[key] = [];
    acc[key].push(suggestion);
    return acc;
  }, {} as Record<string, Suggestion[]>);

  const impactOrder = ['critical', 'high', 'medium', 'low', 'info'];

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            AI Suggestions
          </h3>
          <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
            {suggestions.length}
          </span>
        </div>
        {isAnalyzing && (
          <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
            <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
            Analyzing...
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="m-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Suggestions List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {suggestions.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <div className="text-4xl mb-2">✨</div>
            <p>No suggestions yet</p>
            <p className="text-sm mt-1">AI will analyze your code and provide suggestions</p>
          </div>
        ) : (
          impactOrder.map((impact) => {
            const items = groupedSuggestions[impact];
            if (!items || items.length === 0) return null;

            return (
              <div key={impact}>
                <h4 className={`text-xs font-semibold uppercase mb-2 ${getImpactColor(impact as any).split(' ')[0]}`}>
                  {impact} ({items.length})
                </h4>
                <div className="space-y-2">
                  {items.map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onDismiss={() => dismiss(projectId, suggestion.id)}
                      onApply={() => apply(projectId, suggestion.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============================================
// Suggestion Card
// ============================================

interface SuggestionCardProps {
  suggestion: Suggestion;
  onDismiss: () => void;
  onApply: () => void;
}

function SuggestionCard({ suggestion, onDismiss, onApply }: SuggestionCardProps) {
  return (
    <div className={`p-3 rounded-lg border ${
      suggestion.applied
        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
    }`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="text-xl">
          {getSuggestionTypeIcon(suggestion.suggestion_type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-gray-900 dark:text-white text-sm">
              {suggestion.title}
            </h4>
            <span className={`px-1.5 py-0.5 text-xs rounded ${getImpactColor(suggestion.impact)}`}>
              {suggestion.impact}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {suggestion.description}
          </p>

          {suggestion.file_path && (
            <p className="text-xs text-gray-500 mt-1">
              📄 {suggestion.file_path}
              {suggestion.line_range && ` (lines ${suggestion.line_range[0]}-${suggestion.line_range[1]})`}
            </p>
          )}

          {suggestion.code_snippet && (
            <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto">
              <code>{suggestion.code_snippet}</code>
            </pre>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-2">
            {suggestion.actions.map((action, index) => (
              <button
                key={index}
                onClick={() => {
                  if (action.action_type === 'dismiss') onDismiss();
                  else if (action.action_type === 'apply_fix') onApply();
                }}
                className={`px-2 py-1 text-xs rounded ${
                  action.action_type === 'apply_fix'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>

          {/* Confidence */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500"
                style={{ width: `${suggestion.confidence * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">
              {Math.round(suggestion.confidence * 100)}% confidence
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AiSuggestionsPanel;
