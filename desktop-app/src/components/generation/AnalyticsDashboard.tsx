/**
 * Analytics Dashboard for Media Generation
 * Shows statistics, trends, and usage patterns
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  TrendingUp, Image as ImageIcon, Video as VideoIcon,
  Music as MusicIcon, DollarSign, CheckCircle, XCircle,
  Clock, BarChart3
} from 'lucide-react';

interface AnalyticsData {
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  processing_tasks: number;
  total_credits_used: number;
  by_media_type: Record<string, number>;
  by_model: Record<string, number>;
  recent_activity: Array<{
    task_id: string;
    media_type: string;
    status: string;
    credits_used: number;
    created_at: string;
  }>;
}

interface AnalyticsDashboardProps {
  days?: number;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ days = 30 }) => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [days]);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      // Mock data for now - replace with actual API call
      const mockData: AnalyticsData = {
        total_tasks: 156,
        completed_tasks: 142,
        failed_tasks: 8,
        processing_tasks: 6,
        total_credits_used: 3840,
        by_media_type: {
          image: 89,
          video: 45,
          audio: 22,
        },
        by_model: {
          'dall-e-3': 45,
          'midjourney-v6': 44,
          'runway-gen2': 35,
          'elevenlabs-tts': 22,
          'grok-imagine': 10,
        },
        recent_activity: [
          {
            task_id: 'task_1',
            media_type: 'image',
            status: 'completed',
            credits_used: 40,
            created_at: new Date().toISOString(),
          },
          // ... more items
        ],
      };

      setAnalytics(mockData);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const successRate = analytics.total_tasks > 0
    ? ((analytics.completed_tasks / analytics.total_tasks) * 100).toFixed(1)
    : '0';

  const avgCreditsPerTask = analytics.completed_tasks > 0
    ? (analytics.total_credits_used / analytics.completed_tasks).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total Tasks</p>
                <p className="text-2xl font-bold text-white">{analytics.total_tasks}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-500" />
            </div>
            <p className="text-xs text-slate-500 mt-2">Last {days} days</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Success Rate</p>
                <p className="text-2xl font-bold text-green-500">{successRate}%</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {analytics.completed_tasks} completed
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Credits Used</p>
                <p className="text-2xl font-bold text-yellow-500">
                  {analytics.total_credits_used.toLocaleString()}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-yellow-500" />
            </div>
            <p className="text-xs text-slate-500 mt-2">Avg: {avgCreditsPerTask} per task</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Processing</p>
                <p className="text-2xl font-bold text-blue-500">{analytics.processing_tasks}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-500 animate-pulse" />
            </div>
            <p className="text-xs text-slate-500 mt-2">{analytics.failed_tasks} failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Media Type */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">By Media Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(analytics.by_media_type).map(([type, count]) => {
                const percentage = ((count / analytics.total_tasks) * 100).toFixed(1);
                const Icon = type === 'image' ? ImageIcon : type === 'video' ? VideoIcon : MusicIcon;
                const color = type === 'image' ? 'bg-blue-500' : type === 'video' ? 'bg-purple-500' : 'bg-green-500';

                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-300 capitalize">{type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400">{count}</span>
                        <span className="text-xs text-slate-500">({percentage}%)</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* By Model */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Top Models</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(analytics.by_model)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([model, count]) => {
                  const percentage = ((count / analytics.total_tasks) * 100).toFixed(1);

                  return (
                    <div key={model}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-slate-300">{model}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-400">{count}</span>
                          <span className="text-xs text-slate-500">({percentage}%)</span>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analytics.recent_activity.slice(0, 10).map((activity) => {
              const statusIcon =
                activity.status === 'completed' ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : activity.status === 'failed' ? (
                  <XCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <Clock className="w-4 h-4 text-yellow-500" />
                );

              const mediaIcon =
                activity.media_type === 'image' ? (
                  <ImageIcon className="w-4 h-4" />
                ) : activity.media_type === 'video' ? (
                  <VideoIcon className="w-4 h-4" />
                ) : (
                  <MusicIcon className="w-4 h-4" />
                );

              return (
                <div
                  key={activity.task_id}
                  className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg hover:bg-slate-900 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {statusIcon}
                    {mediaIcon}
                    <div>
                      <p className="text-sm text-slate-300 capitalize">{activity.media_type}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(activity.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">{activity.credits_used} credits</p>
                    <p className="text-xs text-slate-500 capitalize">{activity.status}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsDashboard;
