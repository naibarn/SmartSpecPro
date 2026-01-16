import React, { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Loader2, Download, RotateCcw, Upload, Plus, AlertCircle, X } from 'lucide-react';
import { useToast } from '../common/Toast';

interface ImageGeneratorProps {}

const IMAGE_MODELS = [
  { id: 'google-nano-banana-pro', name: 'Google Nano Banana Pro', category: 'Google' },
  { id: 'flux-2.0', name: 'Flux 2.0', category: 'Black Forest Labs' },
  { id: 'dalle-3', name: 'DALL-E 3', category: 'OpenAI' },
  { id: 'midjourney-v6', name: 'Midjourney v6', category: 'Midjourney' },
  { id: 'grok-imagine', name: 'Grok Imagine', category: 'xAI' },
];

export const ImageGenerator: React.FC<ImageGeneratorProps> = () => {
  const toast = useToast();
  const [selectedModel, setSelectedModel] = useState('google-nano-banana-pro');
  const [prompt, setPrompt] = useState('');
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceStyle, setReferenceStyle] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [estimatedCost] = useState<number>(0.5);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);

  const handleAddReferenceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setReferenceImages([...referenceImages, ...Array.from(e.target.files)]);
    }
  };

  const handleRemoveReferenceImage = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index));
  };

  const handleAddStyleReference = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setReferenceStyle(e.target.files[0]);
    }
  };

  const handleGenerateImage = async () => {
    if (!prompt.trim()) {
      toast.error("Prompt required", "Please enter a description for the image you want to generate.");
      return;
    }

    setIsGenerating(true);
    try {
      // Mock generation
      await new Promise(resolve => setTimeout(resolve, 3000));
      setGeneratedImage('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop');
      toast.success("Success", "Image generated successfully.");
    } catch (error) {
      toast.error("Error", "Failed to generate image. Please try again.");
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
                {IMAGE_MODELS.map(model => (
                  <option key={model.id} value={model.id}>{model.name} ({model.category})</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Prompt</label>
              <textarea 
                placeholder="Describe the image you want to generate..."
                className="w-full min-h-[120px] bg-slate-900 border border-slate-700 rounded-md p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reference Images (Optional)</label>
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Style Reference (Optional)</label>
              <div className="flex items-center gap-2">
                {referenceStyle ? (
                  <div className="relative w-16 h-16 rounded border border-slate-600 overflow-hidden group">
                    <img src={URL.createObjectURL(referenceStyle)} alt="style" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setReferenceStyle(null)}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => styleInputRef.current?.click()}
                    className="w-16 h-16 rounded border-2 border-dashed border-slate-600 flex items-center justify-center hover:border-blue-500 transition-colors"
                  >
                    <Upload className="w-6 h-6 text-slate-400" />
                  </button>
                )}
                <input 
                  type="file" 
                  ref={styleInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleAddStyleReference} 
                />
                <div className="text-xs text-slate-400">
                  Upload an image to use its style
                </div>
              </div>
            </div>

            <div className="p-3 bg-blue-900/20 border border-blue-800 rounded-md flex items-start gap-3 text-blue-300">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <p className="text-sm">Estimated cost: {estimatedCost} credits</p>
            </div>

            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isGenerating}
              onClick={handleGenerateImage}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Image'
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
            {generatedImage ? (
              <div className="space-y-4 w-full">
                <div className="relative aspect-square w-full rounded-lg overflow-hidden border border-slate-700">
                  <img src={generatedImage} alt="Generated" className="w-full h-full object-contain" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-slate-700 hover:bg-slate-700">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                  <Button variant="outline" className="flex-1 border-slate-700 hover:bg-slate-700" onClick={() => setGeneratedImage(null)}>
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
                  {isGenerating ? 'Generating your masterpiece...' : 'Your generated image will appear here'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ImageGenerator;
