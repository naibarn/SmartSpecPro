/**
 * Workflows Page - Agentic AI Workflow Management
 * List, create, and manage workflows
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { JobCard } from '@/components/chat/JobCard';
import {
  GitBranch,
  Plus,
  Search,
  Filter,
  Play,
  Pause,
  Trash2,
  Edit,
  Copy,
  MoreVertical,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Home,
  LayoutGrid,
} from 'lucide-react';

type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface Workflow {
  execution_id: string;
  workflow_name: string;
  workflow_id?: string;
  status: WorkflowStatus;
  created_at: string;
  completed_at?: string;
}

export default function Workflows() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | 'all'>('all');

  // Fetch workflows
  const { data: workflowsData, refetch } = trpc.workflow.list.useQuery(
    statusFilter === 'all'
      ? { limit: 100, offset: 0 }
      : { limit: 100, offset: 0, status: statusFilter }
  );

  const workflows = workflowsData?.workflows || [];

  // Filter by search query
  const filteredWorkflows = workflows.filter((workflow: Workflow) =>
    workflow.workflow_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusIcon = (status: WorkflowStatus) => {
    switch (status) {
      case 'running':
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: WorkflowStatus) => {
    const labels: Record<WorkflowStatus, string> = {
      pending: 'Pending',
      running: 'Running',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };
    return labels[status] || status;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
      {/* Header - Sticky with Backdrop Blur */}
      <header className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/dashboard')}
              >
                <Home className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                  <GitBranch className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">Workflows</h1>
                  <p className="text-xs text-muted-foreground">Create and manage automated workflows</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation('/workflows/gallery')}
              >
                <LayoutGrid className="h-4 w-4 mr-1" />
                Gallery
              </Button>
              <Button
                size="sm"
                onClick={() => setLocation('/workflows/editor')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Workflow
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">

        {/* Search and Filter Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search workflows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as WorkflowStatus | 'all')}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Workflows Grid */}
        {filteredWorkflows.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {filteredWorkflows.map((workflow: Workflow) => (
              <div
                key={workflow.execution_id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow"
              >
                <JobCard
                  executionId={workflow.execution_id}
                  workflowName={workflow.workflow_name}
                  initialStatus={workflow.status}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-12 text-center">
            <GitBranch className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {searchQuery || statusFilter !== 'all'
                ? 'No Workflows Found'
                : 'No Workflows Yet'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Create your first workflow to automate tasks'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button
                onClick={() => setLocation('/workflows/editor')}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white mx-auto"
              >
                <Plus className="h-5 w-5" />
                New Workflow
              </Button>
            )}
          </div>
        )}

        {/* Example Workflows Section */}
        {workflows.length === 0 && !searchQuery && statusFilter === 'all' && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Example Workflow Templates
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Social Media Post Creator Template */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow border-2 border-blue-100 dark:border-blue-900">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                      <GitBranch className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Social Media Post Creator
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Generate social media post with image
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>Input → LLM (Generate Caption) → Generate Image → Output</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                    <span>4 nodes • Linear workflow</span>
                  </div>
                </div>
                <Button
                  onClick={() => setLocation('/workflows/editor?template=social-media-post')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Use This Template
                </Button>
              </div>

              {/* Content Summarizer Template */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow border-2 border-purple-100 dark:border-purple-900">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <GitBranch className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Content Summarizer
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Summarize long content with conditional formatting
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    <span>Input → LLM (Summarize) → Conditional → Format → Output</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                    <span>5 nodes • Conditional logic</span>
                  </div>
                </div>
                <Button
                  onClick={() => setLocation('/workflows/editor?template=content-summarizer')}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Use This Template
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Total</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {workflows.length}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Running</div>
            <div className="text-2xl font-bold text-blue-600">
              {workflows.filter((w: Workflow) => w.status === 'running').length}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Completed</div>
            <div className="text-2xl font-bold text-green-600">
              {workflows.filter((w: Workflow) => w.status === 'completed').length}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">Failed</div>
            <div className="text-2xl font-bold text-red-600">
              {workflows.filter((w: Workflow) => w.status === 'failed').length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
