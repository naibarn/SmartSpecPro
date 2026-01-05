/**
 * SmartSpec Pro - Credits Dashboard
 * Comprehensive dashboard for credits management and usage analytics.
 */

import React, { useState, useEffect } from 'react';
import {
  Coins,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  ChevronRight,
  Sparkles,
  Image,
  Video,
  Music,
  Clock,
  AlertCircle,
} from 'lucide-react';

// Types
interface CreditsBalance {
  total_credits: number;
  used_credits: number;
  reserved_credits: number;
  available_credits: number;
  subscription_tier: string;
  monthly_allowance: number;
}

interface Transaction {
  id: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_type?: string;
  reference_id?: string;
  description?: string;
  created_at: string;
}

interface UsageSummary {
  [key: string]: {
    total_credits: number;
    count: number;
  };
}

interface DailyUsage {
  date: string;
  credits: number;
  count: number;
}

interface ModelUsage {
  model_id: string;
  total_credits: number;
  count: number;
}

// Mock API functions (replace with actual API calls)
const fetchBalance = async (): Promise<CreditsBalance> => {
  // Simulated API response
  return {
    total_credits: 500,
    used_credits: 127.5,
    reserved_credits: 3.0,
    available_credits: 369.5,
    subscription_tier: 'pro',
    monthly_allowance: 500,
  };
};

const fetchTransactions = async (): Promise<Transaction[]> => {
  return [
    {
      id: '1',
      transaction_type: 'usage',
      amount: -1.5,
      balance_before: 371,
      balance_after: 369.5,
      reference_type: 'generation_task',
      reference_id: 'task_123',
      description: 'Image generation - nano-banana-pro',
      created_at: new Date().toISOString(),
    },
    {
      id: '2',
      transaction_type: 'usage',
      amount: -5.0,
      balance_before: 376,
      balance_after: 371,
      reference_type: 'generation_task',
      reference_id: 'task_122',
      description: 'Video generation - wan-2.6',
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: '3',
      transaction_type: 'subscription',
      amount: 500,
      balance_before: 0,
      balance_after: 500,
      reference_type: 'subscription',
      reference_id: 'sub_abc',
      description: 'Pro plan monthly credits',
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ];
};

const fetchUsageSummary = async (): Promise<UsageSummary> => {
  return {
    image_generation: { total_credits: 45.5, count: 32 },
    video_generation: { total_credits: 75.0, count: 15 },
    audio_generation: { total_credits: 7.0, count: 14 },
  };
};

const fetchDailyUsage = async (): Promise<DailyUsage[]> => {
  const data: DailyUsage[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000);
    data.push({
      date: date.toISOString().split('T')[0],
      credits: Math.random() * 10 + 1,
      count: Math.floor(Math.random() * 10) + 1,
    });
  }
  return data;
};

const fetchModelUsage = async (): Promise<ModelUsage[]> => {
  return [
    { model_id: 'nano-banana-pro', total_credits: 35.5, count: 25 },
    { model_id: 'flux-2', total_credits: 10.0, count: 7 },
    { model_id: 'wan-2.6', total_credits: 75.0, count: 15 },
    { model_id: 'elevenlabs-tts', total_credits: 7.0, count: 14 },
  ];
};

