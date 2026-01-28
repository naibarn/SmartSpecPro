/**
 * Credits Page - SmartSpec Pro
 * Credit management and purchase interface
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
  Zap,
  CreditCard,
  ChevronLeft,
  Check,
  TrendingUp,
  Clock,
  DollarSign,
  Package,
  Star,
  Sparkles,
  ArrowRight,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react';

export default function Credits() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Fetch real data from API
  const { data: balance } = trpc.credits.balance.useQuery();
  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = trpc.credits.history.useQuery({
    limit: pageSize,
    offset: page * pageSize,
  });
  const { data: usageStats } = trpc.credits.stats.useQuery({ days: 30 });
  const { data: packages, isLoading: packagesLoading } = trpc.packages.list.useQuery();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Format number with commas
  const formatNumber = (num: number) => num.toLocaleString();

  // Format date and time for display
  const formatDateTime = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago (${timeStr})`;
    if (diffDays === 1) return `Yesterday ${timeStr}`;
    if (diffDays < 7) return `${diffDays}d ago ${timeStr}`;
    return `${d.toLocaleDateString('th-TH')} ${timeStr}`;
  };

  const stats = [
    {
      label: 'Current Balance',
      value: (balance?.credits ?? user.credits ?? 0).toString(),
      icon: Zap,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50',
    },
    {
      label: 'Total Purchased',
      value: (usageStats?.totalPurchased ?? 0).toString(),
      icon: Package,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Transactions',
      value: (usageStats?.transactionCount ?? 0).toString(),
      icon: DollarSign,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Credits Used (30d)',
      value: (usageStats?.totalUsage ?? 0).toString(),
      icon: TrendingUp,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/dashboard')}
                className="text-gray-600"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Credits</h1>
                  <p className="text-sm text-gray-500">Manage your credit balance</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-yellow-50 px-4 py-2 rounded-lg">
              <Zap className="w-4 h-4 text-yellow-500" />
              <span className="font-semibold text-gray-900">{user.credits ?? 0}</span>
              <span className="text-sm text-gray-500">credits</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          {stats.map((stat, index) => (
            <div
              key={index}
              className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 p-6 shadow-lg shadow-purple-500/5"
            >
              <div className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center mb-4`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Credit Packages */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Buy Credits</h2>
              <p className="text-gray-600">Choose a package that fits your needs (15% markup from base rate)</p>
            </div>
          </div>

          {packagesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : !packages || packages.length === 0 ? (
            <div className="text-center py-12 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No packages available</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {packages.map((pkg) => (
                <motion.div
                  key={pkg.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 }}
                  className={`relative bg-white/70 backdrop-blur-xl rounded-2xl border-2 p-4 shadow-lg transition-all cursor-pointer ${
                    selectedPackage === pkg.id
                      ? 'border-purple-500 shadow-purple-500/20'
                      : pkg.isFeatured
                      ? 'border-purple-300'
                      : 'border-white/50 hover:border-purple-200'
                  }`}
                  onClick={() => setSelectedPackage(pkg.id)}
                >
                  {pkg.isFeatured && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                      <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5" />
                        BEST
                      </span>
                    </div>
                  )}

                  <div className="text-center mb-3">
                    <div className={`w-12 h-12 mx-auto rounded-xl bg-gradient-to-br ${
                      pkg.isFeatured ? 'from-purple-500 to-pink-500' : 'from-green-500 to-emerald-500'
                    } flex items-center justify-center mb-3`}>
                      <DollarSign className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-0.5">
                      ${pkg.priceUsd}
                    </div>
                    <div className="text-xs text-gray-500">one-time</div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-center gap-1.5 text-gray-700">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm font-bold">{formatNumber(pkg.credits)}</span>
                    </div>
                    <div className="text-xs text-center text-gray-500">
                      ${((pkg.pricePerCredit ?? 0) * 1000).toFixed(2)}/1K credits
                    </div>
                  </div>

                  <Button
                    size="sm"
                    className={`w-full text-xs ${
                      pkg.isFeatured
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                        : 'bg-gray-900 text-white'
                    }`}
                  >
                    Buy
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Transaction History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              <h2 className="text-xl font-bold text-gray-900">Transaction History</h2>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchHistory()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 overflow-hidden">
            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              </div>
            ) : !history || history.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No transactions yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50/50 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Details
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Credits
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Balance After
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                              transaction.type === 'purchase' || transaction.type === 'bonus'
                                ? 'bg-green-100 text-green-700'
                                : transaction.type === 'usage'
                                ? 'bg-blue-100 text-blue-700'
                                : transaction.type === 'refund'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {transaction.type === 'purchase' ? (
                              <>
                                <CreditCard className="w-3 h-3" />
                                Purchase
                              </>
                            ) : transaction.type === 'usage' ? (
                              <>
                                <Zap className="w-3 h-3" />
                                Usage
                              </>
                            ) : transaction.type === 'bonus' ? (
                              <>
                                <Sparkles className="w-3 h-3" />
                                Bonus
                              </>
                            ) : (
                              <>
                                <Package className="w-3 h-3" />
                                {transaction.type}
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-gray-900">
                            {transaction.description}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {transaction.metadata && (
                            <div className="text-xs text-gray-500 space-y-0.5">
                              {transaction.metadata.model && (
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">Model:</span>
                                  <span className="text-gray-700">{String(transaction.metadata.model).split('/').pop()}</span>
                                </div>
                              )}
                              {(transaction.metadata.inputTokens || transaction.metadata.tokensUsed) && (
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">Tokens:</span>
                                  <span className="text-gray-700">
                                    {transaction.metadata.inputTokens && transaction.metadata.outputTokens
                                      ? `${transaction.metadata.inputTokens}→${transaction.metadata.outputTokens}`
                                      : transaction.metadata.tokensUsed}
                                  </span>
                                </div>
                              )}
                              {transaction.metadata.skill && (
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">Skill:</span>
                                  <span className="text-gray-700">{String(transaction.metadata.skill)}</span>
                                </div>
                              )}
                              {transaction.metadata.referenceImageCount > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">Images:</span>
                                  <span className="text-gray-700">{transaction.metadata.referenceImageCount}</span>
                                </div>
                              )}
                              {transaction.metadata.mediaType && (
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">Media:</span>
                                  <span className="text-gray-700">{String(transaction.metadata.mediaType)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-sm font-semibold ${
                              transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {transaction.amount > 0 ? '+' : ''}
                            {transaction.amount}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900">
                            {transaction.balanceAfter}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-500">
                            {formatDateTime(transaction.createdAt)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                  <div className="text-sm text-gray-500">
                    Page {page + 1} • Showing {history?.length || 0} items
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={!history || history.length < pageSize}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
