/**
 * SmartSpec Pro - Generation History Component
 * Displays history of generated content with filtering and search.
 */

import React, { useState, useMemo } from 'react';
import {
  Image,
  Video,
  Music,
  Clock,
  Download,
  Trash2,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Share2,
  Heart,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';

// Types
type MediaType = 'image' | 'video' | 'audio' | 'all';
type TaskStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed';

interface GenerationTask {
  id: string;
  status: TaskStatus;
  mediaType: 'image' | 'video' | 'audio';
  modelId: string;
  modelName: string;
  prompt: string;
  outputUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
  creditsUsed: number;
  createdAt: string;
  completedAt?: string;
}

// Mock data for demonstration
const MOCK_HISTORY: GenerationTask[] = [
  {
    id: '1',
    status: 'completed',
    mediaType: 'image',
    modelId: 'nano-banana-pro',
    modelName: 'Nano Banana Pro',
    prompt: 'A beautiful sunset over mountains with vibrant orange and purple colors',
    outputUrl: 'https://picsum.photos/seed/1/800/600',
    thumbnailUrl: 'https://picsum.photos/seed/1/200/150',
    creditsUsed: 18,
    createdAt: '2025-01-03T10:30:00Z',
    completedAt: '2025-01-03T10:30:45Z',
  },
  {
    id: '2',
    status: 'completed',
    mediaType: 'video',
    modelId: 'wan/2-6-text-to-video',
    modelName: 'Wan 2.6',
    prompt: 'A dog running on the beach at sunset',
    outputUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/2/200/150',
    creditsUsed: 70,
    createdAt: '2025-01-03T09:15:00Z',
    completedAt: '2025-01-03T09:18:30Z',
  },
  {
    id: '3',
    status: 'processing',
    mediaType: 'image',
    modelId: 'flux-2',
    modelName: 'FLUX 2',
    prompt: 'A futuristic city with flying cars and neon lights',
    creditsUsed: 0,
    createdAt: '2025-01-03T11:00:00Z',
  },
  {
    id: '4',
    status: 'failed',
    mediaType: 'audio',
    modelId: 'elevenlabs/text-to-speech-turbo-2-5',
    modelName: 'ElevenLabs TTS',
    prompt: 'Hello, welcome to SmartSpec Pro!',
    errorMessage: 'Rate limit exceeded. Please try again later.',
    creditsUsed: 0,
    createdAt: '2025-01-03T08:45:00Z',
  },
  {
    id: '5',
    status: 'completed',
    mediaType: 'audio',
    modelId: 'elevenlabs/text-to-speech-turbo-2-5',
    modelName: 'ElevenLabs TTS',
    prompt: 'This is a test of the text to speech system.',
    outputUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    creditsUsed: 12,
    createdAt: '2025-01-02T16:20:00Z',
    completedAt: '2025-01-02T16:20:15Z',
  },
];

// Helper functions
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

const getStatusIcon = (status: TaskStatus) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'processing':
    case 'queued':
    case 'pending':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
  }
};

const getMediaIcon = (mediaType: 'image' | 'video' | 'audio') => {
  switch (mediaType) {
    case 'image':
      return <Image className="w-4 h-4" />;
    case 'video':
      return <Video className="w-4 h-4" />;
    case 'audio':
      return <Music className="w-4 h-4" />;
  }
};

// History Item Component
const HistoryItem: React.FC<{
  task: GenerationTask;
  onView: (task: GenerationTask) => void;
  onDelete: (taskId: string) => void;
}> = ({ task, onView, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
      <div className="flex gap-4">
        {/* Thumbnail */}
        <div className="flex-shrink-0 w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
          {task.thumbnailUrl ? (
            <img
              src={task.thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              {getMediaIcon(task.mediaType)}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(task.status)}
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {task.modelName}
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                {getMediaIcon(task.mediaType)}
                {task.mediaType}
              </span>
            </div>

            {/* Actions Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <MoreVertical className="w-4 h-4 text-gray-500" />
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
                  {task.status === 'completed' && (
                    <>
                      <button
                        onClick={() => {
                          onView(task);
                          setShowMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                      <button
                        onClick={() => window.open(task.outputUrl, '_blank')}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                      <button className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                        <Share2 className="w-4 h-4" />
                        Share to Gallery
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      onDelete(task.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Prompt */}
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {task.prompt}
          </p>

          {/* Error Message */}
          {task.status === 'failed' && task.errorMessage && (
            <p className="mt-2 text-sm text-red-500">{task.errorMessage}</p>
          )}

          {/* Footer */}
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(task.createdAt)}
            </span>
            {task.creditsUsed > 0 && (
              <span>{task.creditsUsed} credits</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Preview Modal Component
const PreviewModal: React.FC<{
  task: GenerationTask | null;
  onClose: () => void;
}> = ({ task, onClose }) => {
  if (!task) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-medium text-gray-900 dark:text-white">
            {task.modelName}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Media */}
          <div className="bg-black rounded-lg overflow-hidden">
            {task.mediaType === 'image' && task.outputUrl && (
              <img
                src={task.outputUrl}
                alt=""
                className="w-full h-auto max-h-[60vh] object-contain"
              />
            )}
            {task.mediaType === 'video' && task.outputUrl && (
              <video
                src={task.outputUrl}
                controls
                className="w-full h-auto max-h-[60vh]"
              />
            )}
            {task.mediaType === 'audio' && task.outputUrl && (
              <div className="p-8">
                <audio src={task.outputUrl} controls className="w-full" />
              </div>
            )}
          </div>

          {/* Prompt */}
          <div className="mt-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Prompt
            </h4>
            <p className="text-gray-600 dark:text-gray-400">{task.prompt}</p>
          </div>

          {/* Actions */}
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => window.open(task.outputUrl, '_blank')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
              <Share2 className="w-4 h-4" />
              Share to Gallery
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
              <Heart className="w-4 h-4" />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main History Component
export const GenerationHistory: React.FC = () => {
  const [history, setHistory] = useState<GenerationTask[]>(MOCK_HISTORY);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<MediaType>('all');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [selectedTask, setSelectedTask] = useState<GenerationTask | null>(null);

  // Filter history
  const filteredHistory = useMemo(() => {
    return history.filter((task) => {
      // Search filter
      if (searchQuery && !task.prompt.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Type filter
      if (filterType !== 'all' && task.mediaType !== filterType) {
        return false;
      }
      // Status filter
      if (filterStatus !== 'all' && task.status !== filterStatus) {
        return false;
      }
      return true;
    });
  }, [history, searchQuery, filterType, filterStatus]);

  // Handle delete
  const handleDelete = (taskId: string) => {
    setHistory((prev) => prev.filter((t) => t.id !== taskId));
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Clock className="w-6 h-6 text-blue-500" />
          Generation History
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          View and manage your generated content
        </p>
      </div>

      {/* Filters */}
      <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search prompts..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as MediaType)}
              className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="all">All Types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TaskStatus | 'all')}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredHistory.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No generation history found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredHistory.map((task) => (
              <HistoryItem
                key={task.id}
                task={task}
                onView={setSelectedTask}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <PreviewModal task={selectedTask} onClose={() => setSelectedTask(null)} />
    </div>
  );
};

export default GenerationHistory;
