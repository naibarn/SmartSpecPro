// ========================================
// ApprovalCard Component
// ========================================
//
// This component displays an approval request from a workflow,
// allowing users to approve, reject, or edit the generated artifact.

import { useState } from 'react';
import { Check, X, Edit3, Eye, FileText, Film, Music, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

// ========================================
// Types
// ========================================

export interface ApprovalRequest {
  workflow_id: string;
  artifact_type: string;
  artifact_path: string;
  preview: string;
  next_command: string;
}

interface ApprovalCardProps {
  approval: ApprovalRequest;
  onApprove: () => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onEdit?: () => void;
  isLoading?: boolean;
}

// ========================================
// Helper Functions
// ========================================

function getArtifactIcon(type: string) {
  switch (type.toLowerCase()) {
    case 'spec':
    case 'plan':
    case 'tasks':
      return <FileText className="w-5 h-5" />;
    case 'video':
      return <Film className="w-5 h-5" />;
    case 'audio':
      return <Music className="w-5 h-5" />;
    default:
      return <FileText className="w-5 h-5" />;
  }
}

function getArtifactTitle(type: string): string {
  switch (type.toLowerCase()) {
    case 'spec':
      return 'Specification Document';
    case 'plan':
      return 'Development Plan';
    case 'tasks':
      return 'Task List';
    case 'code':
      return 'Generated Code';
    case 'test':
      return 'Test Results';
    default:
      return `Generated ${type}`;
  }
}

function getArtifactDescription(type: string): string {
  switch (type.toLowerCase()) {
    case 'spec':
      return 'ระบบได้สร้าง Specification Document เรียบร้อยแล้ว กรุณาตรวจสอบและอนุมัติเพื่อดำเนินการต่อ';
    case 'plan':
      return 'ระบบได้สร้าง Development Plan เรียบร้อยแล้ว กรุณาตรวจสอบและอนุมัติเพื่อเริ่มสร้าง Tasks';
    case 'tasks':
      return 'ระบบได้สร้าง Task List เรียบร้อยแล้ว กรุณาตรวจสอบและอนุมัติเพื่อเริ่ม Implementation';
    case 'code':
      return 'ระบบได้สร้าง Code เรียบร้อยแล้ว กรุณาตรวจสอบและอนุมัติเพื่อดำเนินการทดสอบ';
    case 'test':
      return 'การทดสอบเสร็จสิ้นแล้ว กรุณาตรวจสอบผลลัพธ์และอนุมัติเพื่อดำเนินการต่อ';
    default:
      return 'กรุณาตรวจสอบและอนุมัติเพื่อดำเนินการต่อ';
  }
}

// ========================================
// Component
// ========================================

export function ApprovalCard({
  approval,
  onApprove,
  onReject,
  onEdit,
  isLoading = false,
}: ApprovalCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await onApprove();
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await onReject(rejectReason || undefined);
      setShowRejectDialog(false);
      setRejectReason('');
    } finally {
      setIsRejecting(false);
    }
  };

  const artifactTitle = getArtifactTitle(approval.artifact_type);
  const artifactDescription = getArtifactDescription(approval.artifact_type);

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-100/50 dark:bg-blue-800/30 border-b border-blue-200 dark:border-blue-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500 text-white rounded-lg">
            {getArtifactIcon(approval.artifact_type)}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {artifactTitle}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {approval.artifact_path}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-blue-200 dark:hover:bg-blue-700 rounded-lg transition-colors"
        >
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          )}
        </button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Description */}
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {artifactDescription}
          </p>

          {/* Preview */}
          {approval.preview && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <Eye className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Preview
                </span>
              </div>
              <pre className="p-3 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto max-h-64 overflow-y-auto font-mono whitespace-pre-wrap">
                {approval.preview}
              </pre>
            </div>
          )}

          {/* Reject Dialog */}
          {showRejectDialog && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 space-y-3">
              <label className="block text-sm font-medium text-red-700 dark:text-red-300">
                เหตุผลในการปฏิเสธ (ไม่บังคับ)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="ระบุเหตุผลหรือสิ่งที่ต้องการแก้ไข..."
                className="w-full px-3 py-2 text-sm border border-red-300 dark:border-red-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleReject}
                  disabled={isRejecting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {isRejecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <X className="w-4 h-4" />
                  )}
                  ยืนยันปฏิเสธ
                </button>
                <button
                  onClick={() => setShowRejectDialog(false)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {!showRejectDialog && (
            <div className="flex gap-3">
              <button
                onClick={handleApprove}
                disabled={isLoading || isApproving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors shadow-sm"
              >
                {isApproving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Check className="w-5 h-5" />
                )}
                อนุมัติ
              </button>
              
              {onEdit && (
                <button
                  onClick={onEdit}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-400 text-white rounded-lg font-medium transition-colors shadow-sm"
                >
                  <Edit3 className="w-5 h-5" />
                  แก้ไข
                </button>
              )}
              
              <button
                onClick={() => setShowRejectDialog(true)}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition-colors shadow-sm"
              >
                <X className="w-5 h-5" />
                ปฏิเสธ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ========================================
// Workflow Progress Component
// ========================================

interface WorkflowProgressProps {
  workflowName: string;
  currentStep: string;
  progress: number;
  logs: Array<{ level: string; message: string; timestamp: Date }>;
  onStop?: () => void;
}

export function WorkflowProgress({
  workflowName,
  currentStep,
  progress,
  logs,
  onStop,
}: WorkflowProgressProps) {
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-700 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-purple-100/50 dark:bg-purple-800/30 border-b border-purple-200 dark:border-purple-700">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Loader2 className="w-6 h-6 text-purple-600 dark:text-purple-400 animate-spin" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              กำลังรัน: {workflowName}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {currentStep || 'กำลังเริ่มต้น...'}
            </p>
          </div>
        </div>
        {onStop && (
          <button
            onClick={onStop}
            className="px-3 py-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium transition-colors"
          >
            หยุด
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            ความคืบหน้า
          </span>
          <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
            {Math.round(progress * 100)}%
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Logs Toggle */}
      {logs.length > 0 && (
        <div className="border-t border-purple-200 dark:border-purple-700">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full flex items-center justify-between px-4 py-2 hover:bg-purple-100/50 dark:hover:bg-purple-800/30 transition-colors"
          >
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Logs ({logs.length})
            </span>
            {showLogs ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>
          
          {showLogs && (
            <div className="px-4 pb-3 max-h-48 overflow-y-auto">
              {logs.slice(-20).map((log, index) => (
                <div
                  key={index}
                  className={`text-xs font-mono py-0.5 ${
                    log.level === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {log.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
