import { useState, useRef, useEffect } from 'react';
import { Loader2, Image, Video, Music, X } from 'lucide-react';
import { useToast } from '../common/Toast';
import { MediaAttachment } from '../../services/chatService';
import { getAuthToken } from '../../services/authService';
import { 
  getModelsForType,
  type MediaType 
} from '../../constants/mediaModels';

interface MediaGenerationPanelProps {
  onClose: () => void;
  onInsert?: (attachment: MediaAttachment) => void;
  chatContext?: string;
}

export function MediaGenerationPanel({ onClose, onInsert, chatContext }: MediaGenerationPanelProps) {
  const toast = useToast();
  const [mediaType, setMediaType] = useState<MediaType>('image');
  const [selectedModel, setSelectedModel] = useState('google-nano-banana-pro');
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

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Error', 'Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    try {
      // Mock generation
      await new Promise(resolve => setTimeout(resolve, 2000));
      const mockUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop';
      setGeneratedMedia(mockUrl);
      
      if (onInsert) {
        onInsert({
          id: Math.random().toString(36).substring(7),
          type: mediaType,
          url: mockUrl,
          name: `Generated ${mediaType}`,
          size: 1024,
          mime_type: mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'audio/mpeg',
          created_at: Date.now()
        });
      }
    } catch (error) {
      toast.error('Error', 'Failed to generate media');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 w-80">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Media Studio</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex gap-2">
          <button 
            onClick={() => setMediaType('image')}
            className={`flex-1 flex flex-col items-center p-2 rounded-lg border ${mediaType === 'image' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}
          >
            <Image className="w-5 h-5 mb-1" />
            <span className="text-xs">Image</span>
          </button>
          <button 
            onClick={() => setMediaType('video')}
            className={`flex-1 flex flex-col items-center p-2 rounded-lg border ${mediaType === 'video' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}
          >
            <Video className="w-5 h-5 mb-1" />
            <span className="text-xs">Video</span>
          </button>
          <button 
            onClick={() => setMediaType('audio')}
            className={`flex-1 flex flex-col items-center p-2 rounded-lg border ${mediaType === 'audio' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}
          >
            <Music className="w-5 h-5 mb-1" />
            <span className="text-xs">Audio</span>
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-500 uppercase">Model</label>
          <select 
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full p-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            {getModelsForType(mediaType).map(model => (
              <option key={model.id} value={model.id}>{model.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-500 uppercase">Prompt</label>
          <textarea 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want to generate..."
            className="w-full p-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 min-h-[100px]"
          />
        </div>

        <button 
          onClick={handleGenerate}
          disabled={isGenerating || !authToken}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center"
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Generate {mediaType}
        </button>

        {generatedMedia && (
          <div className="mt-4 p-2 border border-gray-200 dark:border-gray-800 rounded-lg">
            {mediaType === 'image' ? (
              <img src={generatedMedia} alt="Generated" className="w-full rounded" />
            ) : mediaType === 'video' ? (
              <video src={generatedMedia} controls className="w-full rounded" />
            ) : (
              <audio src={generatedMedia} controls className="w-full" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
