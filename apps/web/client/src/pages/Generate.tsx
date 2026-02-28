/**
 * Generate Page - SmartAIHub
 * AI content generation interface
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { getPostHog } from '@/lib/posthog';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Image,
  Video,
  Music,
  Wand2,
  Zap,
  Upload,
  Download,
  Clock,
  ChevronLeft,
  Settings,
  RefreshCw,
  Copy,
  Trash2,
} from 'lucide-react';

type GenerationType = 'image' | 'video' | 'audio';

export default function Generate() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<GenerationType>('image');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  // Parse URL to determine initial tab
  useEffect(() => {
    const path = location.split('/').pop();
    if (path === 'image' || path === 'video' || path === 'audio') {
      setActiveTab(path as GenerationType);
    }
  }, [location]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const tabs = [
    { id: 'image' as GenerationType, label: 'Image', icon: Image, color: 'from-purple-500 to-pink-500' },
    { id: 'video' as GenerationType, label: 'Video', icon: Video, color: 'from-blue-500 to-cyan-500' },
    { id: 'audio' as GenerationType, label: 'Audio', icon: Music, color: 'from-orange-500 to-red-500' },
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    getPostHog()?.capture("job_create_clicked", { job_type: activeTab });
    setIsGenerating(true);
    // Simulate generation
    setTimeout(() => {
      setGeneratedContent(`Generated ${activeTab} from: "${prompt}"`);
      setIsGenerating(false);
    }, 3000);
  };

  const costPerGeneration = {
    image: 10,
    video: 50,
    audio: 20,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/dashboard')}
                className="text-gray-600"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Generate Content</h1>
                  <p className="text-sm text-gray-500">Create amazing AI-powered media</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-yellow-50 px-4 py-2 rounded-lg">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span className="font-semibold text-gray-900">{user.credits ?? 0}</span>
                <span className="text-sm text-gray-500">credits</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Generation Type Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex gap-3 mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setGeneratedContent(null);
                  setPrompt('');
                }}
                className={`flex items-center gap-3 px-6 py-3 rounded-xl font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r ' + tab.color + ' text-white shadow-lg'
                    : 'bg-white/70 text-gray-600 hover:bg-white'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-6"
          >
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Prompt</h2>
                <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  {costPerGeneration[activeTab]} credits
                </span>
              </div>
              
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={`Describe the ${activeTab} you want to generate...`}
                className="w-full h-40 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />

              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Advanced Options</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Quality</label>
                    <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option>Standard</option>
                      <option>High</option>
                      <option>Ultra</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Style</label>
                    <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option>Realistic</option>
                      <option>Artistic</option>
                      <option>Abstract</option>
                    </select>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!prompt.trim() || isGenerating || (user.credits ?? 0) < costPerGeneration[activeTab]}
                className="w-full mt-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg transition-all disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Generate {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                  </>
                )}
              </Button>

              {(user.credits ?? 0) < costPerGeneration[activeTab] && (
                <p className="text-sm text-red-500 mt-2 text-center">
                  Not enough credits. <button onClick={() => setLocation('/credits')} className="underline">Buy more</button>
                </p>
              )}
            </div>

            {/* Recent Generations */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">Recent Generations</h3>
                <Clock className="w-4 h-4 text-gray-400" />
              </div>
              <div className="space-y-2">
                {[1, 2, 3].map((i) => {
                  const activeTabData = tabs.find(t => t.id === activeTab);
                  const IconComponent = activeTabData?.icon;
                  
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${activeTabData?.color} flex items-center justify-center`}>
                        {IconComponent && <IconComponent className="w-5 h-5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          Generation {i}
                        </p>
                        <p className="text-xs text-gray-500">{i} hour{i > 1 ? 's' : ''} ago</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>

          {/* Preview Section */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 p-6 sticky top-24">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Preview</h2>
              
              <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl flex items-center justify-center mb-4">
                {isGenerating ? (
                  <div className="text-center">
                    <div className="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-sm text-gray-500">Generating your {activeTab}...</p>
                  </div>
                ) : generatedContent ? (
                  <div className="text-center p-6">
                    <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${tabs.find(t => t.id === activeTab)?.color} flex items-center justify-center mx-auto mb-4`}>
                      {(() => {
                        const ActiveIcon = tabs.find(t => t.id === activeTab)?.icon;
                        return ActiveIcon ? <ActiveIcon className="w-10 h-10 text-white" /> : null;
                      })()}
                    </div>
                    <p className="text-sm text-gray-600">{generatedContent}</p>
                  </div>
                ) : (
                  <div className="text-center text-gray-400">
                    <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No content generated yet</p>
                  </div>
                )}
              </div>

              {generatedContent && !isGenerating && (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <Button variant="outline" className="flex-1">
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                  <Button variant="outline" className="flex-1">
                    <Upload className="w-4 h-4 mr-2" />
                    Share
                  </Button>
                  <Button variant="outline" size="icon">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
