import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Loader2, Download, RefreshCw, Image, Video, Music, Filter, X } from 'lucide-react';
import { useToast } from '../common/Toast';
import { listTasks, downloadMedia, cancelTask, TaskStatus } from '../../services/mediaService';

interface MediaGalleryPanelProps {}

export const MediaGalleryPanel: React.FC<MediaGalleryPanelProps> = () => {
  const toast = useToast();
  const [tasks, setTasks] = useState<TaskStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedMedia, setSelectedMedia] = useState<TaskStatus | null>(null);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [offset] = useState(0);

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const mediaType = selectedFilter === 'all' ? undefined : selectedFilter;
      const response = await listTasks(mediaType, selectedStatus, limit, offset);
      setTasks(response.tasks);
      setTotal(response.total);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load gallery';
      toast.error("Error", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [selectedFilter, selectedStatus]);

  const handleDownload = async (task: TaskStatus) => {
    try {
      const blob = await downloadMedia(task.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${task.media_type}_${task.id}.${task.media_type === 'audio' ? 'mp3' : task.media_type === 'video' ? 'mp4' : 'png'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("Success", "Media downloaded successfully");
    } catch (error) {
      toast.error("Error", "Failed to download media");
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      await cancelTask(taskId);
      toast.success("Success", "Task cancelled");
      fetchTasks();
    } catch (error) {
      toast.error("Error", "Failed to cancel task");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-500';
      case 'processing':
        return 'text-blue-500';
      case 'pending':
        return 'text-yellow-500';
      case 'failed':
        return 'text-red-500';
      case 'cancelled':
        return 'text-gray-500';
      default:
        return 'text-gray-500';
    }
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <Image className="w-5 h-5" />;
      case 'video':
        return <Video className="w-5 h-5" />;
      case 'audio':
        return <Music className="w-5 h-5" />;
      default:
        return <Image className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800/50 border-slate-700 text-white">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Media Gallery
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTasks}
              disabled={isLoading}
              className="border-slate-700 hover:bg-slate-700"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFilter('all')}
              className={selectedFilter === 'all' ? 'bg-blue-600' : 'border-slate-700'}
            >
              All
            </Button>
            <Button
              variant={selectedFilter === 'image' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFilter('image')}
              className={selectedFilter === 'image' ? 'bg-blue-600' : 'border-slate-700'}
            >
              <Image className="w-4 h-4 mr-2" />
              Images
            </Button>
            <Button
              variant={selectedFilter === 'video' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFilter('video')}
              className={selectedFilter === 'video' ? 'bg-blue-600' : 'border-slate-700'}
            >
              <Video className="w-4 h-4 mr-2" />
              Videos
            </Button>
            <Button
              variant={selectedFilter === 'audio' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedFilter('audio')}
              className={selectedFilter === 'audio' ? 'bg-blue-600' : 'border-slate-700'}
            >
              <Music className="w-4 h-4 mr-2" />
              Audio
            </Button>
          </div>

          {/* Status filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status Filter</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="processing">Processing</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Gallery Grid */}
          <div className="space-y-2">
            <div className="text-sm text-slate-400">
              Showing {tasks.length} of {total} items
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                No media found. Generate some content to see it here.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto">
                {tasks.map((task) => (
                  <Card
                    key={task.id}
                    className="bg-slate-900 border-slate-700 hover:border-blue-500 transition-colors cursor-pointer"
                    onClick={() => task.status === 'completed' && setSelectedMedia(task)}
                  >
                    <CardContent className="p-4 space-y-3">
                      {/* Thumbnail */}
                      <div className="relative aspect-video bg-slate-800 rounded-lg overflow-hidden">
                        {task.status === 'completed' && task.result_url ? (
                          task.media_type === 'image' ? (
                            <img
                              src={task.result_url}
                              alt={task.prompt}
                              className="w-full h-full object-cover"
                            />
                          ) : task.media_type === 'video' ? (
                            <video
                              src={task.result_url}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music className="w-12 h-12 text-slate-600" />
                            </div>
                          )
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {task.status === 'processing' || task.status === 'pending' ? (
                              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                            ) : (
                              getMediaIcon(task.media_type)
                            )}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {getMediaIcon(task.media_type)}
                            <span className="text-xs text-slate-400 uppercase">{task.media_type}</span>
                          </div>
                          <span className={`text-xs font-medium ${getStatusColor(task.status)}`}>
                            {task.status}
                          </span>
                        </div>

                        <p className="text-sm text-white line-clamp-2" title={task.prompt}>
                          {task.prompt}
                        </p>

                        <div className="text-xs text-slate-500">
                          Model: {task.model}
                        </div>

                        {task.credits_used && (
                          <div className="text-xs text-slate-500">
                            Credits: {task.credits_used}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          {task.status === 'completed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(task);
                              }}
                              className="flex-1 border-slate-700 hover:bg-slate-700"
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Download
                            </Button>
                          )}
                          {(task.status === 'pending' || task.status === 'processing') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancel(task.id);
                              }}
                              className="flex-1 border-red-700 text-red-500 hover:bg-red-900/20"
                            >
                              <X className="w-3 h-3 mr-1" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Media Preview Modal */}
      {selectedMedia && selectedMedia.status === 'completed' && selectedMedia.result_url && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedMedia(null)}
        >
          <div
            className="max-w-4xl max-h-[90vh] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedMedia(null)}
              className="absolute -top-12 right-0 text-white hover:bg-white/10"
            >
              <X className="w-6 h-6" />
            </Button>

            <div className="bg-slate-900 rounded-lg overflow-hidden">
              {selectedMedia.media_type === 'image' ? (
                <img
                  src={selectedMedia.result_url}
                  alt={selectedMedia.prompt}
                  className="w-full h-auto max-h-[80vh] object-contain"
                />
              ) : selectedMedia.media_type === 'video' ? (
                <video
                  src={selectedMedia.result_url}
                  controls
                  autoPlay
                  className="w-full h-auto max-h-[80vh]"
                />
              ) : (
                <div className="p-8 flex flex-col items-center gap-4">
                  <Music className="w-16 h-16 text-slate-400" />
                  <audio src={selectedMedia.result_url} controls className="w-full" />
                </div>
              )}

              <div className="p-4 space-y-2">
                <p className="text-white text-sm">{selectedMedia.prompt}</p>
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span>Model: {selectedMedia.model}</span>
                  {selectedMedia.credits_used && <span>Credits: {selectedMedia.credits_used}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaGalleryPanel;
