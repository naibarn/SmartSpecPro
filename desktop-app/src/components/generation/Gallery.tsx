/**
 * Media Gallery Component
 * Displays and manages generated media (images, videos, audio)
 */

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Loader2, Download, Trash2, RefreshCw, Filter,
  Image as ImageIcon, Video as VideoIcon, Music as MusicIcon,
  Clock, CheckCircle, XCircle, AlertCircle
} from 'lucide-react';
import { useToast } from '../common/Toast';
import { listTasks, cancelTask, downloadMedia, TaskStatus } from '../../services/mediaService';

interface GalleryProps {}

export const Gallery: React.FC<GalleryProps> = () => {
  const toast = useToast();
  const [tasks, setTasks] = useState<TaskStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'processing' | 'failed'>('all');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 12;

  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const mediaType = filter === 'all' ? undefined : filter;
      const status = statusFilter === 'all' ? undefined : statusFilter;

      const response = await listTasks(mediaType, status, limit, page * limit);
      setTasks(response.tasks);
      setTotal(response.total);
    } catch (error) {
      toast.error('Error', 'Failed to load media gallery');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [filter, statusFilter, page]);

  const handleCancelTask = async (taskId: string) => {
    try {
      await cancelTask(taskId);
      toast.success('Success', 'Task cancelled successfully');
      loadTasks();
    } catch (error) {
      toast.error('Error', 'Failed to cancel task');
    }
  };

  const handleDownload = async (taskId: string, mediaType: string) => {
    try {
      const blob = await downloadMedia(taskId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${taskId}.${mediaType === 'image' ? 'png' : mediaType === 'video' ? 'mp4' : 'mp3'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Success', 'Download started');
    } catch (error) {
      toast.error('Error', 'Failed to download media');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing':
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500 animate-pulse" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
      default:
        return null;
    }
  };

  const getMediaIcon = (mediaType: string) => {
    switch (mediaType) {
      case 'image':
        return <ImageIcon className="w-4 h-4" />;
      case 'video':
        return <VideoIcon className="w-4 h-4" />;
      case 'audio':
        return <MusicIcon className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const renderMediaPreview = (task: TaskStatus) => {
    if (task.status !== 'completed' || !task.result_url) {
      return (
        <div className="aspect-square bg-slate-900 rounded-lg flex flex-col items-center justify-center">
          {task.status === 'processing' || task.status === 'pending' ? (
            <>
              <Loader2 className="w-8 h-8 text-slate-500 animate-spin mb-2" />
              <span className="text-xs text-slate-500 capitalize">{task.status}</span>
            </>
          ) : (
            <>
              <XCircle className="w-8 h-8 text-red-500 mb-2" />
              <span className="text-xs text-red-400">Failed</span>
            </>
          )}
        </div>
      );
    }

    switch (task.media_type) {
      case 'image':
        return (
          <div className="aspect-square bg-slate-900 rounded-lg overflow-hidden">
            <img
              src={task.result_url}
              alt={task.prompt}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x300?text=Failed+to+Load';
              }}
            />
          </div>
        );
      case 'video':
        return (
          <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden">
            <video
              src={task.result_url}
              className="w-full h-full object-cover"
              controls={false}
              muted
              loop
              onMouseEnter={(e) => e.currentTarget.play()}
              onMouseLeave={(e) => {
                e.currentTarget.pause();
                e.currentTarget.currentTime = 0;
              }}
            />
          </div>
        );
      case 'audio':
        return (
          <div className="aspect-square bg-slate-900 rounded-lg flex flex-col items-center justify-center p-4">
            <MusicIcon className="w-12 h-12 text-blue-500 mb-4" />
            <audio src={task.result_url} controls className="w-full" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <Card className="bg-slate-800/50 border-slate-700 text-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Media Gallery</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={loadTasks}
              className="border-slate-700 hover:bg-slate-700"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {/* Media Type Filter */}
            <div className="flex gap-2">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
                className={filter === 'all' ? 'bg-blue-600' : 'border-slate-700 hover:bg-slate-700'}
              >
                All
              </Button>
              <Button
                variant={filter === 'image' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('image')}
                className={filter === 'image' ? 'bg-blue-600' : 'border-slate-700 hover:bg-slate-700'}
              >
                <ImageIcon className="w-4 h-4 mr-1" />
                Images
              </Button>
              <Button
                variant={filter === 'video' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('video')}
                className={filter === 'video' ? 'bg-blue-600' : 'border-slate-700 hover:bg-slate-700'}
              >
                <VideoIcon className="w-4 h-4 mr-1" />
                Videos
              </Button>
              <Button
                variant={filter === 'audio' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('audio')}
                className={filter === 'audio' ? 'bg-blue-600' : 'border-slate-700 hover:bg-slate-700'}
              >
                <MusicIcon className="w-4 h-4 mr-1" />
                Audio
              </Button>
            </div>

            {/* Status Filter */}
            <div className="flex gap-2">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('all')}
                className={statusFilter === 'all' ? 'bg-blue-600' : 'border-slate-700 hover:bg-slate-700'}
              >
                All Status
              </Button>
              <Button
                variant={statusFilter === 'completed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('completed')}
                className={statusFilter === 'completed' ? 'bg-blue-600' : 'border-slate-700 hover:bg-slate-700'}
              >
                Completed
              </Button>
              <Button
                variant={statusFilter === 'processing' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('processing')}
                className={statusFilter === 'processing' ? 'bg-blue-600' : 'border-slate-700 hover:bg-slate-700'}
              >
                Processing
              </Button>
              <Button
                variant={statusFilter === 'failed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('failed')}
                className={statusFilter === 'failed' ? 'bg-blue-600' : 'border-slate-700 hover:bg-slate-700'}
              >
                Failed
              </Button>
            </div>
          </div>

          <div className="mt-4 text-sm text-slate-400">
            Showing {tasks.length} of {total} items
          </div>
        </CardContent>
      </Card>

      {/* Gallery Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700 text-white">
          <CardContent className="py-12 text-center">
            <Filter className="w-12 h-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">No media found</p>
            <p className="text-sm text-slate-500 mt-2">Try adjusting your filters or generate some media</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tasks.map((task) => (
            <Card key={task.id} className="bg-slate-800/50 border-slate-700 text-white overflow-hidden group">
              <CardContent className="p-0">
                {/* Media Preview */}
                <div className="relative">
                  {renderMediaPreview(task)}

                  {/* Overlay Actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {task.status === 'completed' && (
                      <Button
                        size="sm"
                        onClick={() => handleDownload(task.id, task.media_type)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                    {(task.status === 'pending' || task.status === 'processing') && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleCancelTask(task.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {/* Task Info */}
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getMediaIcon(task.media_type)}
                      <span className="text-xs font-medium capitalize">{task.media_type}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {getStatusIcon(task.status)}
                      <span className="text-xs capitalize">{task.status}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2">{task.prompt}</p>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{task.model}</span>
                    {task.credits_used && (
                      <span>{task.credits_used} credits</span>
                    )}
                  </div>

                  {task.error_message && (
                    <p className="text-xs text-red-400 line-clamp-1">{task.error_message}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="border-slate-700 hover:bg-slate-700"
          >
            Previous
          </Button>
          <span className="text-sm text-slate-400">
            Page {page + 1} of {Math.ceil(total / limit)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(Math.ceil(total / limit) - 1, page + 1))}
            disabled={page >= Math.ceil(total / limit) - 1}
            className="border-slate-700 hover:bg-slate-700"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default Gallery;
