/**
 * Media History Page - SmartSpec Pro
 * View and manage media generation tasks
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ChevronLeft,
  Image,
  Video,
  Music,
  Download,
  RefreshCw,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Zap,
  FileImage,
  Play,
  Trash2,
  ImagePlus,
} from 'lucide-react';
import { toast } from 'sonner';

type MediaType = 'image' | 'video' | 'audio';
type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface MediaTask {
  id: string;
  taskId?: string; // External provider task ID (e.g., Kie.ai)
  mediaType: MediaType;
  status: TaskStatus;
  model: string;
  prompt: string;
  resultUrl?: string;
  creditsUsed?: number;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

const statusConfig: Record<TaskStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  processing: { label: 'Processing', color: 'bg-blue-100 text-blue-800', icon: Loader2 },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800', icon: AlertCircle },
};

const mediaTypeConfig: Record<MediaType, { label: string; icon: React.ElementType; color: string }> = {
  image: { label: 'Image', icon: Image, color: 'text-purple-600' },
  video: { label: 'Video', icon: Video, color: 'text-blue-600' },
  audio: { label: 'Audio', icon: Music, color: 'text-green-600' },
};

export default function MediaHistory() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [selectedTask, setSelectedTask] = useState<MediaTask | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isFetchingResult, setIsFetchingResult] = useState(false);

  // Fetch tasks from API
  const {
    data: tasksData,
    isLoading: tasksLoading,
    refetch,
  } = trpc.media.listTasks.useQuery({
    mediaType: mediaTypeFilter !== 'all' ? mediaTypeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    limit: 100,
    offset: 0,
  });

  // Mutation for fetching task result from Kie.ai
  const fetchResultMutation = trpc.media.fetchTaskResult.useMutation({
    onSuccess: (data) => {
      if (data.fetched && data.task) {
        // Update local task state
        setSelectedTask(data.task as MediaTask);
        // Refetch the list to update the table
        refetch();
      }
    },
  });

  // Mutation for deleting a task
  const deleteTaskMutation = trpc.media.deleteTask.useMutation({
    onSuccess: () => {
      // Close dialog if the deleted task was selected
      if (selectedTask) {
        setDetailsOpen(false);
        setSelectedTask(null);
      }
      // Refetch the list to update the table
      refetch();
    },
  });

  // Mutation for importing file from URL to storage
  const importFromUrlMutation = trpc.gallery.importFromUrl.useMutation();

  // Mutation for adding to gallery (admin only)
  const addToGalleryMutation = trpc.gallery.create.useMutation({
    onSuccess: () => {
      toast.success('Added to gallery! View it in the Gallery page.');
    },
    onError: (error) => {
      toast.error(`Failed to add to gallery: ${error.message}`);
    },
  });

  // State for tracking gallery import in progress
  const [importingTaskId, setImportingTaskId] = useState<string | null>(null);

  const handleDeleteTask = async (taskId: string) => {
    if (confirm('Are you sure you want to delete this task?')) {
      await deleteTaskMutation.mutateAsync({ taskId });
    }
  };

  // Handle adding task result to gallery (admin only)
  const handleAddToGallery = async (task: MediaTask) => {
    if (!task.resultUrl) {
      toast.error('No result URL available');
      return;
    }

    setImportingTaskId(task.id);

    try {
      // Determine folder based on media type
      const folder = task.mediaType === 'video' ? 'videos' : 'images';

      // First, import the file from temp URL to permanent storage
      toast.info('Importing file to storage...');
      const importResult = await importFromUrlMutation.mutateAsync({
        url: task.resultUrl,
        folder: folder as 'images' | 'videos' | 'thumbnails' | 'websites',
      });

      // Determine aspect ratio based on media type
      let aspectRatio: '1:1' | '9:16' | '16:9' = '1:1';
      if (task.mediaType === 'video') {
        aspectRatio = '16:9';
      }

      // Create gallery item with permanent URL
      await addToGalleryMutation.mutateAsync({
        type: task.mediaType === 'audio' ? 'video' : task.mediaType, // Map audio to video for gallery
        title: task.prompt.slice(0, 100) || `${task.mediaType} - ${task.model}`,
        description: task.prompt,
        aspectRatio,
        fileUrl: importResult.fileUrl, // Use permanent URL from storage
        fileKey: importResult.fileKey,
        thumbnailUrl: importResult.fileUrl, // Use same URL for thumbnail
        thumbnailKey: importResult.fileKey,
        model: task.model, // AI model used for generation
        isPublished: true, // Published immediately since only admin can add
        isFeatured: false,
      });
    } catch (error) {
      console.error('Failed to add to gallery:', error);
      toast.error(`Failed to add to gallery: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setImportingTaskId(null);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [authLoading, isAuthenticated, setLocation]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const tasks: MediaTask[] = tasksData?.tasks || [];
  const totalTasks = tasksData?.total || 0;

  // Calculate stats
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const pendingCount = tasks.filter((t) => t.status === 'pending' || t.status === 'processing').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;
  const totalCredits = tasks.reduce((sum, t) => sum + (t.creditsUsed || 0), 0);

  const stats = [
    {
      label: 'Total Tasks',
      value: totalTasks.toString(),
      icon: FileImage,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
    },
    {
      label: 'Completed',
      value: completedCount.toString(),
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
    },
    {
      label: 'In Progress',
      value: pendingCount.toString(),
      icon: Clock,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Credits Used',
      value: totalCredits.toString(),
      icon: Zap,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50',
    },
  ];

  // Format date for display
  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  const handleViewDetails = async (task: MediaTask) => {
    setSelectedTask(task);
    setDetailsOpen(true);

    // Auto-fetch result if task has external taskId but no resultUrl
    if (task.taskId && !task.resultUrl && (task.status === 'processing' || task.status === 'pending')) {
      setIsFetchingResult(true);
      try {
        await fetchResultMutation.mutateAsync({ taskId: task.id });
      } catch (error) {
        console.error('Failed to fetch task result:', error);
      } finally {
        setIsFetchingResult(false);
      }
    }
  };

  const handleFetchResult = async () => {
    if (!selectedTask) return;
    setIsFetchingResult(true);
    try {
      await fetchResultMutation.mutateAsync({ taskId: selectedTask.id });
    } catch (error) {
      console.error('Failed to fetch task result:', error);
    } finally {
      setIsFetchingResult(false);
    }
  };

  const handleDownload = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
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
                  <FileImage className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Media History</h1>
                  <p className="text-sm text-gray-500">View your generation tasks</p>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={tasksLoading}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${tasksLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          {stats.map((stat, index) => (
            <div
              key={index}
              className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 p-6 shadow-lg shadow-purple-500/5"
            >
              <div className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center mb-4`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 p-4 mb-6 shadow-lg shadow-purple-500/5"
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Type:</span>
              <Select value={mediaTypeFilter} onValueChange={(v) => setMediaTypeFilter(v as MediaType | 'all')}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="image">
                    <div className="flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      Image
                    </div>
                  </SelectItem>
                  <SelectItem value="video">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      Video
                    </div>
                  </SelectItem>
                  <SelectItem value="audio">
                    <div className="flex items-center gap-2">
                      <Music className="w-4 h-4" />
                      Audio
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Status:</span>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | 'all')}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="ml-auto text-sm text-gray-500">
              Showing {tasks.length} of {totalTasks} tasks
            </div>
          </div>
        </motion.div>

        {/* Tasks Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 overflow-hidden"
        >
          {tasksLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileImage className="w-12 h-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No tasks found</h3>
              <p className="text-sm text-gray-500">
                {mediaTypeFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Generate some images or videos to see them here'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="w-[80px]">Preview</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="max-w-[200px]">Prompt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => {
                  const typeConfig = mediaTypeConfig[task.mediaType];
                  const status = statusConfig[task.status];
                  const StatusIcon = status.icon;
                  const TypeIcon = typeConfig.icon;

                  return (
                    <TableRow key={task.id} className="hover:bg-gray-50/50">
                      <TableCell>
                        {task.status === 'completed' && task.resultUrl ? (
                          task.mediaType === 'image' ? (
                            <img
                              src={task.resultUrl}
                              alt="Preview"
                              className="w-12 h-12 rounded-lg object-cover border cursor-pointer hover:opacity-80"
                              onClick={() => handleViewDetails(task)}
                            />
                          ) : task.mediaType === 'video' ? (
                            <div
                              className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center cursor-pointer hover:bg-blue-200"
                              onClick={() => handleViewDetails(task)}
                            >
                              <Play className="w-5 h-5 text-blue-600" />
                            </div>
                          ) : (
                            <div
                              className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center cursor-pointer hover:bg-green-200"
                              onClick={() => handleViewDetails(task)}
                            >
                              <Music className="w-5 h-5 text-green-600" />
                            </div>
                          )
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                            <TypeIcon className={`w-5 h-5 ${typeConfig.color}`} />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <TypeIcon className={`w-3 h-3 ${typeConfig.color}`} />
                          {typeConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{task.model}</TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="truncate text-sm text-gray-600" title={task.prompt}>
                          {task.prompt}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge className={`gap-1 ${status.color}`}>
                          <StatusIcon className={`w-3 h-3 ${task.status === 'processing' ? 'animate-spin' : ''}`} />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {task.creditsUsed ? (
                          <span className="flex items-center gap-1 text-sm">
                            <Zap className="w-3 h-3 text-yellow-500" />
                            {task.creditsUsed}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {formatDate(task.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(task)}
                            className="h-8 px-2"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {task.status === 'completed' && task.resultUrl && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(task.resultUrl!)}
                                className="h-8 px-2 text-green-600 hover:text-green-700"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                              {/* Add to Gallery button - admin only */}
                              {user?.role === 'admin' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAddToGallery(task)}
                                  disabled={importingTaskId === task.id}
                                  className="h-8 px-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                  title="Add to Gallery"
                                >
                                  {importingTaskId === task.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <ImagePlus className="w-4 h-4" />
                                  )}
                                </Button>
                              )}
                            </>
                          )}
                          {(task.status === 'failed' || task.status === 'cancelled' || task.status === 'processing' || task.status === 'pending') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTask(task.id)}
                              disabled={deleteTaskMutation.isPending}
                              className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete task"
                            >
                              {deleteTaskMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </motion.div>
      </main>

      {/* Task Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTask && (
                <>
                  {(() => {
                    const TypeIcon = mediaTypeConfig[selectedTask.mediaType].icon;
                    return <TypeIcon className={`w-5 h-5 ${mediaTypeConfig[selectedTask.mediaType].color}`} />;
                  })()}
                  {mediaTypeConfig[selectedTask.mediaType].label} Generation Details
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedTask && (
            <div className="space-y-4">
              {/* Loading indicator for auto-fetch */}
              {isFetchingResult && (
                <div className="flex items-center justify-center p-4 bg-blue-50 rounded-lg">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
                  <span className="text-blue-700">Fetching result from Kie.ai...</span>
                </div>
              )}

              {/* Preview */}
              {selectedTask.status === 'completed' && selectedTask.resultUrl && (
                <div className="flex justify-center">
                  {selectedTask.mediaType === 'image' ? (
                    <img
                      src={selectedTask.resultUrl}
                      alt="Generated"
                      className="max-h-[400px] rounded-lg border shadow-lg"
                    />
                  ) : selectedTask.mediaType === 'video' ? (
                    <video
                      src={selectedTask.resultUrl}
                      controls
                      className="max-h-[400px] rounded-lg border shadow-lg"
                    />
                  ) : (
                    <audio src={selectedTask.resultUrl} controls className="w-full" />
                  )}
                </div>
              )}

              {/* Fetch Result Button (for tasks without result) */}
              {!selectedTask.resultUrl && selectedTask.taskId && selectedTask.status !== 'failed' && (
                <div className="flex items-center justify-center p-4 bg-yellow-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
                  <span className="text-yellow-700 mr-4">No result yet.</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFetchResult}
                    disabled={isFetchingResult}
                    className="gap-2"
                  >
                    {isFetchingResult ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Fetch Result
                  </Button>
                </div>
              )}

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="col-span-2">
                  <span className="text-sm text-gray-500">Internal Task ID</span>
                  <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">{selectedTask.id}</p>
                </div>
                {selectedTask.taskId && (
                  <div className="col-span-2">
                    <span className="text-sm text-gray-500">Kie.ai Task ID</span>
                    <p className="font-mono text-xs break-all select-all bg-white p-2 rounded border mt-1">{selectedTask.taskId}</p>
                  </div>
                )}
                <div>
                  <span className="text-sm text-gray-500">Status</span>
                  <Badge className={`mt-1 gap-1 ${statusConfig[selectedTask.status].color}`}>
                    {statusConfig[selectedTask.status].label}
                  </Badge>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Model</span>
                  <p className="font-mono text-sm">{selectedTask.model}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Credits Used</span>
                  <p className="flex items-center gap-1">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    {selectedTask.creditsUsed || 0}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-sm text-gray-500">Prompt</span>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{selectedTask.prompt}</p>
                </div>
                {selectedTask.errorMessage && (
                  <div className="col-span-2">
                    <span className="text-sm text-red-500">Error</span>
                    <p className="text-sm text-red-600 mt-1">{selectedTask.errorMessage}</p>
                  </div>
                )}
                <div>
                  <span className="text-sm text-gray-500">Created</span>
                  <p className="text-sm">{new Date(selectedTask.createdAt).toLocaleString()}</p>
                </div>
                {selectedTask.completedAt && (
                  <div>
                    <span className="text-sm text-gray-500">Completed</span>
                    <p className="text-sm">{new Date(selectedTask.completedAt).toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              {selectedTask.status === 'completed' && selectedTask.resultUrl && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleDownload(selectedTask.resultUrl!)}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                  {/* Add to Gallery button - admin only */}
                  {user?.role === 'admin' && (
                    <Button
                      variant="default"
                      onClick={() => handleAddToGallery(selectedTask)}
                      disabled={importingTaskId === selectedTask.id}
                      className="gap-2 bg-purple-600 hover:bg-purple-700"
                    >
                      {importingTaskId === selectedTask.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ImagePlus className="w-4 h-4" />
                      )}
                      {importingTaskId === selectedTask.id ? 'Importing...' : 'Add to Gallery'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
