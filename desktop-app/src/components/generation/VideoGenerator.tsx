import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Download, RotateCcw, Upload, Plus } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface VideoGeneratorProps {}

const VIDEO_MODELS = [
  { id: 'veo-3-1', name: 'Veo 3.1', category: 'Google' },
  { id: 'sora-2', name: 'Sora 2', category: 'OpenAI' },
  { id: 'kling-2.6', name: 'Kling 2.6', category: 'Kuaishou' },
];

export const VideoGenerator: React.FC<VideoGeneratorProps> = () => {
  const { toast } = useToast();
  const [selectedModel, setSelectedModel] = useState('veo-3-1');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('5');
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [estimatedCost, setEstimatedCost] = useState<number>(0.05);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddReferenceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setReferenceImages([...referenceImages, ...Array.from(e.target.files)]);
    }
  };

  const handleRemoveReferenceImage = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index));
  };

  const handleGenerateVideo = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a prompt',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const formData = new FormData();
      formData.append('model', selectedModel);
      formData.append('prompt', prompt);
      formData.append('duration', duration);

      // Add reference images
      referenceImages.forEach((img) => {
        formData.append('reference_images', img);
      });

      // Call backend API
      const response = await fetch('/api/v1/media/video', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      setGeneratedVideo(data.data?.[0]?.url || null);

      toast({
        title: 'Success',
        description: `Video generated successfully! Credits used: ${data.credits_used}`,
      });
    } catch (error) {
      console.error('Error generating video:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate video. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadVideo = async () => {
    if (!generatedVideo) return;

    try {
      const response = await fetch(generatedVideo);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading video:', error);
      toast({
        title: 'Error',
        description: 'Failed to download video',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex h-full bg-slate-900">
      {/* Left Panel - Controls */}
      <div className="w-80 border-r border-slate-700 overflow-y-auto bg-slate-800/50">
        <div className="p-4 space-y-6">
          {/* Model Selection */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">Model</label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                {VIDEO_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id} className="text-white">
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">Duration (seconds)</label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-700 border-slate-600">
                <SelectItem value="5" className="text-white">5 seconds</SelectItem>
                <SelectItem value="10" className="text-white">10 seconds</SelectItem>
                <SelectItem value="15" className="text-white">15 seconds</SelectItem>
                <SelectItem value="30" className="text-white">30 seconds</SelectItem>
                <SelectItem value="60" className="text-white">60 seconds</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reference Images */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-white">Reference Images</label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-400 hover:text-blue-300"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleAddReferenceImage}
              className="hidden"
            />

            <div className="space-y-2">
              {referenceImages.map((img, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-slate-700 rounded border border-slate-600"
                >
                  <span className="text-xs text-slate-300 truncate">{img.name}</span>
                  <button
                    onClick={() => handleRemoveReferenceImage(idx)}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">Prompt</label>
            <Textarea
              placeholder="Describe the video you want to generate..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white placeholder-slate-500 min-h-24 resize-none"
            />
          </div>

          {/* Cost Estimate */}
          <div className="p-3 bg-slate-700/50 rounded border border-slate-600">
            <p className="text-xs text-slate-400">Estimated Cost</p>
            <p className="text-lg font-bold text-blue-400">${estimatedCost.toFixed(4)}</p>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerateVideo}
            disabled={isGenerating || !prompt.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Video'
            )}
          </Button>
        </div>
      </div>

      {/* Right Panel - Preview */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {generatedVideo ? (
          <div className="w-full max-w-2xl space-y-4">
            <div className="relative bg-slate-700 rounded-lg overflow-hidden aspect-video">
              <video
                src={generatedVideo}
                controls
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleDownloadVideo}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button
                onClick={() => {
                  setGeneratedVideo(null);
                  setPrompt('');
                }}
                variant="outline"
                className="flex-1"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                New
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center text-slate-400">
            <svg
              className="w-24 h-24 mx-auto mb-4 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-lg font-semibold">Ready to generate</p>
            <p className="text-sm">Enter a prompt and click Generate to create a video</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoGenerator;
