import React, { useState, useRef, useEffect } from 'react';
import { Loader2, Image, Video, Music, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { MediaAttachment } from '../../services/chatService';
import { getAuthToken } from '../../services/authService';
import { 
  IMAGE_MODELS, 
  VIDEO_MODELS, 
  AUDIO_MODELS, 
  DEFAULT_IMAGE_MODEL,
  getModelsForType,
  getDefaultModelForType,
  type MediaType 
} from '../../constants/mediaModels';

interface MediaGenerationPanelProps {
  onClose: () => void;
  onInsert?: (attachment: MediaAttachment) => void;
  chatContext?: string;
}

// Models are now imported from shared constants

export function MediaGenerationPanel({ onClose, onInsert, chatContext }: MediaGenerationPanelProps) {
  const { toast } = useToast();
  const [mediaType, setMediaType] = useState<MediaType>('image');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_IMAGE_MODEL);
  const [prompt, setPrompt] = useState(chatContext || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedMedia, setGeneratedMedia] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Load auth token on mount
  useEffect(() => {
    const loadToken = async () => {
      const token = await getAuthToken();
      setAuthToken(token);
    };
    loadToken();
  }, []);

  const getModels = () => getModelsForType(mediaType);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a prompt',
        variant: 'destructive',
      });
      return;
    }

    // Check if authenticated
    if (!authToken) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to generate media.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const endpoint = `/api/v1/media/${mediaType}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          prompt: prompt,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      setGeneratedMedia(data.data?.[0]?.url || null);

      toast({
        title: 'Success',
        description: `${mediaType} generated successfully!`,
      });
    } catch (error) {
      console.error('Error generating media:', error);
      toast({
        title: 'Error',
        description: `Failed to generate ${mediaType}. Please try again.`,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsertToChat = () => {
    if (generatedMedia && onInsert) {
      onInsert({
        type: mediaType,
        url: generatedMedia,
        title: prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt,
        model: selectedModel,
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Generate Media</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Media Type Tabs */}
          <div className="flex gap-2">
            {(['image', 'video', 'audio'] as const).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setMediaType(type);
                  setSelectedModel(getDefaultModelForType(type));
                  setGeneratedMedia(null);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  mediaType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {type === 'image' && <Image className="w-4 h-4" />}
                {type === 'video' && <Video className="w-4 h-4" />}
                {type === 'audio' && <Music className="w-4 h-4" />}
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
            >
              {getModels().map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>

          {/* Prompt Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`Describe the ${mediaType} you want to generate...`}
              rows={4}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 resize-none"
            />
          </div>

          {/* Generated Media Preview */}
          {generatedMedia && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Generated {mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}
              </label>
              <div className="relative bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                {mediaType === 'image' && (
                  <img src={generatedMedia} alt="Generated" className="w-full h-auto" />
                )}
                {mediaType === 'video' && (
                  <video src={generatedMedia} controls className="w-full h-auto" />
                )}
                {mediaType === 'audio' && (
                  <audio src={generatedMedia} controls className="w-full" />
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate'
              )}
            </button>
            {generatedMedia && (
              <button
                onClick={handleInsertToChat}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                Insert to Chat
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MediaGenerationPanel;
