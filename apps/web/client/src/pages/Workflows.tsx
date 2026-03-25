/**
 * Workflows Page - Agentic AI Workflow Management
 * List, create, and manage workflows
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { HelpButton } from '@/components/help';
import { JobCard } from '@/components/chat/JobCard';
import { GalleryTemplateCard } from '@/components/workflow/GalleryTemplateCard';
import { GalleryDetailDrawer } from '@/components/workflow/GalleryDetailDrawer';
import {
  DashboardSectionHeader,
  DashboardSurface,
} from '@/components/dashboard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
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
  Layers,
  Play,
  Globe,
  Loader2,
  Send,
  AlertTriangle,
  X,
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
  draft: { icon: Edit, label: 'workflows.status.draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  compiled: { icon: CheckCircle, label: 'workflows.status.compiled', color: 'text-blue-600', bg: 'bg-blue-100' },
  running: { icon: Play, label: 'workflows.status.running', color: 'text-amber-600', bg: 'bg-amber-100' },
  completed: { icon: CheckCircle, label: 'workflows.status.completed', color: 'text-green-600', bg: 'bg-green-100' },
  failed: { icon: XCircle, label: 'workflows.status.failed', color: 'text-red-600', bg: 'bg-red-100' },
};

export default function Workflows() {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [publishTarget, setPublishTarget] = useState<SavedWorkflow | null>(null);

  const utils = trpc.useUtils();

  const requestPublishMut = trpc.workflow.requestPublishTemplate.useMutation({
    onSuccess: () => {
      toast.success(t('workflows.toast.submitted'));
      setPublishTarget(null);
      utils.workflow.getMyTemplateSubmissions.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const cancelPublishMut = trpc.workflow.cancelPublishRequest.useMutation({
    onSuccess: () => {
      toast.success(t('workflows.toast.cancelled'));
      utils.workflow.getMyTemplateSubmissions.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Fetch saved workflows (user's drafts)
  const { data: savedWorkflows } = trpc.workflow.listSaved.useQuery({});

  // Fetch user's template submissions (to show status on cards)
  const { data: mySubmissions } = trpc.workflow.getMyTemplateSubmissions.useQuery();

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

  // Build template status lookup by name (matches requestPublishTemplate upsert logic)
  const templateStatusMap = new Map<string, { id: number; status: string; rejectionReason: string | null }>();
  for (const sub of mySubmissions ?? []) {
    // Keep the most recent submission per name
    if (!templateStatusMap.has(sub.name)) {
      templateStatusMap.set(sub.name, { id: sub.id, status: sub.status, rejectionReason: sub.rejectionReason });
    }
  }

  // Filter saved workflows by search query
  const filteredSaved = (savedWorkflows || []).filter((w: SavedWorkflow) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('workflows.time.justNow');
    if (mins < 60) return t('workflows.time.minutesAgo', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('workflows.time.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t('workflows.time.daysAgo', { count: days });
    return d.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
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
                {t('common.back')}
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <GitBranch className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">{t('workflows.title')}</h1>
                  <p className="text-xs text-muted-foreground">{t('workflows.description')}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <HelpButton page="/workflows" variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation('/workflows/gallery')}
              >
                <LayoutGrid className="h-4 w-4 mr-1" />
                {t('workflows.gallery')}
              </Button>
              <Button
                size="sm"
                onClick={() => setLocation('/workflows/editor')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t('workflows.newWorkflow')}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">

        {/* My Workflows Section */}
        <section className="mb-8">
          <DashboardSectionHeader
            eyebrow={t('workflows.library.eyebrow')}
            title={t('workflows.library.title')}
            description={t('workflows.library.description')}
            trailing={(
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t('common.search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
          />

          {filteredSaved.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredSaved.map((wf: SavedWorkflow) => {
                const cfg = STATUS_CONFIG[wf.status] || STATUS_CONFIG.draft;
                const StatusIcon = cfg.icon;
                const nodeCount = wf.workflowJson?.nodes?.length ?? 0;
                const tplStatus = templateStatusMap.get(wf.name);

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
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Template publish status badge */}
                        {tplStatus?.status === 'pending_review' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                            <Clock className="h-2.5 w-2.5" />
                            {t('workflows.status.pending')}
                          </span>
                        )}
                        {tplStatus?.status === 'published' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                            <Globe className="h-2.5 w-2.5" />
                            {t('workflows.status.inGallery')}
                          </span>
                        )}
                        {tplStatus?.status === 'rejected' && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700"
                            title={tplStatus.rejectionReason ? t('workflows.status.rejectedWithReason', { reason: tplStatus.rejectionReason }) : t('workflows.status.rejected')}
                          >
                            <XCircle className="h-2.5 w-2.5" />
                            {t('workflows.status.rejected')}
                          </span>
                        )}
                        {/* Workflow build status */}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {t(cfg.label)}
                        </span>
                      </div>
                    </div>

                    {/* Rejection reason banner */}
                    {tplStatus?.status === 'rejected' && tplStatus.rejectionReason && (
                      <div className="flex items-start gap-1.5 mb-2 p-2 rounded-md bg-red-50 border border-red-200">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-red-700 line-clamp-2">{tplStatus.rejectionReason}</p>
                      </div>
                    )}

                    {wf.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                        {wf.description}
                      </p>
                    )}

                    <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {t('workflows.nodesCount', { count: nodeCount })}
                      </span>
                      <div className="flex items-center gap-2">
                        {/* Pending → cancel button */}
                        {tplStatus?.status === 'pending_review' && (
                          <button
                            title={t('workflows.publish.cancel')}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 text-red-500"
                            disabled={cancelPublishMut.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelPublishMut.mutate({ templateId: tplStatus.id });
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {/* No pending template + has nodes → publish button */}
                        {nodeCount > 0 && tplStatus?.status !== 'pending_review' && tplStatus?.status !== 'published' && (
                          <button
                            title={tplStatus?.status === 'rejected' ? t('workflows.publish.resubmit') : t('workflows.publish.toGallery')}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-blue-100 text-blue-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPublishTarget(wf);
                            }}
                          >
                            <Globe className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <span>{formatDate(wf.updatedAt)}</span>
                      </div>
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
                <span className="text-sm font-medium text-gray-500">{t('workflows.newWorkflow')}</span>
              </article>
            </div>
          ) : (
            <div className="bg-white/70 backdrop-blur rounded-xl border p-12 text-center">
              <GitBranch className="h-14 w-14 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-1">
                {searchQuery ? t('workflows.empty.filtered') : t('workflows.empty.saved')}
              </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery ? t('workflows.empty.adjustSearch') : t('workflows.empty.createFirst')}
                </p>
              <div className="flex items-center justify-center gap-3">
                <Button
                  onClick={() => setLocation('/workflows/editor')}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('workflows.newWorkflow')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation('/workflows/gallery')}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  {t('workflows.gallery')}
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Recent Executions */}
        {executions.length > 0 && (
          <section className="mb-8">
            <DashboardSectionHeader
              eyebrow={t('workflows.executions.eyebrow')}
              title={t('workflows.executions.title')}
              description={t('workflows.executions.description')}
            />
            <div className="grid grid-cols-1 gap-3">
              {executions.slice(0, 5).map((exec: Execution) => (
                <DashboardSurface key={exec.execution_id} className="overflow-hidden">
                  <JobCard
                    executionId={exec.execution_id}
                    workflowName={exec.workflow_name}
                    initialStatus={exec.status}
                  />
                </DashboardSurface>
              ))}
            </div>
          </section>
        )}

        {/* Popular Templates */}
        {templatesData && templatesData.items.length > 0 && (
          <section>
            <DashboardSectionHeader
                eyebrow={t('workflows.templates.eyebrow')}
              title={t('workflows.templates.title')}
              description={t('workflows.templates.description')}
              trailing={(
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocation('/workflows/gallery')}
                  className="text-blue-600 hover:text-blue-700"
                >
                  {t('workflows.galleryBrowseAll')}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            />
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

      {/* Publish to Gallery Dialog */}
      <Dialog open={!!publishTarget} onOpenChange={(open) => { if (!open) setPublishTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              {t('workflows.publish.title')}
            </DialogTitle>
            <DialogDescription>
              {t('workflows.publish.dialogPrefix')} <strong>{publishTarget?.name}</strong> {t('workflows.publish.dialogSuffix')}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-blue-50/50 p-3 text-sm text-blue-800">
            <p className="font-medium mb-1">{t('workflows.publish.nextTitle')}</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>{t('workflows.publish.next.step1')}</li>
              <li>{t('workflows.publish.next.step2')}</li>
              <li>{t('workflows.publish.next.step3')}</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={requestPublishMut.isPending}
              onClick={() => {
                if (publishTarget) {
                  requestPublishMut.mutate({ workflowId: publishTarget.id });
                }
              }}
            >
              {requestPublishMut.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              {t('workflows.publish.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
