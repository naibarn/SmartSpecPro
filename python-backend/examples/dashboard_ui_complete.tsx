/**
 * Complete Dashboard UI - React/TypeScript
 * 
 * Comprehensive dashboard implementation for SmartSpec Pro
 * Includes all components: summary, charts, transactions, etc.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

// Types
interface Balance {
  credits: number;
  usd: number;
  last_updated: string | null;
}

interface Statistics {
  total_spent_usd: number;
  total_credits_purchased: number;
  total_credits_used: number;
  total_requests: number;
  avg_cost_per_request: number;
  current_month_spending: number;
  last_30_days_usage: number;
}

interface DashboardSummary {
  balance: Balance;
  stats: Statistics;
}

interface DailyUsage {
  date: string;
  credits_used: number;
  requests: number;
  cost_usd: number;
}

interface Transaction {
  id: string;
  type: string;
  date: string | null;
  amount_usd: number;
  credits: number;
  status: string;
  description: string;
}

// Colors
const COLORS = {
  primary: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  gray: '#6B7280'
};

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// Main Dashboard Component
export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [usageData, setUsageData] = useState<DailyUsage[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(30);

  useEffect(() => {
    loadDashboardData();
  }, [timeRange]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadSummary(),
        loadUsage(),
        loadTransactions()
      ]);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    const response = await api.get<DashboardSummary>('/api/dashboard/summary');
    setSummary(response.data);
  };

  const loadUsage = async () => {
    const response = await api.get(`/api/dashboard/usage?days=${timeRange}`);
    setUsageData(response.data.daily_usage);
  };

  const loadTransactions = async () => {
    const response = await api.get('/api/dashboard/transactions?limit=10');
    setTransactions(response.data.transactions);
  };

  if (loading || !summary) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <DashboardHeader balance={summary.balance} />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <SummaryCards stats={summary.stats} />

        {/* Usage Chart */}
        <div className="mt-8">
          <UsageChart
            data={usageData}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
          />
        </div>

        {/* Transactions */}
        <div className="mt-8">
          <TransactionList transactions={transactions} />
        </div>
      </div>
    </div>
  );
};

// Dashboard Header Component
const DashboardHeader: React.FC<{ balance: Balance }> = ({ balance }) => {
  const { user } = useAuth();

  return (
    <div className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">
              Welcome back, {user?.full_name || user?.email}
            </p>
          </div>
          <div className="flex items-center gap-6">
            {/* Credit Balance */}
            <div className="text-right">
              <p className="text-sm text-gray-500">Credit Balance</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCredits(balance.credits)}
              </p>
              <p className="text-sm text-gray-500">
                {formatCurrency(balance.usd)}
              </p>
            </div>
            {/* Top-up Button */}
            <button
              onClick={() => window.location.href = '/payments'}
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Top-up Credits
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Summary Cards Component
const SummaryCards: React.FC<{ stats: Statistics }> = ({ stats }) => {
  const cards = [
    {
      title: 'Total Spent',
      value: formatCurrency(stats.total_spent_usd),
      subtitle: `${formatCredits(stats.total_credits_purchased)} credits purchased`,
      color: COLORS.primary,
      icon: '💰'
    },
    {
      title: 'Total Usage',
      value: formatCredits(stats.total_credits_used),
      subtitle: `${stats.total_requests.toLocaleString()} requests made`,
      color: COLORS.success,
      icon: '📊'
    },
    {
      title: 'Average Cost',
      value: formatCurrency(stats.avg_cost_per_request),
      subtitle: 'per request',
      color: COLORS.warning,
      icon: '📈'
    },
    {
      title: 'This Month',
      value: formatCurrency(stats.current_month_spending),
      subtitle: `${formatCredits(stats.last_30_days_usage)} used (30d)`,
      color: COLORS.error,
      icon: '📅'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-3xl">{card.icon}</span>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${card.color}20` }}
            >
              <div
                className="w-6 h-6 rounded-full"
                style={{ backgroundColor: card.color }}
              />
            </div>
          </div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">
            {card.title}
          </h3>
          <p className="text-2xl font-bold text-gray-900 mb-1">
            {card.value}
          </p>
          <p className="text-sm text-gray-500">
            {card.subtitle}
          </p>
        </div>
      ))}
    </div>
  );
};

// Usage Chart Component
const UsageChart: React.FC<{
  data: DailyUsage[];
  timeRange: 7 | 30 | 90;
  onTimeRangeChange: (range: 7 | 30 | 90) => void;
}> = ({ data, timeRange, onTimeRangeChange }) => {
  const [metric, setMetric] = useState<'credits' | 'requests' | 'cost'>('credits');

  const getYAxisKey = () => {
    switch (metric) {
      case 'credits':
        return 'credits_used';
      case 'requests':
        return 'requests';
      case 'cost':
        return 'cost_usd';
    }
  };

  const getYAxisLabel = () => {
    switch (metric) {
      case 'credits':
        return 'Credits Used';
      case 'requests':
        return 'Requests';
      case 'cost':
        return 'Cost (USD)';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Usage Over Time
        </h2>
        <div className="flex items-center gap-4">
          {/* Metric Selector */}
          <div className="flex gap-2">
            {(['credits', 'requests', 'cost'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  metric === m
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          {/* Time Range Selector */}
          <div className="flex gap-2">
            {([7, 30, 90] as const).map((range) => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  timeRange === range
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {range}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-gray-500">
          No usage data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis tick={{ fontSize: 12 }} label={{ value: getYAxisLabel(), angle: -90, position: 'insideLeft' }} />
            <Tooltip
              formatter={(value: number) => {
                if (metric === 'cost') return formatCurrency(value);
                if (metric === 'credits') return formatCredits(value);
                return value.toLocaleString();
              }}
              labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey={getYAxisKey()}
              stroke={COLORS.primary}
              strokeWidth={2}
              dot={{ fill: COLORS.primary }}
              name={getYAxisLabel()}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

// Transaction List Component
const TransactionList: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
  const [filter, setFilter] = useState<'all' | 'payment' | 'usage'>('all');

  const filteredTransactions = transactions.filter(
    (t) => filter === 'all' || t.type === filter
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    return type === 'payment' ? '💳' : '🔧';
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            Recent Transactions
          </h2>
          <div className="flex gap-2">
            {(['all', 'payment', 'usage'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-500">
          No transactions found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Credits
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTransactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {transaction.date
                      ? new Date(transaction.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="flex items-center gap-2">
                      <span>{getTypeIcon(transaction.type)}</span>
                      <span className="capitalize">{transaction.type}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {transaction.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                    <span className={transaction.amount_usd >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {transaction.amount_usd >= 0 ? '+' : ''}
                      {formatCurrency(Math.abs(transaction.amount_usd))}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                    <span className={transaction.credits >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {transaction.credits >= 0 ? '+' : ''}
                      {formatCredits(Math.abs(transaction.credits))}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(transaction.status)}`}>
                      {transaction.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-6 py-4 border-t border-gray-200">
        <button
          onClick={() => window.location.href = '/transactions'}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          View all transactions →
        </button>
      </div>
    </div>
  );
};

// Dashboard Skeleton (Loading State)
const DashboardSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-48 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-64"></div>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="h-12 bg-gray-200 rounded mb-4"></div>
              <div className="h-6 bg-gray-200 rounded mb-2"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
        <div className="mt-8 bg-white rounded-lg shadow p-6 animate-pulse">
          <div className="h-80 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  );
};

// Utility Functions
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

const formatCredits = (credits: number): string => {
  return new Intl.NumberFormat('en-US').format(credits) + ' credits';
};

export default DashboardPage;