// Components
const StatCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: string;
}> = ({ title, value, subtitle, icon, trend, trendValue, color = 'blue' }) => {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-500',
    green: 'bg-green-500/10 text-green-500',
    purple: 'bg-purple-500/10 text-purple-500',
    orange: 'bg-orange-500/10 text-orange-500',
    red: 'bg-red-500/10 text-red-500',
  };

  return (
    <div className="bg-[#1e1e2e] rounded-xl p-5 border border-[#313244]">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          {icon}
        </div>
        {trend && trendValue && (
          <div className={`flex items-center text-sm ${
            trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-500'
          }`}>
            {trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            <span>{trendValue}</span>
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-gray-400">{title}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
    </div>
  );
};

const UsageChart: React.FC<{ data: DailyUsage[] }> = ({ data }) => {
  const maxCredits = Math.max(...data.map(d => d.credits));
  
  return (
    <div className="bg-[#1e1e2e] rounded-xl p-5 border border-[#313244]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Daily Usage</h3>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-sm bg-[#313244] text-gray-300 rounded-lg hover:bg-[#414155]">
            7D
          </button>
          <button className="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 rounded-lg">
            30D
          </button>
          <button className="px-3 py-1.5 text-sm bg-[#313244] text-gray-300 rounded-lg hover:bg-[#414155]">
            90D
          </button>
        </div>
      </div>
      
      <div className="h-48 flex items-end gap-1">
        {data.map((day) => (
          <div
            key={day.date}
            className="flex-1 bg-blue-500/30 hover:bg-blue-500/50 rounded-t transition-colors cursor-pointer group relative"
            style={{ height: `${(day.credits / maxCredits) * 100}%`, minHeight: '4px' }}
          >
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#313244] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
              {day.credits.toFixed(1)} credits
              <br />
              {day.count} tasks
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
};

const UsageByType: React.FC<{ summary: UsageSummary }> = ({ summary }) => {
  const types = [
    { key: 'image_generation', label: 'Images', icon: <Image className="w-4 h-4" />, color: 'blue' },
    { key: 'video_generation', label: 'Videos', icon: <Video className="w-4 h-4" />, color: 'purple' },
    { key: 'audio_generation', label: 'Audio', icon: <Music className="w-4 h-4" />, color: 'green' },
  ];
  
  const total = Object.values(summary).reduce((acc, v) => acc + v.total_credits, 0);
  
  return (
    <div className="bg-[#1e1e2e] rounded-xl p-5 border border-[#313244]">
      <h3 className="text-lg font-semibold text-white mb-4">Usage by Type</h3>
      
      <div className="space-y-4">
        {types.map(type => {
          const data = summary[type.key] || { total_credits: 0, count: 0 };
          const percentage = total > 0 ? (data.total_credits / total) * 100 : 0;
          
          return (
            <div key={type.key}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded bg-${type.color}-500/20 text-${type.color}-400`}>
                    {type.icon}
                  </div>
                  <span className="text-gray-300">{type.label}</span>
                </div>
                <div className="text-right">
                  <div className="text-white font-medium">{data.total_credits.toFixed(1)}</div>
                  <div className="text-xs text-gray-500">{data.count} tasks</div>
                </div>
              </div>
              <div className="h-2 bg-[#313244] rounded-full overflow-hidden">
                <div
                  className={`h-full bg-${type.color}-500 rounded-full transition-all`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ModelUsageList: React.FC<{ models: ModelUsage[] }> = ({ models }) => {
  const total = models.reduce((acc, m) => acc + m.total_credits, 0);
  
  return (
    <div className="bg-[#1e1e2e] rounded-xl p-5 border border-[#313244]">
      <h3 className="text-lg font-semibold text-white mb-4">Top Models</h3>
      
      <div className="space-y-3">
        {models.map((model, i) => {
          const percentage = total > 0 ? (model.total_credits / total) * 100 : 0;
          
          return (
            <div key={model.model_id} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#313244] flex items-center justify-center text-xs text-gray-400">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 truncate">{model.model_id}</span>
                  <span className="text-white font-medium ml-2">{model.total_credits.toFixed(1)}</span>
                </div>
                <div className="h-1.5 bg-[#313244] rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TransactionList: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'usage': return <TrendingDown className="w-4 h-4 text-red-400" />;
      case 'purchase': return <Coins className="w-4 h-4 text-green-400" />;
      case 'subscription': return <Sparkles className="w-4 h-4 text-purple-400" />;
      case 'refund': return <RefreshCw className="w-4 h-4 text-blue-400" />;
      default: return <Coins className="w-4 h-4 text-gray-400" />;
    }
  };
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };
  
  return (
    <div className="bg-[#1e1e2e] rounded-xl p-5 border border-[#313244]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Recent Transactions</h3>
        <button className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
          View All <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      
      <div className="space-y-3">
        {transactions.map(tx => (
          <div key={tx.id} className="flex items-center gap-3 p-3 bg-[#252535] rounded-lg">
            <div className="p-2 rounded-lg bg-[#313244]">
              {getTypeIcon(tx.transaction_type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-gray-300 truncate">{tx.description}</div>
              <div className="text-xs text-gray-500">{formatDate(tx.created_at)}</div>
            </div>
            <div className={`font-medium ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(1)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Main Component
const CreditsDashboard: React.FC = () => {
  const [balance, setBalance] = useState<CreditsBalance | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary>({});
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [balanceData, txData, summaryData, dailyData, modelData] = await Promise.all([
        fetchBalance(),
        fetchTransactions(),
        fetchUsageSummary(),
        fetchDailyUsage(),
        fetchModelUsage(),
      ]);
      
      setBalance(balanceData);
      setTransactions(txData);
      setUsageSummary(summaryData);
      setDailyUsage(dailyData);
      setModelUsage(modelData);
    } catch (error) {
      console.error('Failed to load credits data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const usagePercent = balance ? (balance.used_credits / balance.total_credits) * 100 : 0;

  return (
    <div className="h-full overflow-auto p-6 bg-[#11111b]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Credits Dashboard</h1>
          <p className="text-gray-400 mt-1">Monitor your usage and manage credits</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg bg-[#1e1e2e] text-gray-400 hover:text-white hover:bg-[#313244] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center gap-2">
            <Coins className="w-4 h-4" />
            Buy Credits
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Available Credits"
          value={balance?.available_credits.toFixed(1) || '0'}
          subtitle={`of ${balance?.total_credits.toFixed(0)} total`}
          icon={<Coins className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Used This Month"
          value={balance?.used_credits.toFixed(1) || '0'}
          subtitle={`${usagePercent.toFixed(0)}% of allowance`}
          icon={<TrendingUp className="w-5 h-5" />}
          trend="up"
          trendValue="+12%"
          color="purple"
        />
        <StatCard
          title="Reserved"
          value={balance?.reserved_credits.toFixed(1) || '0'}
          subtitle="In-progress tasks"
          icon={<Clock className="w-5 h-5" />}
          color="orange"
        />
        <StatCard
          title="Subscription"
          value={(balance?.subscription_tier?.charAt(0).toUpperCase() || '') + (balance?.subscription_tier?.slice(1) || '') || 'Free'}
          subtitle={`${balance?.monthly_allowance} credits/month`}
          icon={<Sparkles className="w-5 h-5" />}
          color="green"
        />
      </div>

      {/* Usage Progress */}
      <div className="bg-[#1e1e2e] rounded-xl p-5 border border-[#313244] mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white">Monthly Usage</h3>
          <span className="text-sm text-gray-400">
            {balance?.used_credits.toFixed(1)} / {balance?.monthly_allowance} credits
          </span>
        </div>
        <div className="h-4 bg-[#313244] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-orange-500' : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-500">
            {usagePercent > 90 && (
              <span className="text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Running low on credits
              </span>
            )}
          </span>
          <span className="text-xs text-gray-500">
            Resets in 12 days
          </span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <UsageChart data={dailyUsage} />
        <UsageByType summary={usageSummary} />
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ModelUsageList models={modelUsage} />
        <TransactionList transactions={transactions} />
      </div>
    </div>
  );
};

export default CreditsDashboard;
