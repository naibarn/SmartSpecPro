import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Wand2, Sparkles, Loader2, Lightbulb, RefreshCw } from 'lucide-react';
import { useToast } from '../common/Toast';
import { enhanceImagePrompt, enhanceVideoPrompt } from '../../services/promptService';

interface PromptEnhancerProps {
  mediaType: 'image' | 'video';
  currentPrompt: string;
  onPromptEnhanced: (enhancedPrompt: string) => void;
  targetModel?: string;
  style?: string;
}

export const PromptEnhancer: React.FC<PromptEnhancerProps> = ({
  mediaType,
  currentPrompt,
  onPromptEnhanced,
  targetModel,
  style,
}) => {
  const toast = useToast();
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [improvements, setImprovements] = useState<string[]>([]);

  const handleEnhance = async () => {
    if (!currentPrompt.trim()) {
      toast.error('Error', 'Please enter a prompt first');
      return;
    }

    setIsEnhancing(true);
    try {
      const result = mediaType === 'image'
        ? await enhanceImagePrompt(currentPrompt, { targetModel, style })
        : await enhanceVideoPrompt(currentPrompt, { targetModel });

      onPromptEnhanced(result.enhancedPrompt);
      setSuggestions(result.suggestions);
      setImprovements(result.improvements);
      setShowSuggestions(true);

      toast.success(
        'Prompt Enhanced!',
        `Quality score: ${result.estimatedQuality}/10`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to enhance prompt';
      toast.error('Enhancement Failed', errorMessage);
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Auto-enhance button */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 border-purple-700 text-purple-400 hover:bg-purple-900/20 hover:text-purple-300"
          onClick={handleEnhance}
          disabled={isEnhancing || !currentPrompt.trim()}
        >
          {isEnhancing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Enhancing...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" />
              Auto-Enhance Prompt
            </>
          )}
        </Button>
      </div>

      {/* Suggestions panel */}
      {showSuggestions && (improvements.length > 0 || suggestions.length > 0) && (
        <div className="p-3 bg-purple-900/10 border border-purple-800 rounded-md space-y-3">
          {/* Improvements made */}
          {improvements.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-purple-300">
                <Sparkles className="w-4 h-4" />
                <span>Improvements Applied:</span>
              </div>
              <ul className="text-xs text-purple-200 space-y-1 pl-4">
                {improvements.map((improvement, idx) => (
                  <li key={idx} className="list-disc">
                    {improvement}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Additional suggestions */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-purple-300">
                <Lightbulb className="w-4 h-4" />
                <span>Try These Variations:</span>
              </div>
              <ul className="text-xs text-purple-200 space-y-1 pl-4">
                {suggestions.map((suggestion, idx) => (
                  <li key={idx} className="list-disc">
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Close button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowSuggestions(false)}
            className="w-full text-xs text-purple-400 hover:text-purple-300"
          >
            Hide Suggestions
          </Button>
        </div>
      )}

      {/* Helper text */}
      <p className="text-xs text-slate-500">
        AI will enhance your prompt with professional details, composition, lighting, and style guidance
      </p>
    </div>
  );
};

export default PromptEnhancer;
