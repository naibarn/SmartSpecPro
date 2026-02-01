/**
 * SmartSpec Pro - Generation Panel Component
 * Main panel for AI image, video, and audio generation.
 */

import React, { useState, useCallback } from 'react';
import { 
  Image, 
  Video, 
  Music, 
  Sparkles, 
  Loader2, 
  Download,
  Copy,
  ExternalLink,
  Settings,
  Wand2
} from 'lucide-react';

// Types
type MediaType = 'image' | 'video' | 'audio';
type TaskStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed';

interface GenerationResult {
  id: string;
  status: TaskStatus;
  taskType: string;
  modelId: string;
  prompt: string;
  outputUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
  creditsUsed: number;
  progress: number;
}

interface ModelInfo {
  id: string;
  name: string;
  mediaType: string;
  description: string;
  status: string;
  isFeatured: boolean;
  baseCredits: number;
  aspectRatios?: string[];
  resolutions?: string[];
  durations?: number[];
}

// Model configurations
const IMAGE_MODELS: ModelInfo[] = [
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    mediaType: 'image',
    description: 'Google Gemini 3.0 - Sharp 2K/4K imagery with improved text rendering',
    status: 'active',
    isFeatured: true,
    baseCredits: 18,
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'],
    resolutions: ['1K', '2K', '4K'],
  },
  {
    id: 'flux-2',
    name: 'FLUX 2',
    mediaType: 'image',
    description: 'Black Forest Labs - Photorealistic image generation',
    status: 'beta',
    isFeatured: true,
    baseCredits: 30,
    aspectRatios: ['1:1', '16:9', '9:16', '4:3'],
    resolutions: ['1K', '2K', '4K'],
  },
];

const VIDEO_MODELS: ModelInfo[] = [
  {
    id: 'wan/2-6-text-to-video',
    name: 'Wan 2.6',
    mediaType: 'video',
    description: 'Alibaba - Multi-shot HD video with native audio',
    status: 'active',
    isFeatured: true,
    baseCredits: 70,
    resolutions: ['720p', '1080p'],
    durations: [5, 10, 15],
  },
  {
    id: 'veo-3-1',
    name: 'Veo 3.1',
    mediaType: 'video',
    description: 'Google - High quality cinematic video',
    status: 'beta',
    isFeatured: true,
    baseCredits: 150,
    resolutions: ['720p', '1080p', '4K'],
    durations: [5, 10, 15],
  },
];

const AUDIO_MODELS: ModelInfo[] = [
  {
    id: 'elevenlabs/text-to-speech-turbo-2-5',
    name: 'ElevenLabs TTS',
    mediaType: 'audio',
    description: 'Human-like voices with emotion control',
    status: 'active',
    isFeatured: true,
    baseCredits: 12,
  },
];

// Tab Button Component
const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
      active
        ? 'bg-blue-600 text-white'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
    }`}
  >
    {icon}
    <span className="font-medium">{label}</span>
  </button>
);

// Model Selector Component
const ModelSelector: React.FC<{
  models: ModelInfo[];
  selectedModel: string;
  onSelect: (modelId: string) => void;
}> = ({ models, selectedModel, onSelect }) => (
  <div className="space-y-2">
    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Model</label>
    <div className="grid grid-cols-1 gap-2">
      {models.map((model) => (
        <button
          key={model.id}
          onClick={() => onSelect(model.id)}
          className={`p-3 rounded-lg border text-left transition-all ${
            selectedModel === model.id
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900 dark:text-white">{model.name}</span>
            <div className="flex items-center gap-2">
              {model.isFeatured && (
                <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                  Featured
                </span>
              )}
              {model.status === 'beta' && (
                <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded-full">
                  Beta
                </span>
              )}
              <span className="text-sm text-gray-500">{model.baseCredits} credits</span>
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{model.description}</p>
        </button>
      ))}
    </div>
  </div>
);

