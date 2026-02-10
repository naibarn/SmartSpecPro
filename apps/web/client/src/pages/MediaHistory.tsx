/**
 * Media History Page - SmartSpec Pro
 * View and manage media generation tasks
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildTaskLibraryErrorState,
  buildTaskLibraryStateFromAddResult,
  getAddToLibraryErrorMessage,
  getAddToLibrarySuccessMessage,
  getLibraryStatusMeta as getLibraryItemStatusMeta,
  isMediaTaskEligibleForLibraryAdd,
  type TaskLibraryUIState,
} from '@/lib/libraryUi';

type MediaType = 'image' | 'video' | 'audio';
type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface MediaTask {
  id: string;
  taskId?: string; // External provider task ID (e.g., Kie.ai)
  celeryTaskId?: string; // Internal Celery task UUID for tracking/monitoring
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

const fallbackStatusConfig = {
  label: 'Unknown',
  color: 'bg-gray-100 text-gray-800',
  icon: AlertCircle,
};

const fallbackMediaTypeConfig = {
  label: 'Unknown',
  icon: FileImage,
  color: 'text-gray-500',
};

function getStatusMeta(status: string | undefined) {
  return statusConfig[status as TaskStatus] || fallbackStatusConfig;
}

function getMediaTypeMeta(mediaType: string | undefined) {
  return mediaTypeConfig[mediaType as MediaType] || fallbackMediaTypeConfig;
}

export default function MediaHistory() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [selectedTask, setSelectedTask] = useState<MediaTask | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isFetchingResult, setIsFetchingResult] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [taskLibraryState, setTaskLibraryState] = useState<Record<string, TaskLibraryUIState>>({});
  const trpcUtils = trpc.useUtils();

  // Fetch tasks from API - only last 12 days
  const {
    data: tasksData,
    isLoading: tasksLoading,
    refetch,
  } = trpc.media.listTasks.useQuery({
    mediaType: mediaTypeFilter !== 'all' ? mediaTypeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    limit: 100,
    offset: 0,
    daysAgo: 12, // Only show tasks from last 12 days
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
  const addToLibraryMutation = trpc.media.addTaskToLibrary.useMutation();

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

  // Handle checkbox selection
  const handleSelectTask = (taskId: string, checked: boolean) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(taskId);
      } else {
        newSet.delete(taskId);
      }
      return newSet;
    });
  };

  // Handle select all checkbox
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTaskIds(new Set(tasks.map(t => t.id)));
    } else {
      setSelectedTaskIds(new Set());
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    const count = selectedTaskIds.size;
    if (count === 0) return;

    if (confirm(`Are you sure you want to delete ${count} selected task${count > 1 ? 's' : ''}?`)) {
      toast.promise(
        Promise.all(
          Array.from(selectedTaskIds).map(taskId =>
            deleteTaskMutation.mutateAsync({ taskId })
          )
        ),
        {
          loading: `Deleting ${count} task${count > 1 ? 's' : ''}...`,
          success: () => {
            setSelectedTaskIds(new Set());
            return `Successfully deleted ${count} task${count > 1 ? 's' : ''}`;
          },
          error: 'Failed to delete some tasks',
        }
      );
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

  // Check if all visible tasks are selected
  const allSelected = tasks.length > 0 && tasks.every(task => selectedTaskIds.has(task.id));
  const someSelected = selectedTaskIds.size > 0 && !allSelected;

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

  const selectedTaskLibraryState = selectedTask ? taskLibraryState[selectedTask.id] : undefined;
  const selectedTaskLibraryMeta = getLibraryItemStatusMeta(selectedTaskLibraryState?.status);

  // Format date for display - show both relative and absolute time
  // Automatically converts UTC to local timezone
  // Safe date parsing helper
  const safeParseDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      // Check if date is valid
      if (isNaN(d.getTime())) return null;
      return d;
    } catch {
      return null;
    }
  };

  const formatDate = (date: string) => {
    const d = safeParseDate(date);
    if (!d) {
      return {
        relative: 'Unknown',
        absolute: 'Invalid date',
      };
    }

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let relative = '';
    if (diffMins < 1) relative = 'Just now';
    else if (diffMins < 60) relative = `${diffMins}m ago`;
    else if (diffHours < 24) relative = `${diffHours}h ago`;
    else if (diffDays < 7) relative = `${diffDays}d ago`;
    else relative = d.toLocaleDateString();

    // Return both for display (relative shown, absolute in title)
    // toLocaleString() automatically uses browser's local timezone
    return {
      relative,
      absolute: d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false, // Use 24-hour format
      }),
    };
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
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const refreshLibraryStatus = useCallback(
    async (taskId: string, itemId: number) => {
      try {
        const item = await trpcUtils.library.getItem.fetch({ id: itemId });
        setTaskLibraryState((prev) => ({
          ...prev,
          [taskId]: {
            ...(prev[taskId] || { action: 'added' as const }),
            action: 'added',
            itemId,
            status: item.status,
          },
        }));
      } catch {
        // Keep current optimistic state; retry in next interval.
      }
    },
    [trpcUtils.library.getItem],
  );

  const handleAddToLibrary = async (task: MediaTask) => {
    if (!isMediaTaskEligibleForLibraryAdd(task)) {
      toast.error('Only completed tasks with results can be added to library.');
      return;
    }

    setTaskLibraryState((prev) => ({
      ...prev,
      [task.id]: {
        ...(prev[task.id] || { action: 'idle' as const }),
        action: 'adding',
        status: 'indexing',
      },
    }));

    try {
      const result = await addToLibraryMutation.mutateAsync({ taskId: task.id });
      const nextState = buildTaskLibraryStateFromAddResult(result);
      setTaskLibraryState((prev) => ({
        ...prev,
        [task.id]: nextState,
      }));
      toast.success(getAddToLibrarySuccessMessage(result));
      await refetch();
      await refreshLibraryStatus(task.id, result.itemId);
    } catch (error) {
      const errorState = buildTaskLibraryErrorState(error);
      setTaskLibraryState((prev) => ({
        ...prev,
        [task.id]: errorState,
      }));
      toast.error(getAddToLibraryErrorMessage(error));
    }
  };

  // Background fallback polling:
  // if provider callback/worker update is delayed, periodically refresh one pending task.
  useEffect(() => {
    const hasPendingTasks = tasks.some(
      (task) =>
        !!task.taskId &&
        !task.resultUrl &&
        (task.status === 'processing' || task.status === 'pending')
    );

    if (!hasPendingTasks) return;

    const tick = async () => {
      if (document.visibilityState !== 'visible' || fetchResultMutation.isPending) return;
      const nextTask = tasks.find(
        (task) =>
          !!task.taskId &&
          !task.resultUrl &&
          (task.status === 'processing' || task.status === 'pending')
      );
      if (!nextTask) return;
      try {
        await fetchResultMutation.mutateAsync({ taskId: nextTask.id });
      } catch (error) {
        console.error('Background fetch task result failed:', error);
      }
    };

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [tasks, fetchResultMutation.isPending, fetchResultMutation.mutateAsync]);

  useEffect(() => {
    const tracking = Object.entries(taskLibraryState).filter(
      ([, state]) => state.action === 'added' && state.itemId && state.status === 'indexing',
    );
    if (tracking.length === 0) return;

    const timer = window.setInterval(() => {
      tracking.forEach(([taskId, state]) => {
        if (state.itemId) {
          void refreshLibraryStatus(taskId, state.itemId);
        }
      });
    }, 15000);

    return () => window.clearInterval(timer);
  }, [taskLibraryState, refreshLibraryStatus]);

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

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          {stats.map((stat, index) => {
            const StatIcon = stat.icon || FileImage;
            return (
            <div
              key={index}
              className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 p-6 shadow-lg shadow-purple-500/5"
            >
              <div className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center mb-4`}>
                <StatIcon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
            );
          })}
        </motion.div>

        {/* Data Retention Notice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3"
        >
          <Info className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Data Retention Notice</p>
            <p className="mt-1">
              This page shows generation history from the <strong>last 12 days</strong> only.
              Items older than <strong>12 days</strong> are automatically deleted to manage storage.
              Please download any important media before it expires.
            </p>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
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

            <div className="ml-auto flex items-center gap-4">
              {selectedTaskIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={deleteTaskMutation.isPending}
                  className="gap-2"
                >
                  {deleteTaskMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete {selectedTaskIds.size} selected
                </Button>
              )}
              <div className="text-sm text-gray-500">
                Showing {tasks.length} of {totalTasks} tasks
              </div>
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
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all tasks"
                      className={someSelected ? 'data-[state=checked]:bg-purple-500' : ''}
                    />
                  </TableHead>
                  <TableHead className="w-[80px]">Preview</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="max-w-[200px]">Prompt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>External ID</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Library</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => {
                  const typeConfig = getMediaTypeMeta(task.mediaType);
                  const status = getStatusMeta(task.status);
                  const StatusIcon = status?.icon || AlertCircle;
                  const TypeIcon = typeConfig?.icon || FileImage;
                  const canAddToLibrary = isMediaTaskEligibleForLibraryAdd(task);
                  const libraryState = taskLibraryState[task.id];
                  const libraryStatusMeta = getLibraryItemStatusMeta(libraryState?.status);

                  return (
                    <TableRow key={task.id} className="hover:bg-gray-50/50">
                      <TableCell>
                        <Checkbox
                          checked={selectedTaskIds.has(task.id)}
                          onCheckedChange={(checked) => handleSelectTask(task.id, checked === true)}
                          aria-label={`Select task ${task.id}`}
                        />
                      </TableCell>
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
                        {task.taskId ? (
                          <span className="font-mono text-xs text-gray-600" title={task.taskId}>
                            {task.taskId.substring(0, 8)}...
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
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
                      <TableCell>
                        {canAddToLibrary ? (
                          libraryState?.action === 'adding' ? (
                            <Badge className="gap-1 bg-amber-100 text-amber-800">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Adding
                            </Badge>
                          ) : libraryState?.action === 'error' ? (
                            <Badge className="gap-1 bg-red-100 text-red-700">
                              <AlertCircle className="w-3 h-3" />
                              Failed
                            </Badge>
                          ) : (
                            <Badge className={libraryStatusMeta.className}>
                              {libraryStatusMeta.label}
                            </Badge>
                          )
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500" title={formatDate(task.createdAt).relative}>
                        {(() => {
                          const date = safeParseDate(task.createdAt);
                          if (!date) {
                            return <span className="text-gray-400">Invalid date</span>;
                          }
                          return (
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {date.toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </span>
                              <span className="text-xs text-gray-400">
                                {date.toLocaleTimeString(undefined, {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false
                                })}
                              </span>
                            </div>
                          );
                        })()}
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
                                onClick={() => handleAddToLibrary(task)}
                                disabled={libraryState?.action === 'adding'}
                                className={`h-8 px-2 ${libraryState?.action === 'added' ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50' : 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50'}`}
                                title={libraryStatusMeta.retryable ? 'Retry add to library' : 'Add to library'}
                              >
                                {libraryState?.action === 'adding' ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : libraryState?.action === 'added' ? (
                                  <CheckCircle className="w-4 h-4" />
                                ) : libraryState?.action === 'error' ? (
                                  <AlertCircle className="w-4 h-4" />
                                ) : (
                                  <ImagePlus className="w-4 h-4" />
                                )}
                              </Button>
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
                    const typeMeta = getMediaTypeMeta(selectedTask.mediaType);
                    const TypeIcon = typeMeta?.icon || FileImage;
                    return <TypeIcon className={`w-5 h-5 ${typeMeta.color}`} />;
                  })()}
                  {getMediaTypeMeta(selectedTask.mediaType).label} Generation Details
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
                  <Badge className={`mt-1 gap-1 ${getStatusMeta(selectedTask.status).color}`}>
                    {getStatusMeta(selectedTask.status).label}
                  </Badge>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Library</span>
                  {isMediaTaskEligibleForLibraryAdd(selectedTask) ? (
                    selectedTaskLibraryState?.action === 'adding' ? (
                      <Badge className="mt-1 gap-1 bg-amber-100 text-amber-800">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Adding
                      </Badge>
                    ) : selectedTaskLibraryState?.action === 'error' ? (
                      <Badge className="mt-1 gap-1 bg-red-100 text-red-700">
                        <AlertCircle className="w-3 h-3" />
                        Failed
                      </Badge>
                    ) : (
                      <Badge className={`mt-1 ${selectedTaskLibraryMeta.className}`}>
                        {selectedTaskLibraryMeta.label}
                      </Badge>
                    )
                  ) : (
                    <p className="text-sm text-gray-400">Not eligible</p>
                  )}
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
                  <p className="text-sm font-medium">
                    {new Date(selectedTask.createdAt).toLocaleString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    })}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(selectedTask.createdAt).relative}</p>
                </div>
                {selectedTask.completedAt && (() => {
                  const completedDate = safeParseDate(selectedTask.completedAt);
                  if (!completedDate) return null;
                  return (
                    <div>
                      <span className="text-sm text-gray-500">Completed</span>
                      <p className="text-sm font-medium">
                        {completedDate.toLocaleString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false,
                        })}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(selectedTask.completedAt).relative}</p>
                    </div>
                  );
                })()}
              </div>

              {/* Actions */}
              {selectedTask.status === 'completed' && selectedTask.resultUrl && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleAddToLibrary(selectedTask)}
                    disabled={selectedTaskLibraryState?.action === 'adding'}
                    className="gap-2"
                  >
                    {selectedTaskLibraryState?.action === 'adding' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : selectedTaskLibraryState?.action === 'added' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <ImagePlus className="w-4 h-4" />
                    )}
                    {selectedTaskLibraryState?.action === 'added' ? 'In Library' : 'Add to Library'}
                  </Button>
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
