/**
 * History View Component
 * Features: Execution history, Chat history, Generation history, Filters, Export
 */

import React, { useState } from 'react';
import {
  Clock,
  Search,
  Download,
  Trash2,
  Eye,
  MessageSquare,
  Code,
  Image,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Calendar,
  Timer,
  Cpu,
  Zap,
  RefreshCw,
  Copy,
  Star,
  StarOff
} from 'lucide-react';

// Types
interface HistoryItem {
  id: string;
  type: 'chat' | 'generation' | 'workflow' | 'code';
  title: string;
  description: string;
  status: 'completed' | 'failed' | 'cancelled';
  timestamp: string;
  duration: string;
  model?: string;
  tokens?: number;
  cost?: number;
  starred: boolean;
  tags: string[];
  details?: Record<string, any>;
}

// Mock data
const mockHistory: HistoryItem[] = [
  {
    id: '1',
    type: 'chat',
    title: 'Code Review Discussion',
    description: 'Reviewed authentication module implementation',
    status: 'completed',
    timestamp: '2025-01-03 11:30',
    duration: '5m 23s',
    model: 'Claude 3.5 Sonnet',
    tokens: 4520,
    cost: 0.045,
    starred: true,
    tags: ['code-review', 'auth'],
    details: { messages: 12, files: 3 }
  },
  {
    id: '2',
    type: 'generation',
    title: 'Hero Image Generation',
    description: 'Generated hero image for landing page',
    status: 'completed',
    timestamp: '2025-01-03 10:15',
    duration: '45s',
    model: 'Nano Banana Pro',
    cost: 0.02,
    starred: false,
    tags: ['image', 'marketing'],
    details: { resolution: '1920x1080', format: 'PNG' }
  },
  {
    id: '3',
    type: 'workflow',
    title: 'Daily Report Generation',
    description: 'Automated daily analytics report',
    status: 'completed',
    timestamp: '2025-01-03 08:00',
    duration: '1m 12s',
    starred: false,
    tags: ['automation', 'reports'],
    details: { steps: 4, outputs: 1 }
  },
  {
    id: '4',
    type: 'code',
    title: 'API Endpoint Generation',
    description: 'Generated REST API endpoints for user management',
    status: 'completed',
    timestamp: '2025-01-02 16:45',
    duration: '2m 34s',
    model: 'GPT-4o',
    tokens: 8900,
    cost: 0.089,
    starred: true,
    tags: ['api', 'backend'],
    details: { files: 5, lines: 450 }
  },
  {
    id: '5',
    type: 'generation',
    title: 'Product Demo Video',
    description: 'Generated product demonstration video',
    status: 'failed',
    timestamp: '2025-01-02 14:30',
    duration: '3m 45s',
    model: 'Wan 2.6',
    cost: 0.15,
    starred: false,
    tags: ['video', 'demo'],
    details: { error: 'Timeout exceeded' }
  },
  {
    id: '6',
    type: 'chat',
    title: 'Database Schema Design',
    description: 'Discussed and designed database schema for new features',
    status: 'completed',
    timestamp: '2025-01-02 11:00',
    duration: '8m 15s',
    model: 'Claude 3.5 Sonnet',
    tokens: 6780,
    cost: 0.068,
    starred: false,
    tags: ['database', 'design'],
    details: { messages: 18, diagrams: 2 }
  },
  {
    id: '7',
    type: 'workflow',
    title: 'Code Review Automation',
    description: 'Automated code review for PR #142',
    status: 'completed',
    timestamp: '2025-01-02 09:30',
    duration: '2m 01s',
    starred: false,
    tags: ['automation', 'code-review'],
    details: { comments: 5, suggestions: 3 }
  },
  {
    id: '8',
    type: 'generation',
    title: 'TTS Audio Generation',
    description: 'Generated voiceover for tutorial',
    status: 'cancelled',
    timestamp: '2025-01-01 15:20',
    duration: '30s',
    model: 'ElevenLabs',
    cost: 0.01,
    starred: false,
    tags: ['audio', 'tutorial'],
    details: { reason: 'User cancelled' }
  },
];

// Sub-components
const TypeIcon: React.FC<{ type: HistoryItem['type']; className?: string }> = ({ type, className = 'w-5 h-5' }) => {
  const icons = {
    chat: <MessageSquare className={className} />,
    generation: <Image className={className} />,
    workflow: <Zap className={className} />,
    code: <Code className={className} />
  };
  return icons[type];
};