// Generation Result Display
const ResultDisplay: React.FC<{
  result: GenerationResult | null;
  mediaType: MediaType;
}> = ({ result, mediaType }) => {
  if (!result) return null;

  const handleDownload = async () => {
    if (result.outputUrl) {
      window.open(result.outputUrl, '_blank');
    }
  };

  const handleCopyUrl = () => {
    if (result.outputUrl) {
      navigator.clipboard.writeText(result.outputUrl);
    }
  };

  return (
    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      {/* Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {result.status === 'processing' && (
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          )}
          {result.status === 'completed' && (
            <Sparkles className="w-5 h-5 text-green-500" />
          )}
          <span className="font-medium capitalize">{result.status}</span>
        </div>
        {result.status === 'processing' && (
          <span className="text-sm text-gray-500">{Math.round(result.progress * 100)}%</span>
        )}
      </div>

      {/* Progress Bar */}
      {result.status === 'processing' && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${result.progress * 100}%` }}
          />
        </div>
      )}

      {/* Output */}
      {result.status === 'completed' && result.outputUrl && (
        <div className="space-y-4">
          {/* Media Preview */}
          <div className="relative rounded-lg overflow-hidden bg-black">
            {mediaType === 'image' && (
              <img
                src={result.outputUrl}
                alt="Generated"
                className="w-full h-auto max-h-96 object-contain"
              />
            )}
            {mediaType === 'video' && (
              <video
                src={result.outputUrl}
                controls
                className="w-full h-auto max-h-96"
              />
            )}
            {mediaType === 'audio' && (
              <audio src={result.outputUrl} controls className="w-full" />
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={handleCopyUrl}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              <Copy className="w-4 h-4" />
              Copy URL
            </button>
            <a
              href={result.outputUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open
            </a>
          </div>

          {/* Credits Used */}
          <p className="text-sm text-gray-500">
            Credits used: {result.creditsUsed}
          </p>
        </div>
      )}

      {/* Error */}
      {result.status === 'failed' && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400">{result.errorMessage || 'Generation failed'}</p>
        </div>
      )}
    </div>
  );
};

// Main Generation Panel Component
export const GenerationPanel: React.FC = () => {
  // State
  const [mediaType, setMediaType] = useState<MediaType>('image');
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('nano-banana-pro');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [resolution, setResolution] = useState('2K');
  const [duration, setDuration] = useState(5);
  const [voice, setVoice] = useState('Rachel');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get current models based on media type
  const getCurrentModels = () => {
    switch (mediaType) {
      case 'image':
        return IMAGE_MODELS;
      case 'video':
        return VIDEO_MODELS;
      case 'audio':
        return AUDIO_MODELS;
    }
  };

  // Get current model info
  const getCurrentModel = () => {
    const models = getCurrentModels();
    return models.find((m) => m.id === selectedModel) || models[0];
  };

  // Handle media type change
  const handleMediaTypeChange = (type: MediaType) => {
    setMediaType(type);
    setResult(null);
    // Reset to first model of new type
    const models = type === 'image' ? IMAGE_MODELS : type === 'video' ? VIDEO_MODELS : AUDIO_MODELS;
    setSelectedModel(models[0].id);
  };

  // Handle generation
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setResult({
      id: 'temp-' + Date.now(),
      status: 'processing',
      taskType: mediaType,
      modelId: selectedModel,
      prompt,
      creditsUsed: 0,
      progress: 0,
    });

    // Simulate progress (in real app, this would poll the API)
    const progressInterval = setInterval(() => {
      setResult((prev) => {
        if (!prev || prev.progress >= 0.95) return prev;
        return { ...prev, progress: prev.progress + 0.1 };
      });
    }, 500);

    try {
      // TODO: Replace with actual API call
      // const response = await fetch('/api/v1/generation/' + mediaType, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ prompt, model_id: selectedModel, ... })
      // });

      // Simulate API response
      await new Promise((resolve) => setTimeout(resolve, 3000));

      clearInterval(progressInterval);

      setResult({
        id: 'result-' + Date.now(),
        status: 'completed',
        taskType: mediaType,
        modelId: selectedModel,
        prompt,
        outputUrl: mediaType === 'image' 
          ? 'https://picsum.photos/1024/1024'
          : mediaType === 'video'
          ? 'https://www.w3schools.com/html/mov_bbb.mp4'
          : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        creditsUsed: getCurrentModel().baseCredits,
        progress: 1,
      });
    } catch (error) {
      clearInterval(progressInterval);
      setResult((prev) => ({
        ...prev!,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Generation failed',
      }));
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, mediaType, selectedModel]);

  const currentModel = getCurrentModel();

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Wand2 className="w-6 h-6 text-blue-500" />
          AI Generation Studio
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Create images, videos, and audio with AI
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Media Type Tabs */}
        <div className="flex gap-2">
          <TabButton
            active={mediaType === 'image'}
            onClick={() => handleMediaTypeChange('image')}
            icon={<Image className="w-4 h-4" />}
            label="Image"
          />
          <TabButton
            active={mediaType === 'video'}
            onClick={() => handleMediaTypeChange('video')}
            icon={<Video className="w-4 h-4" />}
            label="Video"
          />
          <TabButton
            active={mediaType === 'audio'}
            onClick={() => handleMediaTypeChange('audio')}
            icon={<Music className="w-4 h-4" />}
            label="Audio"
          />
        </div>

        {/* Model Selector */}
        <ModelSelector
          models={getCurrentModels()}
          selectedModel={selectedModel}
          onSelect={setSelectedModel}
        />

        {/* Prompt Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {mediaType === 'audio' ? 'Text' : 'Prompt'}
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mediaType === 'image'
                ? 'Describe the image you want to create...'
                : mediaType === 'video'
                ? 'Describe the video scene...'
                : 'Enter the text to convert to speech...'
            }
            className="w-full h-32 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Options */}
        <div className="space-y-4">
          {/* Image Options */}
          {mediaType === 'image' && currentModel.aspectRatios && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Aspect Ratio
                </label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  {currentModel.aspectRatios.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Resolution
                </label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  {currentModel.resolutions?.map((res) => (
                    <option key={res} value={res}>
                      {res}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Video Options */}
          {mediaType === 'video' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Duration
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  {currentModel.durations?.map((dur) => (
                    <option key={dur} value={dur}>
                      {dur} seconds
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Resolution
                </label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  {currentModel.resolutions?.map((res) => (
                    <option key={res} value={res}>
                      {res}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Audio Options */}
          {mediaType === 'audio' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Voice
              </label>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="Rachel">Rachel (Female)</option>
                <option value="Aria">Aria (Female)</option>
                <option value="Roger">Roger (Male)</option>
                <option value="Sarah">Sarah (Female)</option>
              </select>
            </div>
          )}
        </div>

        {/* Advanced Settings Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <Settings className="w-4 h-4" />
          {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
        </button>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isGenerating}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate {mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}
            </>
          )}
        </button>

        {/* Estimated Cost */}
        <p className="text-center text-sm text-gray-500">
          Estimated cost: {currentModel.baseCredits} credits
        </p>

        {/* Result Display */}
        <ResultDisplay result={result} mediaType={mediaType} />
      </div>
    </div>
  );
};

export default GenerationPanel;
