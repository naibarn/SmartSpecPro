/**
 * Workflows View Component
 * Features: Workflow list, Create/Edit workflows, Execution history, Templates
 */

import React, { useState } from 'react';
import {
  Play,
  Pause,
  Plus,
  Search,
  MoreVertical,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  GitBranch,
  Zap,
  Copy,
  Trash2,
  Edit,
  Eye,
  ArrowRight,
  Code,
  Image,
  Database,
  Globe,
  Mail,
  MessageSquare,
  Layers,
  RefreshCw,
  Calendar,
  Timer
} from 'lucide-react';

// Types
interface WorkflowStep {
  id: string;
  name: string;
  type: 'trigger' | 'action' | 'condition' | 'loop';
  config: Record<string, any>;
  status?: 'pending' | 'running' | 'completed' | 'failed';
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'draft';
  steps: WorkflowStep[];
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  successRate: number;
  createdAt: string;
  updatedAt: string;
  trigger: 'manual' | 'schedule' | 'webhook' | 'event';
  category: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  steps: number;
  popularity: number;
}

// Mock data
const mockWorkflows: Workflow[] = [
  {
    id: '1',
    name: 'Code Review Automation',
    description: 'Automatically review code changes and provide suggestions',
    status: 'active',
    steps: [
      { id: 's1', name: 'GitHub Webhook', type: 'trigger', config: {} },
      { id: 's2', name: 'Analyze Code', type: 'action', config: {} },
      { id: 's3', name: 'Generate Review', type: 'action', config: {} },
      { id: 's4', name: 'Post Comment', type: 'action', config: {} },
    ],
    lastRun: '2025-01-03 10:30',
    nextRun: 'On trigger',
    runCount: 156,
    successRate: 98.5,
    createdAt: '2024-11-15',
    updatedAt: '2025-01-02',
    trigger: 'webhook',
    category: 'Development'
  },
  {
    id: '2',
    name: 'Daily Report Generator',
    description: 'Generate and send daily analytics reports',
    status: 'active',
    steps: [
      { id: 's1', name: 'Schedule Trigger', type: 'trigger', config: {} },
      { id: 's2', name: 'Fetch Analytics', type: 'action', config: {} },
      { id: 's3', name: 'Generate Report', type: 'action', config: {} },
      { id: 's4', name: 'Send Email', type: 'action', config: {} },
    ],
    lastRun: '2025-01-03 08:00',
    nextRun: '2025-01-04 08:00',
    runCount: 45,
    successRate: 100,
    createdAt: '2024-12-01',
    updatedAt: '2024-12-20',
    trigger: 'schedule',
    category: 'Analytics'
  },
  {
    id: '3',
    name: 'Content Moderation',
    description: 'Automatically moderate user-generated content',
    status: 'paused',
    steps: [
      { id: 's1', name: 'Content Webhook', type: 'trigger', config: {} },
      { id: 's2', name: 'AI Analysis', type: 'action', config: {} },
      { id: 's3', name: 'Check Rules', type: 'condition', config: {} },
      { id: 's4', name: 'Take Action', type: 'action', config: {} },
    ],
    lastRun: '2025-01-02 15:45',
    runCount: 89,
    successRate: 95.2,
    createdAt: '2024-10-20',
    updatedAt: '2025-01-02',
    trigger: 'webhook',
    category: 'Moderation'
  },
  {
    id: '4',
    name: 'API Documentation Generator',
    description: 'Generate API docs from code comments',
    status: 'draft',
    steps: [
      { id: 's1', name: 'Manual Trigger', type: 'trigger', config: {} },
      { id: 's2', name: 'Parse Code', type: 'action', config: {} },
      { id: 's3', name: 'Generate Docs', type: 'action', config: {} },
    ],
    runCount: 0,
    successRate: 0,
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    trigger: 'manual',
    category: 'Documentation'
  },
];

