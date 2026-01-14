import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Download, RotateCcw, Upload, Plus, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface ImageGeneratorProps {}

const IMAGE_MODELS = [
  { id: 'google-nano-banana-pro', name: 'Google Nano Banana Pro', category: 'Google' },
  { id: 'flux-2.0', name: 'Flux 2.0', category: 'Black Forest Labs' },
  { id: 'z-image', name: 'Z-Image', category: 'Z-AI' },
  { id: 'grok-imagine', name: 'Grok Imagine', category: 'xAI' },
];

export const ImageGenerator: React.FC<ImageGeneratorProps> = () => {
  const { toast } = useToast();
  const [selectedModel, setSelectedModel] = useState('google-nano-banana-pro');
  const [prompt, setPrompt] = useState('');
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceStyle, setReferenceStyle] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [estimatedCost, setEstimatedCost] = useState<number>(0.01);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);

  const handleAddReferenceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setReferenceImages([...referenceImages, ...Array.from(e.target.files)]);
    }
  };

  const handleAddStyleReference = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setReferenceStyle(e.target.files[0]);
    }
  };

  const handleRemoveReferenceImage = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index));
  };

  const handleGenerateImage = async () => {
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

      // Add reference images
      referenceImages.forEach((img, idx) => {
        formData.append(`reference_images`, img);
      });

      // Add style reference
      if (referenceStyle) {
        formData.append('reference_style', referenceStyle);
      }

      // Call backend API
      const response = await fetch('/api/v1/media/image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      setGeneratedImage(data.data?.[0]?.url || null);

      toast({
        title: 'Success',
        description: `Image generated successfully! Credits used: ${data.credits_used}`,
      });
    } catch (error) {
      console.error('Error generating image:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate image. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!generatedImage) return;

    try {
      const response = await fetch(generatedImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading image:', error);
      toast({
        title: 'Error',
        description: 'Failed to download image',
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
                {IMAGE_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id} className="text-white">
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* References */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-white">References</label>
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

            {/* Reference Images */}
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

            {/* Style Reference */}
            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-400 mb-2">Style Reference</label>
              <button
                onClick={() => styleInputRef.current?.click()}
                className="w-full p-2 border-2 border-dashed border-slate-600 rounded text-slate-400 hover:border-slate-500 text-sm"
              >
                {referenceStyle ? referenceStyle.name : 'Click to upload style reference'}
              </button>
              <input
                ref={styleInputRef}
                type="file"
                accept="image/*"
                onChange={handleAddStyleReference}
                className="hidden"
              />
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">Prompt</label>
            <Textarea
              placeholder="Describe the image you want to generate..."
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
            onClick={handleGenerateImage}
            disabled={isGenerating || !prompt.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Image'
            )}
          </Button>
        </div>
      </div>

      {/* Right Panel - Preview */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {generatedImage ? (
          <div className="w-full max-w-2xl space-y-4">
            <div className="relative bg-slate-700 rounded-lg overflow-hidden aspect-square">
              <img
                src={generatedImage}
                alt="Generated"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleDownloadImage}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button
                onClick={() => {
                  setGeneratedImage(null);
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
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-lg font-semibold">Ready to generate</p>
            <p className="text-sm">Enter a prompt and click Generate to create an image</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageGenerator;
