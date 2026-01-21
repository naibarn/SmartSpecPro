/**
 * Credits Page - SmartSpec Pro
 * Credit management and purchase interface
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
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
} from 'lucide-react';

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  popular?: boolean;
  bonus?: number;
  savings?: string;
}

interface Transaction {
  id: string;
  type: 'purchase' | 'usage';
  amount: number;
  description: string;
  date: string;
  credits: number;
}

export default function Credits() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

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

  const packages: CreditPackage[] = [
    {
      id: 'starter',
      name: 'Starter',
      credits: 100,
      price: 10,
    },
    {
      id: 'popular',
      name: 'Popular',
      credits: 500,
      price: 45,
      popular: true,
      bonus: 50,
      savings: '10%',
    },
    {
      id: 'pro',
      name: 'Pro',
      credits: 1000,
      price: 80,
      bonus: 150,
      savings: '20%',
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      credits: 5000,
      price: 350,
      bonus: 1000,
      savings: '30%',
    },
  ];

  const transactions: Transaction[] = [
    {
      id: '1',
      type: 'purchase',
      amount: 45,
      description: 'Popular Package',
      date: '2 days ago',
      credits: 500,
    },
    {
      id: '2',
      type: 'usage',
      amount: 0,
      description: 'Image Generation - Abstract Art',
      date: '2 days ago',
      credits: -10,
    },
    {
      id: '3',
      type: 'usage',
      amount: 0,
      description: 'Video Generation - Product Demo',
      date: '3 days ago',
      credits: -50,
    },
    {
      id: '4',
      type: 'purchase',
      amount: 10,
      description: 'Starter Package',
      date: '1 week ago',
      credits: 100,
    },
  ];

  const stats = [
    {
      label: 'Current Balance',
      value: (user.credits ?? 0).toString(),
      icon: Zap,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50',
    },
    {
      label: 'Total Purchased',
      value: '600',
      icon: Package,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Total Spent',
      value: '$55',
      icon: DollarSign,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Credits Used',
      value: '60',
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
              <p className="text-gray-600">Choose a package that fits your needs</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {packages.map((pkg) => (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className={`relative bg-white/70 backdrop-blur-xl rounded-2xl border-2 p-6 shadow-lg transition-all cursor-pointer ${
                  selectedPackage === pkg.id
                    ? 'border-purple-500 shadow-purple-500/20'
                    : pkg.popular
                    ? 'border-purple-300'
                    : 'border-white/50 hover:border-purple-200'
                }`}
                onClick={() => setSelectedPackage(pkg.id)}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                      <Star className="w-3 h-3" />
                      POPULAR
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${
                    pkg.popular ? 'from-purple-500 to-pink-500' : 'from-gray-400 to-gray-500'
                  } flex items-center justify-center mb-4`}>
                    <Zap className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{pkg.name}</h3>
                  <div className="text-4xl font-bold text-gray-900 mb-1">
                    ${pkg.price}
                  </div>
                  <div className="text-gray-500 text-sm">one-time payment</div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium">{pkg.credits} credits</span>
                  </div>
                  {pkg.bonus && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <Sparkles className="w-4 h-4 text-purple-500" />
                      <span className="text-sm font-medium">+{pkg.bonus} bonus credits</span>
                    </div>
                  )}
                  {pkg.savings && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium">Save {pkg.savings}</span>
                    </div>
                  )}
                </div>

                <Button
                  className={`w-full ${
                    pkg.popular
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                      : 'bg-gray-900 text-white'
                  }`}
                >
                  Purchase
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            ))}
          </div>
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
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>

          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 overflow-hidden">
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
                      Credits
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            transaction.type === 'purchase'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {transaction.type === 'purchase' ? (
                            <>
                              <CreditCard className="w-3 h-3" />
                              Purchase
                            </>
                          ) : (
                            <>
                              <Zap className="w-3 h-3" />
                              Usage
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
                        <span
                          className={`text-sm font-semibold ${
                            transaction.credits > 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {transaction.credits > 0 ? '+' : ''}
                          {transaction.credits}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">
                          {transaction.amount > 0 ? `$${transaction.amount}` : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500">{transaction.date}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