const mockTemplates: WorkflowTemplate[] = [
  { id: 't1', name: 'Code Review Bot', description: 'Automated code review with AI', category: 'Development', icon: <Code className="w-6 h-6" />, steps: 4, popularity: 95 },
  { id: 't2', name: 'Daily Digest', description: 'Scheduled email reports', category: 'Communication', icon: <Mail className="w-6 h-6" />, steps: 3, popularity: 88 },
  { id: 't3', name: 'Image Processor', description: 'Batch image optimization', category: 'Media', icon: <Image className="w-6 h-6" />, steps: 5, popularity: 76 },
  { id: 't4', name: 'Database Backup', description: 'Automated DB backups', category: 'Infrastructure', icon: <Database className="w-6 h-6" />, steps: 4, popularity: 92 },
  { id: 't5', name: 'Webhook Handler', description: 'Process incoming webhooks', category: 'Integration', icon: <Globe className="w-6 h-6" />, steps: 3, popularity: 84 },
  { id: 't6', name: 'Slack Notifier', description: 'Send Slack notifications', category: 'Communication', icon: <MessageSquare className="w-6 h-6" />, steps: 2, popularity: 90 },
];

// Sub-components
const WorkflowCard: React.FC<{
  workflow: Workflow;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onRun: () => void;
}> = ({ workflow, onEdit, onToggle, onDelete, onRun }) => {
  const statusColors = {
    active: 'bg-green-100 text-green-600',
    paused: 'bg-yellow-100 text-yellow-600',
    draft: 'bg-gray-100 text-gray-600'
  };

  const triggerIcons = {
    manual: <Play className="w-4 h-4" />,
    schedule: <Calendar className="w-4 h-4" />,
    webhook: <Globe className="w-4 h-4" />,
    event: <Zap className="w-4 h-4" />
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{workflow.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{workflow.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[workflow.status]}`}>
            {workflow.status}
          </span>
          <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors">
            <MoreVertical className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Steps Preview */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2">
        {workflow.steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${
              step.type === 'trigger' ? 'bg-blue-100 text-blue-600' :
              step.type === 'condition' ? 'bg-purple-100 text-purple-600' :
              step.type === 'loop' ? 'bg-orange-100 text-orange-600' :
              'bg-gray-100 text-gray-600'
            }`}>
              {step.name}
            </div>
            {index < workflow.steps.length - 1 && (
              <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4 py-3 border-t border-b border-gray-100 dark:border-gray-700">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Trigger</p>
          <div className="flex items-center gap-1 mt-1">
            {triggerIcons[workflow.trigger]}
            <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">{workflow.trigger}</span>
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Runs</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{workflow.runCount}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Success Rate</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
            {workflow.successRate > 0 ? `${workflow.successRate}%` : '-'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Last Run</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
            {workflow.lastRun || 'Never'}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onRun}
            disabled={workflow.status === 'draft'}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <Play className="w-4 h-4" />
            Run
          </button>
          <button
            onClick={onToggle}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors text-sm ${
              workflow.status === 'active'
                ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                : 'bg-green-100 text-green-600 hover:bg-green-200'
            }`}
          >
            {workflow.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {workflow.status === 'active' ? 'Pause' : 'Activate'}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <Edit className="w-4 h-4 text-gray-500" />
          </button>
          <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <Copy className="w-4 h-4 text-gray-500" />
          </button>
          <button onClick={onDelete} className="p-2 hover:bg-red-100 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
};

const TemplateCard: React.FC<{ template: WorkflowTemplate; onUse: () => void }> = ({ template, onUse }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all hover:border-blue-300 cursor-pointer group">
    <div className="flex items-start gap-3">
      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
        {template.icon}
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
          {template.name}
        </h4>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{template.description}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-gray-400">{template.steps} steps</span>
          <span className="text-xs text-gray-400">•</span>
          <span className="text-xs text-gray-400">{template.category}</span>
        </div>
      </div>
      <button
        onClick={onUse}
        className="opacity-0 group-hover:opacity-100 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm"
      >
        Use
      </button>
    </div>
  </div>
);

// Main component
export const WorkflowsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'workflows' | 'templates' | 'runs'>('workflows');
  const [workflows, setWorkflows] = useState<Workflow[]>(mockWorkflows);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [_showCreateModal, setShowCreateModal] = useState(false);

  const categories = ['all', ...new Set(workflows.map(w => w.category))];

  const filteredWorkflows = workflows.filter(workflow => {
    const matchesSearch = workflow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         workflow.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || workflow.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleToggleWorkflow = (id: string) => {
    setWorkflows(prev => prev.map(w => {
      if (w.id === id) {
        return { ...w, status: w.status === 'active' ? 'paused' : 'active' as const };
      }
      return w;
    }));
  };

  const handleDeleteWorkflow = (id: string) => {
    setWorkflows(prev => prev.filter(w => w.id !== id));
  };

  const stats = {
    total: workflows.length,
    active: workflows.filter(w => w.status === 'active').length,
    totalRuns: workflows.reduce((acc, w) => acc + w.runCount, 0),
    avgSuccess: workflows.filter(w => w.runCount > 0).reduce((acc, w) => acc + w.successRate, 0) / 
                workflows.filter(w => w.runCount > 0).length || 0
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Workflows</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Automate your development tasks</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Workflow
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Workflows</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
            <p className="text-xl font-bold text-green-600">{stats.active}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Runs</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.totalRuns}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Avg Success Rate</p>
            <p className="text-xl font-bold text-blue-600">{stats.avgSuccess.toFixed(1)}%</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {[
            { id: 'workflows', label: 'My Workflows', icon: GitBranch },
            { id: 'templates', label: 'Templates', icon: Layers },
            { id: 'runs', label: 'Run History', icon: Clock },
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
        {activeTab === 'workflows' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search workflows..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</option>
                ))}
              </select>
            </div>

            {/* Workflows Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredWorkflows.map(workflow => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  onEdit={() => console.log('Edit', workflow.id)}
                  onToggle={() => handleToggleWorkflow(workflow.id)}
                  onDelete={() => handleDeleteWorkflow(workflow.id)}
                  onRun={() => console.log('Run', workflow.id)}
                />
              ))}
            </div>

            {filteredWorkflows.length === 0 && (
              <div className="text-center py-12">
                <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No workflows found</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  {searchQuery ? 'Try a different search term' : 'Create your first workflow to get started'}
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Create Workflow
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mockTemplates.map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onUse={() => console.log('Use template', template.id)}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'runs' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Workflow</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Started</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {[
                    { id: 'r1', workflow: 'Code Review Automation', status: 'completed', duration: '2m 34s', started: '2025-01-03 10:30' },
                    { id: 'r2', workflow: 'Daily Report Generator', status: 'completed', duration: '1m 12s', started: '2025-01-03 08:00' },
                    { id: 'r3', workflow: 'Content Moderation', status: 'failed', duration: '45s', started: '2025-01-02 15:45' },
                    { id: 'r4', workflow: 'Code Review Automation', status: 'completed', duration: '3m 01s', started: '2025-01-02 14:20' },
                    { id: 'r5', workflow: 'Daily Report Generator', status: 'completed', duration: '1m 08s', started: '2025-01-02 08:00' },
                  ].map(run => (
                    <tr key={run.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <GitBranch className="w-5 h-5 text-gray-400" />
                          <span className="font-medium text-gray-900 dark:text-white">{run.workflow}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`flex items-center gap-1 text-sm ${
                          run.status === 'completed' ? 'text-green-600' :
                          run.status === 'failed' ? 'text-red-600' :
                          'text-yellow-600'
                        }`}>
                          {run.status === 'completed' ? <CheckCircle className="w-4 h-4" /> :
                           run.status === 'failed' ? <XCircle className="w-4 h-4" /> :
                           <AlertCircle className="w-4 h-4" />}
                          {run.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Timer className="w-4 h-4" />
                          {run.duration}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {run.started}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                          <Eye className="w-4 h-4 text-gray-500" />
                        </button>
                        <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                          <RefreshCw className="w-4 h-4 text-gray-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkflowsView;
