// Quality Report Component
// Display code quality analysis results

import { useEffect } from 'react';
import {
  useAi,
  QualityReport as QualityReportType,
  QualityCategory,
  QualityIssue,
  getImpactColor,
  getScoreColor,
} from '../../services/aiService';

interface QualityReportProps {
  projectId: string;
  className?: string;
}

export function QualityReport({ projectId, className = '' }: QualityReportProps) {
  const { qualityReport, isAnalyzing, error, loadQualityReport, runQualityAnalysis } = useAi();

  useEffect(() => {
    loadQualityReport(projectId);
  }, [projectId, loadQualityReport]);

  if (isAnalyzing) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Analyzing code quality...</p>
        </div>
      </div>
    );
  }

  if (!qualityReport) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${className}`}>
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          No Quality Report
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Run a quality analysis to see insights about your code
        </p>
        <button
          onClick={() => runQualityAnalysis(projectId, [])}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Run Analysis
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 overflow-y-auto ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Quality Report
          </h2>
          <button
            onClick={() => runQualityAnalysis(projectId, [])}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Re-analyze
          </button>
        </div>

        {/* Overall Score */}
        <div className="flex items-center gap-6">
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-gray-200 dark:text-gray-700"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${qualityReport.overall_score * 2.51} 251`}
                className={getScoreColor(qualityReport.overall_score)}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-2xl font-bold ${getScoreColor(qualityReport.overall_score)}`}>
                {Math.round(qualityReport.overall_score)}
              </span>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Overall Score
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {qualityReport.overall_score >= 80 ? 'Excellent' :
               qualityReport.overall_score >= 60 ? 'Good' :
               qualityReport.overall_score >= 40 ? 'Needs Improvement' : 'Poor'}
            </p>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
          Categories
        </h3>
        <div className="space-y-3">
          {qualityReport.categories.map((category) => (
            <CategoryBar key={category.name} category={category} />
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
          Metrics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <MetricCard
            label="Lines of Code"
            value={qualityReport.metrics.lines_of_code.toLocaleString()}
          />
          <MetricCard
            label="Complexity"
            value={qualityReport.metrics.complexity.toFixed(1)}
          />
          <MetricCard
            label="Maintainability"
            value={`${qualityReport.metrics.maintainability.toFixed(0)}%`}
          />
          {qualityReport.metrics.code_coverage !== undefined && (
            <MetricCard
              label="Code Coverage"
              value={`${qualityReport.metrics.code_coverage.toFixed(1)}%`}
            />
          )}
          <MetricCard
            label="Documentation"
            value={`${qualityReport.metrics.documentation_coverage.toFixed(0)}%`}
          />
          <MetricCard
            label="Tests"
            value={qualityReport.metrics.test_count.toString()}
          />
        </div>
      </div>

      {/* Issues */}
      {qualityReport.issues.length > 0 && (
        <div className="p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
            Issues ({qualityReport.issues.length})
          </h3>
          <div className="space-y-3">
            {qualityReport.issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Category Bar
// ============================================

function CategoryBar({ category }: { category: QualityCategory }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-700 dark:text-gray-300">{category.name}</span>
        <span className={`text-sm font-medium ${getScoreColor(category.score)}`}>
          {Math.round(category.score)}
        </span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            category.score >= 80 ? 'bg-green-500' :
            category.score >= 60 ? 'bg-yellow-500' :
            category.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
          }`}
          style={{ width: `${category.score}%` }}
        />
      </div>
    </div>
  );
}

// ============================================
// Metric Card
// ============================================

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

// ============================================
// Issue Card
// ============================================

function IssueCard({ issue }: { issue: QualityIssue }) {
  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div className="flex items-start gap-3">
        <span className={`px-2 py-0.5 text-xs rounded ${getImpactColor(issue.severity)}`}>
          {issue.severity}
        </span>
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 dark:text-white text-sm">
            {issue.title}
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {issue.description}
          </p>
          {issue.file_path && (
            <p className="text-xs text-gray-500 mt-1">
              📄 {issue.file_path}
              {issue.line && `:${issue.line}`}
            </p>
          )}
          {issue.suggestion && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
              💡 {issue.suggestion}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default QualityReport;
