/**
 * Admin Dashboard Component
 * Features: User management, Analytics, System health, Content moderation
 */

import React, { useState } from 'react';
import {
  Users,
  Activity,
  CreditCard,
  Server,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  MoreVertical,
  Search,
  Download,
  RefreshCw,
  Shield,
  Eye,
  Ban,
  CheckCircle,
  XCircle,
  Database,
  Cpu,
  HardDrive,
  Zap,
  Globe,
  Image,
  Video,
  Music,
  FileText,
  Settings,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

// Types
interface User {
  id: string;
  email: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'pending';
  creditsUsed: number;
  creditsTotal: number;
  createdAt: string;
  lastActive: string;
}

interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  status: 'healthy' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
  change: number;
}

interface ContentItem {
  id: string;
  type: 'image' | 'video' | 'audio' | 'code';
  userId: string;
  userName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  flagReason?: string;
}

// Mock data
const mockUsers: User[] = [
  { id: '1', email: 'john@example.com', name: 'John Doe', plan: 'pro', status: 'active', creditsUsed: 350, creditsTotal: 500, createdAt: '2024-01-15', lastActive: '2025-01-03' },
  { id: '2', email: 'jane@example.com', name: 'Jane Smith', plan: 'enterprise', status: 'active', creditsUsed: 2500, creditsTotal: 5000, createdAt: '2024-02-20', lastActive: '2025-01-03' },
  { id: '3', email: 'bob@example.com', name: 'Bob Wilson', plan: 'free', status: 'active', creditsUsed: 8, creditsTotal: 10, createdAt: '2024-12-01', lastActive: '2025-01-02' },
  { id: '4', email: 'alice@example.com', name: 'Alice Brown', plan: 'pro', status: 'suspended', creditsUsed: 0, creditsTotal: 500, createdAt: '2024-06-10', lastActive: '2024-12-15' },
  { id: '5', email: 'charlie@example.com', name: 'Charlie Davis', plan: 'free', status: 'pending', creditsUsed: 0, creditsTotal: 10, createdAt: '2025-01-02', lastActive: '2025-01-02' },
];

const mockMetrics: SystemMetric[] = [
  { name: 'CPU Usage', value: 45, unit: '%', status: 'healthy', trend: 'stable', change: 2 },
  { name: 'Memory', value: 68, unit: '%', status: 'warning', trend: 'up', change: 8 },
  { name: 'Storage', value: 42, unit: '%', status: 'healthy', trend: 'up', change: 3 },
  { name: 'API Latency', value: 125, unit: 'ms', status: 'healthy', trend: 'down', change: -15 },
];

const mockContent: ContentItem[] = [
  { id: '1', type: 'image', userId: '1', userName: 'John Doe', status: 'pending', createdAt: '2025-01-03 10:30', flagReason: 'Automated flag: potential copyright' },
  { id: '2', type: 'video', userId: '2', userName: 'Jane Smith', status: 'pending', createdAt: '2025-01-03 09:15' },
  { id: '3', type: 'code', userId: '3', userName: 'Bob Wilson', status: 'approved', createdAt: '2025-01-02 16:45' },
  { id: '4', type: 'audio', userId: '1', userName: 'John Doe', status: 'rejected', createdAt: '2025-01-02 14:20', flagReason: 'Inappropriate content' },
];

