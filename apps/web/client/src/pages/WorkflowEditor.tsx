/**
 * Workflow Editor - Visual Flow Builder
 * Create and edit workflows using visual editor
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  GitBranch,
  Save,
  Play,
  ArrowLeft,
  Plus,
  Trash2,
  Settings,
  AlertCircle,
  Code,
  Zap,
  MessageSquare,
  CheckCircle,
  Repeat,
  GitMerge,
} from 'lucide-react';

export default function WorkflowEditor() {
  const [, setLocation] = useLocation();
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');

  const nodeTypes = [
    { id: 'llm', label: 'LLM Call', icon: MessageSquare, color: 'blue' },
    { id: 'approval', label: 'Approval Gate', icon: CheckCircle, color: 'yellow' },
    { id: 'conditional', label: 'Conditional', icon: GitMerge, color: 'purple' },
    { id: 'loop', label: 'Loop', icon: Repeat, color: 'green' },
    { id: 'generate_image', label: 'Generate Image', icon: Zap, color: 'pink' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => setLocation('/workflows')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-5 w-5" />
              กลับ
            </Button>
            <div className="h-8 w-px bg-gray-300 dark:bg-gray-600"></div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <GitBranch className="h-6 w-6" />
                {workflowName || 'เวิร์กโฟลว์ใหม่'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              ตั้งค่า
            </Button>
            <Button
              variant="outline"
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              บันทึก
            </Button>
            <Button
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Play className="h-4 w-4" />
              รันทดสอบ
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* ReactFlow Installation Notice */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-4">
            <Code className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Visual Flow Editor
              </h3>
              <p className="text-blue-800 dark:text-blue-200 mb-4">
                สำหรับการใช้งาน Visual Flow Editor แบบเต็มรูปแบบ ต้องติดตั้ง ReactFlow library ก่อน:
              </p>
              <div className="bg-blue-100 dark:bg-blue-900/40 rounded-md p-3 font-mono text-sm mb-4">
                <code className="text-blue-900 dark:text-blue-100">
                  cd apps/web && pnpm add reactflow
                </code>
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                ระบบจะใช้ form editor แบบง่ายในตอนนี้ หรือคุณสามารถสร้าง workflow ผ่าน JSON editor ได้
              </p>
            </div>
          </div>
        </div>

        {/* Basic Form Editor */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Node Palette */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Plus className="h-4 w-4" />
                โหนด (Nodes)
              </h3>
              <div className="space-y-2">
                {nodeTypes.map((node) => {
                  const Icon = node.icon;
                  return (
                    <button
                      key={node.id}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border-2 border-${node.color}-200 dark:border-${node.color}-800 bg-${node.color}-50 dark:bg-${node.color}-900/20 hover:bg-${node.color}-100 dark:hover:bg-${node.color}-900/30 transition-colors`}
                    >
                      <Icon className={`h-5 w-5 text-${node.color}-600 dark:text-${node.color}-400`} />
                      <span className={`text-sm font-medium text-${node.color}-900 dark:text-${node.color}-100`}>
                        {node.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                  วิธีใช้งาน:
                </h4>
                <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <li>1. คลิกโหนดเพื่อเพิ่มลง Canvas</li>
                  <li>2. เชื่อมโหนดด้วยการลากเส้น</li>
                  <li>3. กำหนดค่าแต่ละโหนด</li>
                  <li>4. บันทึกและทดสอบ</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Main Editor Area */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  ชื่อเวิร์กโฟลว์
                </label>
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="เช่น สร้างโพสต์โซเชียลพร้อมรูปภาพ"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  คำอธิบาย
                </label>
                <textarea
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                  placeholder="อธิบายสิ่งที่เวิร์กโฟลว์นี้ทำ..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Canvas Placeholder */}
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-12 text-center">
                <GitBranch className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Visual Flow Canvas
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  ลากโหนดจากด้านซ้ายมาวางที่นี่เพื่อสร้างเวิร์กโฟลว์
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  (ต้องติดตั้ง ReactFlow เพื่อใช้งานส่วนนี้)
                </p>
              </div>

              {/* JSON Editor Alternative */}
              <div className="mt-6">
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    แก้ไขแบบ JSON (สำหรับผู้ใช้ขั้นสูง)
                  </summary>
                  <div className="mt-4">
                    <textarea
                      placeholder={JSON.stringify(
                        {
                          name: workflowName || 'my-workflow',
                          version: '1.0.0',
                          nodes: [],
                          edges: [],
                        },
                        null,
                        2
                      )}
                      rows={15}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
