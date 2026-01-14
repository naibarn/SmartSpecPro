import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Download, RotateCcw, Upload, Plus, Play, Pause } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface AudioGeneratorProps {}

const AUDIO_MODELS = [
  { id: 'elevenlabs-tts', name: 'ElevenLabs Text-to-Speech', category: 'ElevenLabs' },
  { id: 'elevenlabs-sfx', name: 'ElevenLabs Sound Effects', category: 'ElevenLabs' },
];

const VOICES = [
  { id: 'adam', name: 'Adam (Male)' },
  { id: 'bella', name: 'Bella (Female)' },
  { id: 'charlie', name: 'Charlie (Male)' },
  { id: 'dorothy', name: 'Dorothy (Female)' },
  { id: 'emily', name: 'Emily (Female)' },
  { id: 'ethan', name: 'Ethan (Male)' },
];

export const AudioGenerator: React.FC<AudioGeneratorProps> = () => {
  const { toast } = useToast();
  const [selectedModel, setSelectedModel] = useState('elevenlabs-tts');
  const [selectedVoice, setSelectedVoice] = useState('adam');
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<number>(0.01);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleGenerateAudio = async () => {
    if (!text.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter text',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/v1/media/audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          text: text,
          voice: selectedVoice,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      setGeneratedAudio(data.data?.[0]?.url || null);

      toast({
        title: 'Success',
        description: `Audio generated successfully! Credits used: ${data.credits_used}`,
      });
    } catch (error) {
      console.error('Error generating audio:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate audio. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAudio = async () => {
    if (!generatedAudio) return;

    try {
      const response = await fetch(generatedAudio);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-audio-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading audio:', error);
      toast({
        title: 'Error',
        description: 'Failed to download audio',
        variant: 'destructive',
      });
    }
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
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
                {AUDIO_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id} className="text-white">
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Voice Selection (only for TTS) */}
          {selectedModel === 'elevenlabs-tts' && (
            <div>
              <label className="block text-sm font-semibold text-white mb-2">Voice</label>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  {VOICES.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id} className="text-white">
                      {voice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Text Input */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              {selectedModel === 'elevenlabs-tts' ? 'Text to Speech' : 'Sound Description'}
            </label>
            <Textarea
              placeholder={
                selectedModel === 'elevenlabs-tts'
                  ? 'Enter text to convert to speech...'
                  : 'Describe the sound effect you want to generate...'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white placeholder-slate-500 min-h-24 resize-none"
            />
            <p className="text-xs text-slate-400 mt-2">
              {text.length} characters
            </p>
          </div>

          {/* Cost Estimate */}
          <div className="p-3 bg-slate-700/50 rounded border border-slate-600">
            <p className="text-xs text-slate-400">Estimated Cost</p>
            <p className="text-lg font-bold text-blue-400">${estimatedCost.toFixed(4)}</p>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerateAudio}
            disabled={isGenerating || !text.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Audio'
            )}
          </Button>
        </div>
      </div>

      {/* Right Panel - Preview */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {generatedAudio ? (
          <div className="w-full max-w-2xl space-y-6">
            <audio ref={audioRef} src={generatedAudio} />

            {/* Player */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-80">Generated Audio</p>
                  <p className="text-lg font-semibold">Playing now...</p>
                </div>
                <Button
                  onClick={handlePlayPause}
                  size="lg"
                  className="bg-white text-blue-600 hover:bg-slate-100 rounded-full w-16 h-16"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={handleDownloadAudio}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button
                onClick={() => {
                  setGeneratedAudio(null);
                  setText('');
                  setIsPlaying(false);
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
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
            <p className="text-lg font-semibold">Ready to generate</p>
            <p className="text-sm">Enter text and click Generate to create audio</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioGenerator;
