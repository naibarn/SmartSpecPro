// Job Board Component
// Kanban-style board for job management

import { useState } from 'react';
import { 
  useJobs, 
  Job, 
  JobStatus, 
  getStatusColor, 
  getStatusIcon,
  getPriorityColor,
} from '../../services/jobService';

interface JobBoardProps {
  className?: string;
}

const BOARD_COLUMNS: { status: JobStatus; title: string }[] = [
  { status: 'Draft', title: 'Draft' },
  { status: 'Ready', title: 'Ready' },
  { status: 'InProgress', title: 'In Progress' },
  { status: 'Review', title: 'Review' },
  { status: 'Completed', title: 'Completed' },
];

export function JobBoard({ className = '' }: JobBoardProps) {
  const { jobs, selectJob, selectedJob } = useJobs();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const getJobsByStatus = (status: JobStatus) => {
    return jobs.filter(j => j.status === status);
  };

  return (
    <div className={`flex flex-col h-full bg-gray-100 dark:bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Job Board</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <span>+</span>
          New Job
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 flex gap-4 p-6 overflow-x-auto">
        {BOARD_COLUMNS.map((column) => (
          <BoardColumn
            key={column.status}
            title={column.title}
            status={column.status}
            jobs={getJobsByStatus(column.status)}
            onJobClick={(job) => selectJob(job.id)}
            selectedJobId={selectedJob?.id}
          />
        ))}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateJobModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

// Board Column Component
function BoardColumn({
  title,
  status,
  jobs,
  onJobClick,
  selectedJobId,
}: {
  title: string;
  status: JobStatus;
  jobs: Job[];
  onJobClick: (job: Job) => void;
  selectedJobId?: string;
}) {
  const color = getStatusColor(status);
  const icon = getStatusIcon(status);

  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-gray-200 dark:bg-gray-800 rounded-lg">
      {/* Column Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-300 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="font-semibold text-gray-900 dark:text-white">{title}</span>
          <span className="px-2 py-0.5 text-xs bg-gray-300 dark:bg-gray-700 rounded-full">
            {jobs.length}
          </span>
        </div>
      </div>

      {/* Jobs */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onClick={() => onJobClick(job)}
            isSelected={job.id === selectedJobId}
          />
        ))}
        {jobs.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">
            No jobs
          </div>
        )}
      </div>
    </div>
  );
}

// Job Card Component
function JobCard({
  job,
  onClick,
  isSelected,
}: {
  job: Job;
  onClick: () => void;
  isSelected: boolean;
}) {
  const priorityColor = getPriorityColor(job.priority);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 bg-white dark:bg-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow ${
        isSelected ? 'ring-2 ring-blue-500' : ''
      }`}
    >
      {/* Priority indicator */}
      <div className={`w-full h-1 -mt-3 -mx-3 mb-2 rounded-t-lg bg-${priorityColor}-500`} />
      
      {/* Title */}
      <h4 className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2">
        {job.title}
      </h4>

      {/* Tags */}
      {job.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {job.tags.slice(0, 3).map((tag, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-600 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Progress */}
      {job.tasks.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>{job.progress_percent}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${job.progress_percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
        <span>{job.tasks.length} tasks</span>
        {job.branch_name && (
          <span className="flex items-center gap-1">
            <span>🌿</span>
            <span className="truncate max-w-20">{job.branch_name.split('/').pop()}</span>
          </span>
        )}
      </div>
    </button>
  );
}

// Create Job Modal Component
function CreateJobModal({ onClose }: { onClose: () => void }) {
  const { createNewJob } = useJobs();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [createBranch, setCreateBranch] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await createNewJob({
        title: title.trim(),
        description: description.trim(),
        priority,
        create_branch: createBranch,
      });
      onClose();
    } catch (error) {
      console.error('Failed to create job:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <form onSubmit={handleSubmit}>
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create New Job</h3>
          </div>

          <div className="p-4 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Implement user authentication"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the job..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Priority
              </label>
              <div className="flex gap-2">
                {(['Low', 'Medium', 'High', 'Critical'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      priority === p
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Create Branch */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="createBranch"
                checked={createBranch}
                onChange={(e) => setCreateBranch(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <label htmlFor="createBranch" className="text-sm text-gray-700 dark:text-gray-300">
                Create Git branch for this job
              </label>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-md"
            >
              {isSubmitting ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default JobBoard;
