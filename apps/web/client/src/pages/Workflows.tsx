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
    statusFilter === 'all' ? {} : { status: statusFilter }
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
      pending: 'รอดำเนินการ',
      running: 'กำลังทำงาน',
      completed: 'เสร็จสมบูรณ์',
      failed: 'ล้มเหลว',
      cancelled: 'ยกเลิก',
    };
    return labels[status] || status;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <GitBranch className="h-8 w-8" />
              Workflows
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              สร้างและจัดการเวิร์กโฟลว์อัตโนมัติ
            </p>
          </div>
          <Button
            onClick={() => setLocation('/workflows/editor')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-5 w-5" />
            สร้างเวิร์กโฟลว์ใหม่
          </Button>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหาเวิร์กโฟลว์..."
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
                <option value="all">ทั้งหมด</option>
                <option value="running">กำลังทำงาน</option>
                <option value="completed">เสร็จสมบูรณ์</option>
                <option value="failed">ล้มเหลว</option>
                <option value="pending">รอดำเนินการ</option>
                <option value="cancelled">ยกเลิก</option>
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
                ? 'ไม่พบเวิร์กโฟลว์'
                : 'ยังไม่มีเวิร์กโฟลว์'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {searchQuery || statusFilter !== 'all'
                ? 'ลองค้นหาด้วยคำอื่นหรือเปลี่ยนตัวกรอง'
                : 'เริ่มสร้างเวิร์กโฟลว์แรกของคุณเพื่อทำงานอัตโนมัติ'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button
                onClick={() => setLocation('/workflows/editor')}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white mx-auto"
              >
                <Plus className="h-5 w-5" />
                สร้างเวิร์กโฟลว์ใหม่
              </Button>
            )}
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">ทั้งหมด</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {workflows.length}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">กำลังทำงาน</div>
            <div className="text-2xl font-bold text-blue-600">
              {workflows.filter((w: Workflow) => w.status === 'running').length}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">สำเร็จ</div>
            <div className="text-2xl font-bold text-green-600">
              {workflows.filter((w: Workflow) => w.status === 'completed').length}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">ล้มเหลว</div>
            <div className="text-2xl font-bold text-red-600">
              {workflows.filter((w: Workflow) => w.status === 'failed').length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
