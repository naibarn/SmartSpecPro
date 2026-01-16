import React, { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Loader2, Download, RotateCcw, Play, Pause, AlertCircle } from 'lucide-react';
import { useToast } from '../common/Toast';

interface AudioGeneratorProps {}

const AUDIO_MODELS = [
  { id: 'elevenlabs-tts', name: 'ElevenLabs TTS', category: 'ElevenLabs' },
  { id: 'openai-tts-1', name: 'OpenAI TTS-1', category: 'OpenAI' },
  { id: 'suno-v3.5', name: 'Suno v3.5 (Music)', category: 'Suno' },
  { id: 'udio-v1', name: 'Udio v1 (Music)', category: 'Udio' },
];

const VOICES = [
  { id: 'adam', name: 'Adam (Male)' },
  { id: 'bella', name: 'Bella (Female)' },
  { id: 'charlie', name: 'Charlie (Male)' },
  { id: 'dorothy', name: 'Dorothy (Female)' },
  { id: 'ethan', name: 'Ethan (Male)' },
];

export const AudioGenerator: React.FC<AudioGeneratorProps> = () => {
  const toast = useToast();
  const [selectedModel, setSelectedModel] = useState('elevenlabs-tts');
  const [selectedVoice, setSelectedVoice] = useState('adam');
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [estimatedCost] = useState<number>(0.01);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleGenerateAudio = async () => {
    if (!text.trim()) {
      toast.error('Error', 'Please enter text');
      return;
    }

    setIsGenerating(true);
    try {
      // Mock generation
      await new Promise(resolve => setTimeout(resolve, 2000));
      setGeneratedAudio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
      toast.success("Success", "Audio generated successfully.");
    } catch (error) {
      toast.error("Error", "Failed to generate audio. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlay = () => {
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
                {AUDIO_MODELS.map(model => (
                  <option key={model.id} value={model.id}>{model.name} ({model.category})</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Voice</label>
              <select 
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {VOICES.map(voice => (
                  <option key={voice.id} value={voice.id}>{voice.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Text / Lyrics</label>
              <textarea 
                placeholder="Enter text to convert to speech or lyrics for music..."
                className="w-full min-h-[150px] bg-slate-900 border border-slate-700 rounded-md p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            <div className="p-3 bg-blue-900/20 border border-blue-800 rounded-md flex items-start gap-3 text-blue-300">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <p className="text-sm">Estimated cost: {estimatedCost} credits per character/second</p>
            </div>

            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isGenerating}
              onClick={handleGenerateAudio}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Audio'
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
            {generatedAudio ? (
              <div className="space-y-6 w-full">
                <div className="p-8 bg-slate-900 rounded-xl border border-slate-700 flex flex-col items-center gap-6">
                  <div 
                    onClick={togglePlay}
                    className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20"
                  >
                    {isPlaying ? (
                      <Pause className="w-10 h-10 text-white" />
                    ) : (
                      <Play className="w-10 h-10 text-white ml-1" />
                    )}
                  </div>
                  <div className="w-full space-y-2">
                    <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full bg-blue-500 ${isPlaying ? 'w-full transition-all duration-[30s] ease-linear' : 'w-0'}`} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>0:00</span>
                      <span>0:30</span>
                    </div>
                  </div>
                  <audio 
                    ref={audioRef} 
                    src={generatedAudio} 
                    onEnded={() => setIsPlaying(false)}
                    className="hidden" 
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-slate-700 hover:bg-slate-700">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                  <Button variant="outline" className="flex-1 border-slate-700 hover:bg-slate-700" onClick={() => setGeneratedAudio(null)}>
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
                  {isGenerating ? 'Composing your audio...' : 'Your generated audio will appear here'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AudioGenerator;
