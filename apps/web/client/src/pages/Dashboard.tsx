/**
 * Dashboard Page - SmartSpec Pro
 * User dashboard after login
 */

import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { formatRelativeTime } from '@smartspec/shared';
import type { UserRole } from '@smartspec/shared';
import { detectPlatform } from '@smartspec/shared';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { getResolvedMenuItems } from '@/hooks/useMenuItems';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { JobCard } from '@/components/chat/JobCard';
import {
  Sparkles,
  Image,
  Video,
  Music,
  CreditCard,
  Settings,
  LogOut,
  TrendingUp,
  Clock,
  Zap,
  ChevronRight,
  Plus,
  MessageSquare,
  Server,
  Users,
  Package,
  Wand2,
  Brain,
  Building2,
  UserCog,
  Activity,
  ExternalLink,
  Layers,
  Cloud,
  FileText,
  Palette,
  PenLine,
  Menu,
  X,
  GitBranch,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
  AlertCircle,
  CheckCircle2,
  Loader2,
  BarChart3,
  MessagesSquare,
  CheckCircle,
} from 'lucide-react';

export default function Dashboard() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const [, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fetch real media tasks for recent activity
  const { data: mediaTasksData } = trpc.media.listTasks.useQuery(
    { limit: 10 },
    { enabled: isAuthenticated }
  );

  // Credit stats (30 days)
  const { data: creditStats } = trpc.credits.stats.useQuery(
    { days: 30 },
    { enabled: isAuthenticated }
  );

  // Recent credit transactions
  const { data: recentTransactions } = trpc.credits.history.useQuery(
    { limit: 8 },
    { enabled: isAuthenticated }
  );

  // Recent chat conversations
  const { data: chatData } = trpc.chat.listConversations.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated }
  );

  // Fetch active workflows
  const { data: activeWorkflows } = trpc.workflow.list.useQuery(
    { limit: 5, status: 'running' },
    { enabled: isAuthenticated }
  );

  // Fetch pending approvals
  const { data: pendingApprovals } = trpc.approvals.getPending.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated }
  );

  // Submit approval decision mutation
  const submitDecisionMutation = trpc.approvals.submitDecision.useMutation();

  // Menu visibility (must be before any early return to satisfy Rules of Hooks)
  const platform = detectPlatform();
  const { data: menuOverrides } = trpc.systemSettings.getMenuVisibility.useQuery(
    { platform: platform as 'web' | 'desktop' },
    { staleTime: 60_000 }
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading || tenantLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const userRole = (user.role || 'user') as UserRole;
  const mainMenuItems = getResolvedMenuItems(userRole, 'main', menuOverrides);
  const adminMenuItems = getResolvedMenuItems(userRole, 'admin', menuOverrides);
  const domainMenuItems = getResolvedMenuItems(userRole, 'domain-admin', menuOverrides);

  // Calculate real stats from media tasks
  const tasks = mediaTasksData?.tasks || [];
  const totalTasks = mediaTasksData?.total || 0;
  const todayTasks = tasks.filter((t) => {
    const taskDate = new Date(t.createdAt);
    const today = new Date();
    return taskDate.toDateString() === today.toDateString();
  }).length;

  const totalConversations = chatData?.total || 0;

  const stats = [
    { label: 'Credits Available', value: (user.credits ?? 0).toLocaleString(), icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-50' },
    { label: '30-Day Usage', value: creditStats ? Math.abs(creditStats.totalUsage).toLocaleString() : '—', icon: BarChart3, color: 'text-red-500', bg: 'bg-red-50' },
    { label: 'Media Generations', value: totalTasks.toLocaleString(), icon: Image, color: 'text-purple-500', bg: 'bg-purple-50', sub: todayTasks > 0 ? `${todayTasks} today` : undefined },
    { label: 'Chat Sessions', value: totalConversations.toLocaleString(), icon: MessagesSquare, color: 'text-teal-500', bg: 'bg-teal-50' },
  ];

  const quickActions = [
    { label: 'Media Studio', icon: Sparkles, href: '/media-studio', color: 'from-purple-500 to-pink-500' },
    { label: 'Chat (LLM)', icon: MessageSquare, href: '/chat', color: 'from-teal-500 to-violet-500' },
    { label: 'Document Management', icon: FileText, href: '/document-management', color: 'from-sky-500 to-indigo-500' },
    { label: 'Generate Video', icon: Video, href: '/media-studio', color: 'from-blue-500 to-cyan-500' },
    { label: 'Generate Audio', icon: Music, href: '/media-studio', color: 'from-orange-500 to-red-500' },
    { label: 'Buy Credits', icon: CreditCard, href: '/credits', color: 'from-green-500 to-emerald-500' },
  ];


  // Status badge config
  const statusConfig: Record<string, { label: string; bg: string; text: string; icon: typeof CheckCircle2 }> = {
    completed: { label: 'Completed', bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2 },
    processing: { label: 'Processing', bg: 'bg-blue-100', text: 'text-blue-700', icon: Loader2 },
    pending: { label: 'Pending', bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock },
    failed: { label: 'Failed', bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle },
    cancelled: { label: 'Cancelled', bg: 'bg-gray-100', text: 'text-gray-600', icon: X },
  };

  // Transaction type config
  const txTypeConfig: Record<string, { label: string; icon: typeof Coins; color: string }> = {
    usage: { label: 'Usage', icon: ArrowDownRight, color: 'text-red-500' },
    purchase: { label: 'Purchase', icon: ArrowUpRight, color: 'text-green-500' },
    bonus: { label: 'Bonus', icon: Zap, color: 'text-yellow-500' },
    refund: { label: 'Refund', icon: ArrowUpRight, color: 'text-blue-500' },
    adjustment: { label: 'Adjustment', icon: Coins, color: 'text-gray-500' },
    subscription: { label: 'Subscription', icon: CreditCard, color: 'text-purple-500' },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl p-2 shadow-md"
      >
        <Menu className="w-6 h-6 text-gray-700" />
      </button>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-200 flex flex-col shadow-xl">
            <div className="flex items-center justify-between p-4">
              <span className="font-bold text-gray-900">{tenant?.name || 'Dashboard'}</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => { setLocation(action.href); setSidebarOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-gray-600 hover:bg-gray-100 text-sm"
                >
                  <action.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium truncate">{action.label}</span>
                </button>
              ))}

              {adminMenuItems.length > 0 && (
                <div className="pt-3 mt-3 border-t border-gray-200">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">Admin</div>
                  {adminMenuItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.external) { window.open(item.path, '_blank', 'noopener,noreferrer'); }
                        else { setLocation(item.path); }
                        setSidebarOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-gray-600 hover:bg-gray-100 text-sm"
                    >
                      <item.IconComponent className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium truncate">{item.label}</span>
                      {item.external && <ExternalLink className="w-3 h-3 ml-auto flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {domainMenuItems.length > 0 && (
                <div className="pt-3 mt-3 border-t border-gray-200">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
                    {user.role === 'admin' ? 'Tenant Management' : 'Domain Admin'}
                  </div>
                  {domainMenuItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { setLocation(item.path); setSidebarOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-gray-600 hover:bg-gray-100 text-sm"
                    >
                      <item.IconComponent className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </nav>
            <div className="p-4 border-t border-gray-200">
              <Button
                variant="ghost"
                onClick={() => { logout(); setSidebarOpen(false); }}
                className="w-full justify-start text-gray-600 hover:text-red-600 text-sm"
              >
                <LogOut className="w-4 h-4 mr-3" />
                Sign Out
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white/70 backdrop-blur-xl border-r border-gray-200/50 hidden lg:flex lg:flex-col">
        <div className="flex items-center gap-3 p-6 pb-4">
          {tenant?.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={tenant.name || "Logo"}
              className="w-10 h-10 object-contain rounded-xl"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
          )}
          <span className="text-xl font-bold text-gray-900">{tenant?.name || 'SmartSpec'}</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-6 space-y-1">
          {mainMenuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setLocation(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-sm ${
                item.id === 'dashboard'
                  ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <item.IconComponent className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium truncate">{item.label}</span>
            </button>
          ))}

          {adminMenuItems.length > 0 && (
            <div className="pt-3 mt-3 border-t border-gray-200">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
                Admin
              </div>
              {adminMenuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.external) {
                      window.open(item.path, '_blank', 'noopener,noreferrer');
                    } else {
                      setLocation(item.path);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-gray-600 hover:bg-gray-100 text-sm"
                >
                  <item.IconComponent className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium truncate">{item.label}</span>
                  {item.external && <ExternalLink className="w-3 h-3 ml-auto flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {domainMenuItems.length > 0 && (
            <div className="pt-3 mt-3 border-t border-gray-200">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
                {user.role === 'admin' ? 'Tenant Management' : 'Domain Admin'}
              </div>
              {domainMenuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setLocation(item.path)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-gray-600 hover:bg-gray-100 text-sm"
                >
                  <item.IconComponent className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium truncate">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>

        <div className="p-6 pt-4 border-t border-gray-200">
          <Button
            variant="ghost"
            onClick={logout}
            className="w-full justify-start text-gray-600 hover:text-red-600 text-sm"
          >
            <LogOut className="w-4 h-4 mr-3" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-6 lg:p-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome back, {user.name.split(' ')[0]}!
              </h1>
              <p className="text-gray-600">
                Here's what's happening with your account today.
              </p>
            </div>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 backdrop-blur-xl border border-white/50 shadow-lg shadow-purple-500/5 text-sm font-medium text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Website Preview
            </a>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          {stats.map((stat, index) => (
            <div
              key={index}
              className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 p-6 shadow-lg shadow-purple-500/5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {user.plan.toUpperCase()}
                </span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">{stat.label}</span>
                {'sub' in stat && stat.sub && (
                  <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                    {stat.sub}
                  </span>
                )}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={() => setLocation(action.href)}
                className="group relative bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 p-6 shadow-lg shadow-purple-500/5 hover:shadow-xl transition-all duration-300 overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${action.color} opacity-0 group-hover:opacity-10 transition-opacity`} />
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-4`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <div className="font-semibold text-gray-900">{action.label}</div>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </button>
            ))}
          </div>
        </motion.div>

        {/* Workflow and Approvals Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
        >
          {/* Active Workflows Section */}
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-500" />
                Active Workflows
              </h2>
              {activeWorkflows?.workflows && activeWorkflows.workflows.length > 0 && (
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-600">
                  {activeWorkflows.workflows.length} running
                </span>
              )}
            </div>

            {activeWorkflows?.workflows && activeWorkflows.workflows.length > 0 ? (
              <div className="space-y-3">
                {activeWorkflows.workflows.map((workflow: any) => (
                  <JobCard
                    key={workflow.execution_id}
                    executionId={workflow.execution_id}
                    workflowName={workflow.workflow_name}
                    initialStatus={workflow.status}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No active workflows</p>
                <p className="text-sm mt-1">Start a workflow from chat or skills</p>
              </div>
            )}
          </div>

          {/* Pending Approvals Section */}
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                Pending Approvals
              </h2>
              {pendingApprovals?.requests && pendingApprovals.requests.length > 0 && (
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-600">
                  {pendingApprovals.requests.length} pending
                </span>
              )}
            </div>

            {pendingApprovals?.requests && pendingApprovals.requests.length > 0 ? (
              <div className="space-y-3">
                {pendingApprovals.requests.map((request: any) => (
                  <div
                    key={request.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50/50 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {request.title}
                        </p>
                        {request.description && (
                          <p className="text-sm text-gray-600 mt-1">
                            {request.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            request.risk_level === 'high'
                              ? 'bg-red-100 text-red-600'
                              : 'bg-amber-100 text-amber-600'
                          }`}>
                            {request.request_type}
                          </span>
                          {request.expires_at && (
                            <span className="text-xs text-gray-500">
                              Expires: {new Date(request.expires_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          onClick={() => {
                            submitDecisionMutation.mutate({
                              requestId: request.id,
                              decision: 'approved',
                            });
                          }}
                          variant="default"
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Approve
                        </Button>
                        <Button
                          onClick={() => {
                            submitDecisionMutation.mutate({
                              requestId: request.id,
                              decision: 'rejected',
                            });
                          }}
                          variant="destructive"
                          size="sm"
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No pending approvals</p>
                <p className="text-sm mt-1">All approval gates cleared</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Two-column layout: Recent Activity + Sidebar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8"
        >
          {/* Recent Media Generations */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Recent Media Generations</h2>
              <Button variant="ghost" size="sm" onClick={() => setLocation('/media-history')} className="text-purple-600">
                View All <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 overflow-hidden">
              {tasks.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <Image className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No media generations yet</p>
                  <Button variant="ghost" size="sm" className="mt-2 text-purple-600" onClick={() => setLocation('/media-studio')}>
                    Go to Media Studio
                  </Button>
                </div>
              ) : (
                tasks.slice(0, 6).map((task, index) => {
                  const sc = statusConfig[task.status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  const typeIcon = task.mediaType === 'image' ? Image : task.mediaType === 'video' ? Video : Music;
                  const TypeIcon = typeIcon;
                  const typeBg = task.mediaType === 'image' ? 'bg-purple-100 text-purple-600' :
                                 task.mediaType === 'video' ? 'bg-blue-100 text-blue-600' :
                                 'bg-orange-100 text-orange-600';

                  return (
                    <div
                      key={task.id || index}
                      className={`flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors ${
                        index !== Math.min(tasks.length, 6) - 1 ? 'border-b border-gray-100' : ''
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${typeBg}`}>
                        <TypeIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate text-sm">
                          {task.prompt?.slice(0, 60) || `${task.mediaType} generation`}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                          <span className="capitalize">{task.mediaType}</span>
                          <span className="text-gray-300">|</span>
                          <span className="font-mono text-gray-600">{task.model || 'unknown'}</span>
                          {task.creditsUsed > 0 && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span className="flex items-center gap-0.5 text-amber-600">
                                <Zap className="w-3 h-3" /> {task.creditsUsed}
                              </span>
                            </>
                          )}
                          <span className="text-gray-300">|</span>
                          <span>{formatRelativeTime(task.createdAt)}</span>
                        </div>
                      </div>
                      <span className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full flex-shrink-0 ${sc.bg} ${sc.text}`}>
                        <StatusIcon className={`w-3 h-3 ${task.status === 'processing' ? 'animate-spin' : ''}`} />
                        {sc.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Sidebar: Recent Conversations */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Recent Chats</h2>
              <Button variant="ghost" size="sm" onClick={() => setLocation('/chat')} className="text-purple-600 text-xs px-2">
                Open <ChevronRight className="w-3 h-3 ml-0.5" />
              </Button>
            </div>
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 overflow-hidden">
              {(!chatData?.conversations || chatData.conversations.length === 0) ? (
                <div className="p-6 text-center text-gray-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No conversations yet</p>
                </div>
              ) : (
                chatData.conversations.slice(0, 5).map((conv, index) => (
                  <button
                    key={conv.id}
                    onClick={() => setLocation('/chat')}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50/50 transition-colors ${
                      index !== Math.min(chatData.conversations.length, 5) - 1 ? 'border-b border-gray-100' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-900 text-sm truncate">
                      {conv.title || 'Untitled'}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      <span>{conv.messageCount} msgs</span>
                      {Number(conv.totalCreditsUsed) > 0 && (
                        <>
                          <span className="text-gray-300">|</span>
                          <span className="flex items-center gap-0.5 text-amber-600">
                            <Zap className="w-3 h-3" /> {Math.round(Number(conv.totalCreditsUsed))}
                          </span>
                        </>
                      )}
                      <span className="text-gray-300">|</span>
                      <span>{formatRelativeTime(conv.updatedAt)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </motion.div>

        {/* Credit Transactions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Credit Transactions</h2>
            <Button variant="ghost" size="sm" onClick={() => setLocation('/credits')} className="text-purple-600">
              View All <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 overflow-hidden">
            {(!recentTransactions || recentTransactions.length === 0) ? (
              <div className="p-8 text-center text-gray-400">
                <Coins className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No transactions yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentTransactions.slice(0, 6).map((tx: any) => {
                  const tc = txTypeConfig[tx.type] || txTypeConfig.adjustment;
                  const TxIcon = tc.icon;
                  const isPositive = tx.amount > 0;
                  return (
                    <div key={tx.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isPositive ? 'bg-green-100' : 'bg-red-50'
                      }`}>
                        <TxIcon className={`w-4 h-4 ${tc.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {tx.description || tc.label}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                          <span className="capitalize">{tc.label}</span>
                          {tx.metadata?.model && (
                            <>
                              <span className="text-gray-300">|</span>
                              <span className="font-mono text-gray-600">{tx.metadata.model}</span>
                            </>
                          )}
                          <span className="text-gray-300">|</span>
                          <span>{formatRelativeTime(tx.createdAt)}</span>
                        </div>
                      </div>
                      <div className={`text-sm font-semibold flex-shrink-0 ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                        {isPositive ? '+' : ''}{tx.amount.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>

        {/* Floating Action Button */}
        <button className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full shadow-lg shadow-purple-500/30 flex items-center justify-center text-white hover:shadow-xl hover:shadow-purple-500/40 transition-all duration-300 lg:hidden">
          <Plus className="w-6 h-6" />
        </button>
      </main>
    </div>
  );
}
