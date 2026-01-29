/**
 * Dashboard Page - SmartSpec Pro
 * User dashboard after login
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
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
} from 'lucide-react';

export default function Dashboard() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const [, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fetch real media tasks for recent activity
  const { data: mediaTasksData } = trpc.media.listTasks.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated }
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

  // Calculate real stats from media tasks
  const tasks = mediaTasksData?.tasks || [];
  const totalTasks = mediaTasksData?.total || 0;
  const todayTasks = tasks.filter((t) => {
    const taskDate = new Date(t.createdAt);
    const today = new Date();
    return taskDate.toDateString() === today.toDateString();
  }).length;

  const stats = [
    { label: 'Credits Available', value: (user.credits ?? 0).toLocaleString(), icon: Zap, color: 'text-yellow-500' },
    { label: 'Generations Today', value: todayTasks.toString(), icon: TrendingUp, color: 'text-green-500' },
    { label: 'Total Generations', value: totalTasks.toString(), icon: Image, color: 'text-purple-500' },
    { label: 'Account Status', value: user.plan || 'Free', icon: Clock, color: 'text-blue-500' },
  ];

  const quickActions = [
    { label: 'Media Studio', icon: Sparkles, href: '/media-studio', color: 'from-purple-500 to-pink-500' },
    { label: 'Chat (LLM)', icon: MessageSquare, href: '/chat', color: 'from-teal-500 to-violet-500' },
    { label: 'Generate Video', icon: Video, href: '/media-studio', color: 'from-blue-500 to-cyan-500' },
    { label: 'Generate Audio', icon: Music, href: '/media-studio', color: 'from-orange-500 to-red-500' },
    { label: 'Buy Credits', icon: CreditCard, href: '/credits', color: 'from-green-500 to-emerald-500' },
  ];

  // Format relative time for recent activity
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  // Convert media tasks to activity format
  const recentActivity = tasks.map((task) => ({
    type: task.mediaType as 'image' | 'video' | 'audio',
    title: task.prompt?.slice(0, 40) + (task.prompt?.length > 40 ? '...' : '') || `${task.mediaType} generation`,
    time: formatRelativeTime(task.createdAt),
    status: task.status,
  }));

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

              {user.role === 'admin' && (
                <div className="pt-3 mt-3 border-t border-gray-200">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">Admin</div>
                  {[
                    { label: 'Tenants', icon: Building2, path: '/admin/tenants' },
                    { label: 'Services', icon: Server, path: '/admin/services' },
                    { label: 'Settings', icon: Activity, path: '/admin/settings' },
                    { label: 'Users', icon: Users, path: '/admin/users' },
                    { label: 'Packages', icon: Package, path: '/admin/packages' },
                    { label: 'LLM Providers', icon: Brain, path: '/admin/llm-providers' },
                    { label: 'Media Providers', icon: Layers, path: '/admin/media-providers' },
                    { label: 'Skills', icon: Wand2, path: '/admin/skills' },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => { setLocation(item.path); setSidebarOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-gray-600 hover:bg-gray-100 text-sm"
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {(user.role === 'domain_admin' || user.role === 'admin') && (
                <div className="pt-3 mt-3 border-t border-gray-200">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
                    {user.role === 'admin' ? 'Tenant Management' : 'Domain Admin'}
                  </div>
                  {[
                    { href: '/domain-admin/users', icon: UserCog, label: 'Manage Users' },
                    { href: '/domain-admin/content', icon: FileText, label: 'Edit Content' },
                    { href: '/domain-admin/theme', icon: Palette, label: 'Edit Theme' },
                    { href: '/domain-admin/blog', icon: PenLine, label: 'Manage Blog' },
                  ].map((item) => (
                    <button
                      key={item.href}
                      onClick={() => { setLocation(item.href); setSidebarOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-gray-600 hover:bg-gray-100 text-sm"
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
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
          {[
            { label: 'Dashboard', icon: TrendingUp, active: true, path: '/dashboard' },
            { label: 'Chat (LLM)', icon: MessageSquare, path: '/chat' },
            { label: 'Media Studio', icon: Sparkles, path: '/media-studio' },
            { label: 'Gallery', icon: Image, path: '/gallery' },
            { label: 'Media History', icon: Clock, path: '/media-history' },
            { label: 'Credits', icon: CreditCard, path: '/credits' },
            { label: 'Settings', icon: Settings, path: '/settings' },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => setLocation(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-sm ${
                item.active
                  ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium truncate">{item.label}</span>
            </button>
          ))}

          {user.role === 'admin' && (
            <>
              <div className="pt-3 mt-3 border-t border-gray-200">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
                  Admin
                </div>
                {[
                  { label: 'Tenants', icon: Building2, path: '/admin/tenants' },
                  { label: 'Services', icon: Server, path: '/admin/services' },
                  { label: 'Docker Status', icon: Activity, path: 'http://docker.smartspec.pro', external: true },
                  { label: 'Users', icon: Users, path: '/admin/users' },
                  { label: 'Packages', icon: Package, path: '/admin/packages' },
                  { label: 'LLM Providers', icon: Brain, path: '/admin/llm-providers' },
                  { label: 'Media Providers', icon: Layers, path: '/admin/media-providers' },
                  { label: 'AI Models', icon: Sparkles, path: '/admin/media-models' },
                  { label: 'Skills', icon: Wand2, path: '/admin/skills' },
                  { label: 'Storage (R2/S3)', icon: Cloud, path: '/admin/storage-settings' },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      if (item.external) {
                        window.open(item.path, '_blank');
                      } else {
                        setLocation(item.path);
                      }
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-gray-600 hover:bg-gray-100 text-sm"
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium truncate">{item.label}</span>
                    {item.external && <ExternalLink className="w-3 h-3 ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {(user.role === 'domain_admin' || user.role === 'admin') && (
            <>
              <div className="pt-3 mt-3 border-t border-gray-200">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
                  {user.role === 'admin' ? 'Tenant Management' : 'Domain Admin'}
                </div>
                <button
                  onClick={() => setLocation('/domain-admin/users')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-gray-600 hover:bg-gray-100 text-sm"
                >
                  <UserCog className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium truncate">Manage Users</span>
                </button>
                <button
                  onClick={() => setLocation('/domain-admin/content')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-gray-600 hover:bg-gray-100 text-sm"
                >
                  <FileText className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium truncate">Edit Content</span>
                </button>
                <button
                  onClick={() => setLocation('/domain-admin/theme')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-gray-600 hover:bg-gray-100 text-sm"
                >
                  <Palette className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium truncate">Edit Theme</span>
                </button>
                <button
                  onClick={() => setLocation('/domain-admin/blog')}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-gray-600 hover:bg-gray-100 text-sm"
                >
                  <PenLine className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium truncate">Manage Blog</span>
                </button>
              </div>
            </>
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {user.name.split(' ')[0]}!
          </h1>
          <p className="text-gray-600">
            Here's what's happening with your account today.
          </p>
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
                <stat.icon className={`w-8 h-8 ${stat.color}`} />
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {user.plan.toUpperCase()}
                </span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
              <div className="text-sm text-gray-500">{stat.label}</div>
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

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Recent Activity</h2>
            <Button variant="ghost" size="sm" onClick={() => setLocation('/activity')} className="text-purple-600">
              View All
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 overflow-hidden">
            {recentActivity.map((activity, index) => (
              <div
                key={index}
                className={`flex items-center gap-4 p-4 ${
                  index !== recentActivity.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  activity.type === 'image' ? 'bg-purple-100 text-purple-600' :
                  activity.type === 'video' ? 'bg-blue-100 text-blue-600' :
                  'bg-orange-100 text-orange-600'
                }`}>
                  {activity.type === 'image' ? <Image className="w-5 h-5" /> :
                   activity.type === 'video' ? <Video className="w-5 h-5" /> :
                   <Music className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{activity.title}</div>
                  <div className="text-sm text-gray-500">{activity.time}</div>
                </div>
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                  {activity.status}
                </span>
              </div>
            ))}
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
