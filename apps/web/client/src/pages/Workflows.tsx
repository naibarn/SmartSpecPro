/**
 * Workflows Page - Agentic AI Workflow Management
 * List, create, and manage workflows
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { JobCard } from '@/components/chat/JobCard';
import { GalleryTemplateCard } from '@/components/workflow/GalleryTemplateCard';
import { GalleryDetailDrawer } from '@/components/workflow/GalleryDetailDrawer';
import {
  GitBranch,
  Plus,
  Search,
  ChevronLeft,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  LayoutGrid,
  ArrowRight,
  Edit,
  FileCode,
  Layers,
  Play,
} from 'lucide-react';

type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface Execution {
  execution_id: string;
  workflow_name: string;
  workflow_id?: string;
  status: WorkflowStatus;
  created_at: string;
  completed_at?: string;
}

interface SavedWorkflow {
  id: number;
  name: string;
  description: string | null;
  status: string;
  workflowJson: { nodes?: any[]; edges?: any[] } | null;
  lastCompiledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; label: string; color: string; bg: string }> = {
  draft: { icon: Edit, label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  compiled: { icon: CheckCircle, label: 'Compiled', color: 'text-blue-600', bg: 'bg-blue-100' },
  running: { icon: Play, label: 'Running', color: 'text-amber-600', bg: 'bg-amber-100' },
  completed: { icon: CheckCircle, label: 'Completed', color: 'text-green-600', bg: 'bg-green-100' },
  failed: { icon: XCircle, label: 'Failed', color: 'text-red-600', bg: 'bg-red-100' },
};

export default function Workflows() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  // Fetch saved workflows (user's drafts)
  const { data: savedWorkflows } = trpc.workflow.listSaved.useQuery({});

  // Fetch recent executions
  const { data: executionsData } = trpc.workflow.list.useQuery({
    limit: 20,
    offset: 0,
  });

  // Fetch popular templates
  const { data: templatesData } = trpc.workflow.listTemplates.useQuery({
    limit: 6,
    offset: 0,
  });

  const executions = executionsData?.workflows || [];

  // Filter saved workflows by search query
  const filteredSaved = (savedWorkflows || []).filter((w: SavedWorkflow) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/dashboard')}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
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
      <main className="px-4 sm:px-6 lg:px-8 py-6">

        {/* My Workflows Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileCode className="h-5 w-5 text-blue-600" />
              My Workflows
            </h2>
            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {filteredSaved.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredSaved.map((wf: SavedWorkflow) => {
                const cfg = STATUS_CONFIG[wf.status] || STATUS_CONFIG.draft;
                const StatusIcon = cfg.icon;
                const nodeCount = wf.workflowJson?.nodes?.length ?? 0;

                return (
                  <article
                    key={wf.id}
                    role="button"
                    tabIndex={0}
                    className="group relative flex flex-col rounded-xl border bg-white/70 backdrop-blur p-4 cursor-pointer transition-all hover:shadow-md hover:border-blue-200 focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => setLocation(`/workflows/editor/${wf.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setLocation(`/workflows/editor/${wf.id}`);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-sm line-clamp-1 flex-1 pr-2">
                        {wf.name}
                      </h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </div>

                    {wf.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {wf.description}
                      </p>
                    )}

                    <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {nodeCount} nodes
                      </span>
                      <span>{formatDate(wf.updatedAt)}</span>
                    </div>
                  </article>
                );
              })}

              {/* New Workflow Card */}
              <article
                role="button"
                tabIndex={0}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white/50 p-4 cursor-pointer transition-all hover:border-blue-400 hover:bg-blue-50/50 focus-visible:ring-2 focus-visible:ring-primary min-h-[120px]"
                onClick={() => setLocation('/workflows/editor')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setLocation('/workflows/editor');
                  }
                }}
              >
                <Plus className="h-8 w-8 text-gray-400 mb-2" />
                <span className="text-sm font-medium text-gray-500">New Workflow</span>
              </article>
            </div>
          ) : (
            <div className="bg-white/70 backdrop-blur rounded-xl border p-12 text-center">
              <GitBranch className="h-14 w-14 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-1">
                {searchQuery ? 'No Workflows Found' : 'No Workflows Yet'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery
                  ? 'Try adjusting your search'
                  : 'Create your first workflow or start from a template'}
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button
                  onClick={() => setLocation('/workflows/editor')}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New Workflow
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation('/workflows/gallery')}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  Browse Templates
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Recent Executions */}
        {executions.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-purple-600" />
              Recent Executions
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {executions.slice(0, 5).map((exec: Execution) => (
                <div
                  key={exec.execution_id}
                  className="bg-white/70 backdrop-blur rounded-xl border hover:shadow-md transition-shadow"
                >
                  <JobCard
                    executionId={exec.execution_id}
                    workflowName={exec.workflow_name}
                    initialStatus={exec.status}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Popular Templates */}
        {templatesData && templatesData.items.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-green-600" />
                Popular Templates
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/workflows/gallery')}
                className="text-blue-600 hover:text-blue-700"
              >
                Browse All
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {templatesData.items.map((t: any) => (
                <GalleryTemplateCard
                  key={t.id}
                  template={t}
                  onSelect={setSelectedTemplateId}
                />
              ))}
            </div>
          </section>
        )}

        {/* Template Detail Drawer */}
        <GalleryDetailDrawer
          open={selectedTemplateId !== null}
          templateId={selectedTemplateId}
          onClose={() => setSelectedTemplateId(null)}
        />
      </main>
    </div>
  );
}
