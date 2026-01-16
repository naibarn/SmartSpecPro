import React, { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Loader2, Download, RotateCcw, Plus, X, AlertCircle } from 'lucide-react';
import { useToast } from '../common/Toast';

interface VideoGeneratorProps {}

const VIDEO_MODELS = [
  { id: 'veo-3-1', name: 'Google Veo 3.1', category: 'Google' },
  { id: 'sora-v2', name: 'Sora v2', category: 'OpenAI' },
  { id: 'runway-gen-3', name: 'Runway Gen-3 Alpha', category: 'Runway' },
  { id: 'luma-dream-machine', name: 'Luma Dream Machine', category: 'Luma AI' },
  { id: 'kling-2.6', name: 'Kling 2.6', category: 'Kuaishou' },
];

export const VideoGenerator: React.FC<VideoGeneratorProps> = () => {
  const toast = useToast();
  const [selectedModel, setSelectedModel] = useState('veo-3-1');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('5');
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [estimatedCost] = useState<number>(2.5);

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
      toast.error('Error', 'Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    try {
      // Mock generation
      await new Promise(resolve => setTimeout(resolve, 5000));
      setGeneratedVideo('https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4');
      toast.success("Success", "Video generated successfully.");
    } catch (error) {
      toast.error("Error", "Failed to generate video. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card className="bg-slate-800/50 border-slate-700 text-white">
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <select 
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {VIDEO_MODELS.map(model => (
                  <option key={model.id} value={model.id}>{model.name} ({model.category})</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Prompt</label>
              <textarea 
                placeholder="Describe the video you want to generate..."
                className="w-full min-h-[120px] bg-slate-900 border border-slate-700 rounded-md p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Duration (seconds)</label>
              <select 
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="5">5 Seconds</option>
                <option value="10">10 Seconds</option>
                <option value="30">30 Seconds</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Image-to-Video Reference</label>
              <div className="flex flex-wrap gap-2">
                {referenceImages.map((file, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded border border-slate-600 overflow-hidden group">
                    <img src={URL.createObjectURL(file)} alt="ref" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => handleRemoveReferenceImage(idx)}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded border-2 border-dashed border-slate-600 flex items-center justify-center hover:border-blue-500 transition-colors"
                >
                  <Plus className="w-6 h-6 text-slate-400" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  multiple 
                  accept="image/*" 
                  onChange={handleAddReferenceImage} 
                />
              </div>
            </div>

            <div className="p-3 bg-blue-900/20 border border-blue-800 rounded-md flex items-start gap-3 text-blue-300">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <p className="text-sm">Estimated cost: {estimatedCost} credits</p>
            </div>

            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isGenerating}
              onClick={handleGenerateVideo}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Video'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-slate-800/50 border-slate-700 text-white h-full flex flex-col">
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center p-6">
            {generatedVideo ? (
              <div className="space-y-4 w-full">
                <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-slate-700 bg-black">
                  <video src={generatedVideo} controls className="w-full h-full" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-slate-700 hover:bg-slate-700">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                  <Button variant="outline" className="flex-1 border-slate-700 hover:bg-slate-700" onClick={() => setGeneratedVideo(null)}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Regenerate
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-2">
                <div className="w-20 h-20 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto">
                  <Loader2 className={`w-10 h-10 text-slate-500 ${isGenerating ? 'animate-spin' : ''}`} />
                </div>
                <p className="text-slate-400">
                  {isGenerating ? 'Creating your cinematic experience...' : 'Your generated video will appear here'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VideoGenerator;
