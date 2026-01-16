/**
 * Rate Limit Status Component
 * 
 * RISK-008 FIX: Shows rate limit status and usage for LLM providers
 * Helps users understand their usage and avoid hitting limits
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Types
interface ProviderUsage {
  provider: string;
  requests_per_minute: number;
  max_requests_per_minute: number;
  daily_cost: number;
  daily_limit: number;
  monthly_cost: number;
  monthly_limit: number;
  last_request_time: number | null;
  is_rate_limited: boolean;
  retry_after_seconds: number | null;
}

interface RateLimitConfig {
  provider: string;
  requests_per_minute: number;
  daily_cost_limit: number;
  monthly_cost_limit: number;
}

type LLMProvider = 'openrouter' | 'openai' | 'anthropic' | 'deepseek' | 'google';

const PROVIDERS: { id: LLMProvider; name: string; color: string }[] = [
  { id: 'openrouter', name: 'OpenRouter', color: 'blue' },
  { id: 'openai', name: 'OpenAI', color: 'green' },
  { id: 'anthropic', name: 'Anthropic', color: 'orange' },
  { id: 'deepseek', name: 'Deepseek', color: 'purple' },
  { id: 'google', name: 'Google AI', color: 'red' },
];

// Progress Bar Component
function ProgressBar({ 
  value, 
  max, 
  color = 'blue',
  showLabel = true,
  size = 'md'
}: { 
  value: number; 
  max: number; 
  color?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const isWarning = percent >= 80;
  const isDanger = percent >= 95;
  
  const colorClass = isDanger 
    ? 'bg-red-500' 
    : isWarning 
      ? 'bg-amber-500' 
      : `bg-${color}-500`;
  
  const heightClass = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-4' : 'h-2.5';

  return (
    <div className="w-full">
      <div className={`w-full bg-gray-200 rounded-full ${heightClass} overflow-hidden`}>
        <div 
          className={`${colorClass} ${heightClass} rounded-full transition-all duration-300`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{value.toFixed(2)}</span>
          <span>{percent.toFixed(0)}%</span>
          <span>{max.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

// Provider Card Component
function ProviderCard({ 
  provider, 
  usage,
  onConfigChange
}: { 
  provider: { id: LLMProvider; name: string; color: string };
  usage: ProviderUsage | null;
  onConfigChange: (config: RateLimitConfig) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [config, setConfig] = useState<RateLimitConfig>({
    provider: provider.id,
    requests_per_minute: usage?.max_requests_per_minute || 60,
    daily_cost_limit: usage?.daily_limit || 20,
    monthly_cost_limit: usage?.monthly_limit || 200,
  });

  const handleSave = () => {
    onConfigChange(config);
    setIsEditing(false);
  };

  if (!usage) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-gray-400">{provider.name}</h4>
          <span className="text-xs text-gray-400">Not configured</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg p-4 ${
      usage.is_rate_limited 
        ? 'border-red-300 bg-red-50' 
        : 'border-gray-200 bg-white'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <h4 className="font-medium text-gray-900">{provider.name}</h4>
          {usage.is_rate_limited && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
              Rate Limited
              {usage.retry_after_seconds && ` (${usage.retry_after_seconds}s)`}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Edit Mode */}
      {isEditing ? (
        <div className="space-y-3 border-t pt-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Requests per minute</label>
            <input
              type="number"
              value={config.requests_per_minute}
              onChange={(e) => setConfig({ ...config, requests_per_minute: parseInt(e.target.value) || 0 })}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Daily cost limit ($)</label>
            <input
              type="number"
              step="0.01"
              value={config.daily_cost_limit}
              onChange={(e) => setConfig({ ...config, daily_cost_limit: parseFloat(e.target.value) || 0 })}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Monthly cost limit ($)</label>
            <input
              type="number"
              step="0.01"
              value={config.monthly_cost_limit}
              onChange={(e) => setConfig({ ...config, monthly_cost_limit: parseFloat(e.target.value) || 0 })}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="flex-1 px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Usage Display */
        <div className="space-y-3">
          {/* Requests per minute */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Requests/min</span>
              <span>{usage.requests_per_minute} / {usage.max_requests_per_minute}</span>
            </div>
            <ProgressBar 
              value={usage.requests_per_minute} 
              max={usage.max_requests_per_minute}
              color={provider.color}
              showLabel={false}
              size="sm"
            />
          </div>

          {/* Daily Cost */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Daily Cost</span>
              <span>${usage.daily_cost.toFixed(2)} / ${usage.daily_limit.toFixed(2)}</span>
            </div>
            <ProgressBar 
              value={usage.daily_cost} 
              max={usage.daily_limit}
              color={provider.color}
              showLabel={false}
              size="sm"
            />
          </div>

          {/* Monthly Cost */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Monthly Cost</span>
              <span>${usage.monthly_cost.toFixed(2)} / ${usage.monthly_limit.toFixed(2)}</span>
            </div>
            <ProgressBar 
              value={usage.monthly_cost} 
              max={usage.monthly_limit}
              color={provider.color}
              showLabel={false}
              size="sm"
            />
          </div>

          {/* Last Request */}
          {usage.last_request_time && (
            <div className="text-xs text-gray-400 pt-1 border-t">
              Last request: {new Date(usage.last_request_time * 1000).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Main Component
export function RateLimitStatus() {
  const [usageData, setUsageData] = useState<Record<string, ProviderUsage>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchUsage = useCallback(async () => {
    try {
      const data = await invoke<Record<string, ProviderUsage>>('get_all_rate_limit_status');
      setUsageData(data);
      setError(null);
    } catch (e) {
      console.error('Failed to fetch rate limit status:', e);
      setError('Failed to load rate limit data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    
    // Auto-refresh every 10 seconds if enabled
    let interval: any = null;
    if (autoRefresh) {
      interval = setInterval(fetchUsage, 10000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchUsage, autoRefresh]);

  const handleConfigChange = async (config: RateLimitConfig) => {
    try {
      await invoke('update_rate_limit_config', { config });
      await fetchUsage();
    } catch (e) {
      console.error('Failed to update config:', e);
      setError('Failed to update configuration');
    }
  };

  const _handleResetUsage = async (provider: string) => {
    if (!confirm(`Reset usage statistics for ${provider}?`)) return;
    
    try {
      await invoke('reset_provider_usage', { provider });
      await fetchUsage();
    } catch (e) {
      console.error('Failed to reset usage:', e);
    }
  };

  // Calculate totals
  const totalDailyCost = Object.values(usageData).reduce((sum, u) => sum + u.daily_cost, 0);
  const totalMonthlyCost = Object.values(usageData).reduce((sum, u) => sum + u.monthly_cost, 0);
  const anyRateLimited = Object.values(usageData).some(u => u.is_rate_limited);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Rate Limit Status</h3>
          <p className="text-sm text-gray-500">Monitor your API usage and costs</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-2"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchUsage}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Rate Limited Warning */}
      {anyRateLimited && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h4 className="text-amber-800 font-medium">Rate Limit Active</h4>
              <p className="text-amber-700 text-sm mt-1">
                One or more providers are currently rate limited. Please wait or switch to a different provider.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
          <div className="text-sm text-blue-600 font-medium">Today's Cost</div>
          <div className="text-2xl font-bold text-blue-900">${totalDailyCost.toFixed(2)}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
          <div className="text-sm text-purple-600 font-medium">This Month</div>
          <div className="text-2xl font-bold text-purple-900">${totalMonthlyCost.toFixed(2)}</div>
        </div>
      </div>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PROVIDERS.map(provider => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            usage={usageData[provider.id] || null}
            onConfigChange={handleConfigChange}
          />
        ))}
      </div>

      {/* Info */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
        <p>
          <strong>Tip:</strong> Click the gear icon on any provider card to adjust rate limits.
          Higher limits allow more requests but may increase costs.
        </p>
      </div>
    </div>
  );
}

/**
 * Compact Rate Limit Badge
 * Shows a small indicator of rate limit status
 */
export function RateLimitBadge({ provider }: { provider: LLMProvider }) {
  const [status, setStatus] = useState<ProviderUsage | null>(null);

  useEffect(() => {
    invoke<ProviderUsage>('get_provider_rate_limit_status', { provider })
      .then(setStatus)
      .catch(console.error);
  }, [provider]);

  if (!status) return null;

  const dailyPercent = (status.daily_cost / status.daily_limit) * 100;
  const isWarning = dailyPercent >= 80 || status.is_rate_limited;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      status.is_rate_limited 
        ? 'bg-red-100 text-red-800'
        : isWarning
          ? 'bg-amber-100 text-amber-800'
          : 'bg-green-100 text-green-800'
    }`}>
      {status.is_rate_limited ? (
        <>
          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Limited
        </>
      ) : (
        <>
          ${status.daily_cost.toFixed(2)}/${status.daily_limit}
        </>
      )}
    </span>
  );
}

export default RateLimitStatus;