// Sub-components
const StatCard: React.FC<{
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  trend?: 'up' | 'down';
  color: string;
}> = ({ title, value, change, icon, trend, color }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{value}</p>
        {change !== undefined && (
          <div className={`flex items-center mt-2 text-sm ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
            {trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            <span>{Math.abs(change)}% from last week</span>
          </div>
        )}
      </div>
      <div className={`p-3 rounded-lg ${color}`}>
        {icon}
      </div>
    </div>
  </div>
);

const MetricCard: React.FC<{ metric: SystemMetric }> = ({ metric }) => {
  const statusColors = {
    healthy: 'bg-green-100 text-green-600',
    warning: 'bg-yellow-100 text-yellow-600',
    critical: 'bg-red-100 text-red-600'
  };

  const statusBg = {
    healthy: 'bg-green-500',
    warning: 'bg-yellow-500',
    critical: 'bg-red-500'
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">{metric.name}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[metric.status]}`}>
          {metric.status}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">{metric.value}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">{metric.unit}</span>
      </div>
      <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div 
          className={`h-full ${statusBg[metric.status]} transition-all duration-500`}
          style={{ width: `${Math.min(metric.value, 100)}%` }}
        />
      </div>
      <div className={`flex items-center mt-2 text-xs ${metric.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
        {metric.trend === 'up' ? <TrendingUp className="w-3 h-3 mr-1" /> : 
         metric.trend === 'down' ? <TrendingDown className="w-3 h-3 mr-1" /> : null}
        <span>{metric.change >= 0 ? '+' : ''}{metric.change}% from last hour</span>
      </div>
    </div>
  );
};

// Main component
export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'content' | 'system'>('overview');
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlan = selectedPlan === 'all' || user.plan === selectedPlan;
    return matchesSearch && matchesPlan;
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleUserAction = (userId: string, action: 'suspend' | 'activate' | 'delete') => {
    setUsers(prev => prev.map(user => {
      if (user.id === userId) {
        if (action === 'suspend') return { ...user, status: 'suspended' as const };
        if (action === 'activate') return { ...user, status: 'active' as const };
      }
      return user;
    }).filter(user => action !== 'delete' || user.id !== userId));
  };

  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.status === 'active').length,
    totalRevenue: users.reduce((acc, u) => acc + (u.plan === 'pro' ? 29 : u.plan === 'enterprise' ? 199 : 0), 0),
    pendingContent: mockContent.filter(c => c.status === 'pending').length
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={stats.totalUsers.toLocaleString()}
          change={12}
          trend="up"
          icon={<Users className="w-6 h-6 text-blue-600" />}
          color="bg-blue-100"
        />
        <StatCard
          title="Active Users"
          value={stats.activeUsers.toLocaleString()}
          change={8}
          trend="up"
          icon={<Activity className="w-6 h-6 text-green-600" />}
          color="bg-green-100"
        />
        <StatCard
          title="Monthly Revenue"
          value={`$${stats.totalRevenue.toLocaleString()}`}
          change={15}
          trend="up"
          icon={<CreditCard className="w-6 h-6 text-purple-600" />}
          color="bg-purple-100"
        />
        <StatCard
          title="Pending Reviews"
          value={stats.pendingContent}
          icon={<AlertTriangle className="w-6 h-6 text-orange-600" />}
          color="bg-orange-100"
        />
      </div>

      {/* System Health */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">System Health</h3>
          <button 
            onClick={handleRefresh}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {mockMetrics.map((metric, index) => (
            <MetricCard key={index} metric={metric} />
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Users</h3>
            <button className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            {users.slice(0, 5).map(user => (
              <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                    {user.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  user.plan === 'enterprise' ? 'bg-purple-100 text-purple-600' :
                  user.plan === 'pro' ? 'bg-blue-100 text-blue-600' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {user.plan}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Content */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Pending Reviews</h3>
            <button className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1">
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            {mockContent.filter(c => c.status === 'pending').map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    item.type === 'image' ? 'bg-pink-100' :
                    item.type === 'video' ? 'bg-red-100' :
                    item.type === 'audio' ? 'bg-green-100' :
                    'bg-blue-100'
                  }`}>
                    {item.type === 'image' ? <Image className="w-5 h-5 text-pink-600" /> :
                     item.type === 'video' ? <Video className="w-5 h-5 text-red-600" /> :
                     item.type === 'audio' ? <Music className="w-5 h-5 text-green-600" /> :
                     <FileText className="w-5 h-5 text-blue-600" />}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{item.userName}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{item.type} • {item.createdAt}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="p-2 hover:bg-green-100 rounded-lg transition-colors">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </button>
                  <button className="p-2 hover:bg-red-100 rounded-lg transition-colors">
                    <XCircle className="w-5 h-5 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={selectedPlan}
          onChange={(e) => setSelectedPlan(e.target.value)}
          className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="all">All Plans</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Credits</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Active</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.plan === 'enterprise' ? 'bg-purple-100 text-purple-600' :
                      user.plan === 'pro' ? 'bg-blue-100 text-blue-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {user.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.status === 'active' ? 'bg-green-100 text-green-600' :
                      user.status === 'suspended' ? 'bg-red-100 text-red-600' :
                      'bg-yellow-100 text-yellow-600'
                    }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${(user.creditsUsed / user.creditsTotal) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {user.creditsUsed}/{user.creditsTotal}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {user.lastActive}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <Eye className="w-4 h-4 text-gray-500" />
                      </button>
                      {user.status === 'active' ? (
                        <button 
                          onClick={() => handleUserAction(user.id, 'suspend')}
                          className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                        >
                          <Ban className="w-4 h-4 text-red-500" />
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleUserAction(user.id, 'activate')}
                          className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                        >
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        </button>
                      )}
                      <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <MoreVertical className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderContent = () => (
    <div className="space-y-4">
      <div className="flex gap-4 mb-4">
        <button className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg font-medium">
          Pending ({mockContent.filter(c => c.status === 'pending').length})
        </button>
        <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium">
          Approved ({mockContent.filter(c => c.status === 'approved').length})
        </button>
        <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium">
          Rejected ({mockContent.filter(c => c.status === 'rejected').length})
        </button>
      </div>

      <div className="grid gap-4">
        {mockContent.map(item => (
          <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${
                  item.type === 'image' ? 'bg-pink-100' :
                  item.type === 'video' ? 'bg-red-100' :
                  item.type === 'audio' ? 'bg-green-100' :
                  'bg-blue-100'
                }`}>
                  {item.type === 'image' ? <Image className="w-8 h-8 text-pink-600" /> :
                   item.type === 'video' ? <Video className="w-8 h-8 text-red-600" /> :
                   item.type === 'audio' ? <Music className="w-8 h-8 text-green-600" /> :
                   <FileText className="w-8 h-8 text-blue-600" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-white">{item.userName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      item.status === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                      item.status === 'approved' ? 'bg-green-100 text-green-600' :
                      'bg-red-100 text-red-600'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {item.type.charAt(0).toUpperCase() + item.type.slice(1)} • {item.createdAt}
                  </p>
                  {item.flagReason && (
                    <p className="text-sm text-orange-500 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      {item.flagReason}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors text-sm">
                  Preview
                </button>
                {item.status === 'pending' && (
                  <>
                    <button className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm">
                      Approve
                    </button>
                    <button className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm">
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSystem = () => (
    <div className="space-y-6">
      {/* System Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {mockMetrics.map((metric, index) => (
          <MetricCard key={index} metric={metric} />
        ))}
      </div>

      {/* Services Status */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Services Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { name: 'API Server', status: 'operational', icon: Server },
            { name: 'Database', status: 'operational', icon: Database },
            { name: 'Redis Cache', status: 'operational', icon: Zap },
            { name: 'AI Models', status: 'operational', icon: Cpu },
            { name: 'Storage (R2)', status: 'operational', icon: HardDrive },
            { name: 'CDN', status: 'operational', icon: Globe },
          ].map((service, index) => (
            <div key={index} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center gap-3">
                <service.icon className="w-5 h-5 text-gray-500" />
                <span className="font-medium text-gray-900 dark:text-white">{service.name}</span>
              </div>
              <span className="flex items-center gap-1 text-sm text-green-500">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                {service.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
            <RefreshCw className="w-6 h-6 text-blue-500 mb-2" />
            <p className="font-medium text-gray-900 dark:text-white">Restart Services</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Restart all services</p>
          </button>
          <button className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
            <Database className="w-6 h-6 text-green-500 mb-2" />
            <p className="font-medium text-gray-900 dark:text-white">Clear Cache</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Clear Redis cache</p>
          </button>
          <button className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
            <Download className="w-6 h-6 text-purple-500 mb-2" />
            <p className="font-medium text-gray-900 dark:text-white">Export Logs</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Download system logs</p>
          </button>
          <button className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
            <Settings className="w-6 h-6 text-orange-500 mb-2" />
            <p className="font-medium text-gray-900 dark:text-white">System Config</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Edit configuration</p>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage users, content, and system health</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleRefresh}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-5 h-5 text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <Settings className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {[
            { id: 'overview', label: 'Overview', icon: Activity },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'content', label: 'Content', icon: Shield },
            { id: 'system', label: 'System', icon: Server },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'users' && renderUsers()}
        {activeTab === 'content' && renderContent()}
        {activeTab === 'system' && renderSystem()}
      </div>
    </div>
  );
};

export default AdminDashboard;
