import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';

import ImageGenerator from './ImageGenerator';
import VideoGenerator from './VideoGenerator';
import AudioGenerator from './AudioGenerator';

interface MediaStudioProps {
  onClose?: () => void;
}

export const MediaStudio: React.FC<MediaStudioProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'image' | 'video' | 'audio' | 'tools'>('image');
  const [credits, setCredits] = useState<number>(0);

  useEffect(() => {
    // Load credits
    setCredits(1000);
  }, []);

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Media Studio</h1>
            <p className="text-sm text-slate-400">Generate images, videos, and audio with AI</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-slate-700/50 rounded-lg border border-slate-600">
              <p className="text-sm text-slate-300">Credits Available</p>
              <p className="text-2xl font-bold text-blue-400">{credits}</p>
            </div>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b border-slate-700 bg-slate-800/50 p-0 h-auto">
          <TabsTrigger 
            value="image"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent"
          >
            Image Generation
          </TabsTrigger>
          <TabsTrigger 
            value="video"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent"
          >
            Video Generation
          </TabsTrigger>
          <TabsTrigger 
            value="audio"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent"
          >
            Audio & Speech
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto p-6">
          <TabsContent value="image" className="m-0">
            <ImageGenerator />
          </TabsContent>
          <TabsContent value="video" className="m-0">
            <VideoGenerator />
          </TabsContent>
          <TabsContent value="audio" className="m-0">
            <AudioGenerator />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default MediaStudio;