const StatusBadge: React.FC<{ status: HistoryItem['status'] }> = ({ status }) => {
  const config = {
    completed: { icon: CheckCircle, color: 'bg-green-100 text-green-600', label: 'Completed' },
    failed: { icon: XCircle, color: 'bg-red-100 text-red-600', label: 'Failed' },
    cancelled: { icon: AlertCircle, color: 'bg-yellow-100 text-yellow-600', label: 'Cancelled' }
  };
  const { icon: Icon, color, label } = config[status];
  
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};

const HistoryCard: React.FC<{
  item: HistoryItem;
  expanded: boolean;
  onToggle: () => void;
  onStar: () => void;
  onDelete: () => void;
}> = ({ item, expanded, onToggle, onStar, onDelete }) => {
  const typeColors = {
    chat: 'from-blue-500 to-cyan-500',
    generation: 'from-pink-500 to-purple-500',
    workflow: 'from-orange-500 to-yellow-500',
    code: 'from-green-500 to-emerald-500'
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Main Row */}
      <div 
        className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${typeColors[item.type]} flex items-center justify-center text-white flex-shrink-0`}>
            <TypeIcon type={item.type} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">{item.title}</h3>
                  {item.starred && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{item.description}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>

            {/* Meta */}
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {item.timestamp}
              </span>
              <span className="flex items-center gap-1">
                <Timer className="w-3 h-3" />
                {item.duration}
              </span>
              {item.model && (
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  {item.model}
                </span>
              )}
              {item.cost !== undefined && (
                <span className="flex items-center gap-1">
                  ${item.cost.toFixed(3)}
                </span>
              )}
            </div>

            {/* Tags */}
            {item.tags.length > 0 && (
              <div className="flex items-center gap-1 mt-2">
                {item.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Expand Icon */}
          <div className="flex-shrink-0">
            {expanded ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
          <div className="pt-4">
            {/* Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {item.tokens !== undefined && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Tokens</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{item.tokens.toLocaleString()}</p>
                </div>
              )}
              {item.details?.messages !== undefined && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Messages</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{item.details.messages}</p>
                </div>
              )}
              {item.details?.files !== undefined && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Files</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{item.details.files}</p>
                </div>
              )}
              {item.details?.steps !== undefined && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Steps</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{item.details.steps}</p>
                </div>
              )}
              {item.details?.resolution && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Resolution</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{item.details.resolution}</p>
                </div>
              )}
              {item.details?.error && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-red-500">Error</p>
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">{item.details.error}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm">
                  <Eye className="w-4 h-4" />
                  View Details
                </button>
                <button className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm">
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
                {item.type === 'chat' && (
                  <button className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm">
                    <RefreshCw className="w-4 h-4" />
                    Continue
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); onStar(); }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {item.starred ? (
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                  ) : (
                    <StarOff className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Main component
export const HistoryView: React.FC = () => {
  const [history, setHistory] = useState<HistoryItem[]>(mockHistory);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const filteredHistory = history.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = selectedType === 'all' || item.type === selectedType;
    const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const handleStar = (id: string) => {
    setHistory(prev => prev.map(item => 
      item.id === id ? { ...item, starred: !item.starred } : item
    ));
  };

  const handleDelete = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const stats = {
    total: history.length,
    completed: history.filter(h => h.status === 'completed').length,
    totalCost: history.reduce((acc, h) => acc + (h.cost || 0), 0),
    totalTokens: history.reduce((acc, h) => acc + (h.tokens || 0), 0)
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">History</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">View your activity history</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Items</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Completed</p>
            <p className="text-xl font-bold text-green-600">{stats.completed}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Cost</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">${stats.totalCost.toFixed(2)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Tokens</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.totalTokens.toLocaleString()}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Types</option>
            <option value="chat">Chat</option>
            <option value="generation">Generation</option>
            <option value="workflow">Workflow</option>
            <option value="code">Code</option>
          </select>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-3">
          {filteredHistory.map(item => (
            <HistoryCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onStar={() => handleStar(item.id)}
              onDelete={() => handleDelete(item.id)}
            />
          ))}

          {filteredHistory.length === 0 && (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No history found</h3>
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery ? 'Try a different search term' : 'Your activity history will appear here'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryView;
