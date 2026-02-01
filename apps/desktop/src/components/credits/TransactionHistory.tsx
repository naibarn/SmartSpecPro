/**
 * SmartSpec Pro - Transaction History
 * Display and filter credit transactions.
 */

import React, { useState, useEffect } from 'react';
import {
  History,
  TrendingUp,
  TrendingDown,
  Coins,
  Sparkles,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
  Search,
  Image,
  Video,
  Music,
  CreditCard,
  Gift,
  ArrowUpRight,
  ArrowDownRight,
  Download,
} from 'lucide-react';

// Types
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

interface TransactionHistoryProps {
  onExport?: (format: 'csv' | 'json') => void;
}

// Mock API function
const fetchTransactions = async (
  page: number = 1,
  limit: number = 20,
  type?: string,
  _dateFrom?: string,
  _dateTo?: string,
): Promise<{ transactions: Transaction[]; total: number; pages: number }> => {
  // Simulated API response
  const mockTransactions: Transaction[] = [
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
      transaction_type: 'purchase',
      amount: 100,
      balance_before: 276,
      balance_after: 376,
      reference_type: 'stripe_payment',
      reference_id: 'pi_abc123',
      description: 'Purchased 100 credits',
      created_at: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: '4',
      transaction_type: 'subscription',
      amount: 500,
      balance_before: 0,
      balance_after: 500,
      reference_type: 'stripe_subscription',
      reference_id: 'sub_abc',
      description: 'Pro plan monthly credits',
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: '5',
      transaction_type: 'bonus',
      amount: 50,
      balance_before: 450,
      balance_after: 500,
      reference_type: 'signup_bonus',
      reference_id: 'bonus_123',
      description: 'Welcome bonus credits',
      created_at: new Date(Date.now() - 172800000).toISOString(),
    },
    {
      id: '6',
      transaction_type: 'usage',
      amount: -0.5,
      balance_before: 450.5,
      balance_after: 450,
      reference_type: 'generation_task',
      reference_id: 'task_121',
      description: 'Audio generation - elevenlabs-tts',
      created_at: new Date(Date.now() - 259200000).toISOString(),
    },
    {
      id: '7',
      transaction_type: 'refund',
      amount: 5.0,
      balance_before: 445.5,
      balance_after: 450.5,
      reference_type: 'failed_task',
      reference_id: 'task_120',
      description: 'Refund for failed generation',
      created_at: new Date(Date.now() - 345600000).toISOString(),
    },
  ];
  
  // Filter by type if specified
  let filtered = mockTransactions;
  if (type && type !== 'all') {
    filtered = filtered.filter(t => t.transaction_type === type);
  }
  
  return {
    transactions: filtered.slice((page - 1) * limit, page * limit),
    total: filtered.length,
    pages: Math.ceil(filtered.length / limit),
  };
};

// Transaction type configuration
const transactionTypes = {
  usage: {
    label: 'Usage',
    icon: <TrendingDown className="w-4 h-4" />,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
  purchase: {
    label: 'Purchase',
    icon: <CreditCard className="w-4 h-4" />,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  subscription: {
    label: 'Subscription',
    icon: <Sparkles className="w-4 h-4" />,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  bonus: {
    label: 'Bonus',
    icon: <Gift className="w-4 h-4" />,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
  },
  refund: {
    label: 'Refund',
    icon: <RefreshCw className="w-4 h-4" />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
};

// Components
const TransactionRow: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
  const typeConfig = transactionTypes[transaction.transaction_type as keyof typeof transactionTypes] || {
    label: transaction.transaction_type,
    icon: <Coins className="w-4 h-4" />,
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
  };
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };
  
  const getGenerationIcon = () => {
    if (transaction.description?.toLowerCase().includes('image')) {
      return <Image className="w-4 h-4 text-blue-400" />;
    }
    if (transaction.description?.toLowerCase().includes('video')) {
      return <Video className="w-4 h-4 text-purple-400" />;
    }
    if (transaction.description?.toLowerCase().includes('audio')) {
      return <Music className="w-4 h-4 text-green-400" />;
    }
    return null;
  };
  
  return (
    <div className="flex items-center gap-4 p-4 bg-[#1e1e2e] rounded-xl hover:bg-[#252535] transition-colors">
      {/* Icon */}
      <div className={`p-2.5 rounded-xl ${typeConfig.bgColor}`}>
        {typeConfig.icon}
      </div>
      
      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium truncate">
            {transaction.description || typeConfig.label}
          </span>
          {getGenerationIcon()}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
          <span className={typeConfig.color}>{typeConfig.label}</span>
          <span>•</span>
          <span>{formatDate(transaction.created_at)}</span>
        </div>
      </div>
      
      {/* Amount */}
      <div className="text-right">
        <div className={`font-bold flex items-center gap-1 ${
          transaction.amount > 0 ? 'text-green-400' : 'text-red-400'
        }`}>
          {transaction.amount > 0 ? (
            <ArrowUpRight className="w-4 h-4" />
          ) : (
            <ArrowDownRight className="w-4 h-4" />
          )}
          {transaction.amount > 0 ? '+' : ''}{transaction.amount.toFixed(1)}
        </div>
        <div className="text-xs text-gray-500">
          Balance: {transaction.balance_after.toFixed(1)}
        </div>
      </div>
    </div>
  );
};

const FilterDropdown: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  
  const options = [
    { value: 'all', label: 'All Types' },
    { value: 'usage', label: 'Usage' },
    { value: 'purchase', label: 'Purchases' },
    { value: 'subscription', label: 'Subscription' },
    { value: 'bonus', label: 'Bonuses' },
    { value: 'refund', label: 'Refunds' },
  ];
  
  const selectedOption = options.find(o => o.value === value);
  
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 bg-[#1e1e2e] border border-[#313244] rounded-lg text-gray-300 hover:border-[#414155] transition-colors"
      >
        <Filter className="w-4 h-4" />
        {selectedOption?.label}
      </button>
      
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full mt-2 right-0 w-48 bg-[#1e1e2e] border border-[#313244] rounded-xl shadow-xl z-20 overflow-hidden">
            {options.map(option => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-[#313244] transition-colors ${
                  value === option.value ? 'text-blue-400 bg-blue-500/10' : 'text-gray-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// Main Component
const TransactionHistory: React.FC<TransactionHistoryProps> = ({ onExport }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const result = await fetchTransactions(page, 20, typeFilter);
      setTransactions(result.transactions);
      setTotalPages(result.pages);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [page, typeFilter]);

  // Filter by search query
  const filteredTransactions = transactions.filter(tx => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      tx.description?.toLowerCase().includes(query) ||
      tx.transaction_type.toLowerCase().includes(query) ||
      tx.reference_id?.toLowerCase().includes(query)
    );
  });

  // Calculate summary
  const summary = {
    totalIn: transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
    totalOut: transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0),
  };

  return (
    <div className="h-full overflow-auto p-6 bg-[#11111b]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <History className="w-6 h-6 text-blue-400" />
            Transaction History
          </h1>
          <p className="text-gray-400 mt-1">View all your credit transactions</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadTransactions()}
            className="p-2 rounded-lg bg-[#1e1e2e] text-gray-400 hover:text-white hover:bg-[#313244] transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          {onExport && (
            <button
              onClick={() => onExport('csv')}
              className="flex items-center gap-2 px-4 py-2 bg-[#1e1e2e] border border-[#313244] rounded-lg text-gray-300 hover:border-[#414155] transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-[#1e1e2e] rounded-xl p-4 border border-[#313244]">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <TrendingUp className="w-4 h-4 text-green-400" />
            Credits In
          </div>
          <div className="text-2xl font-bold text-green-400">
            +{summary.totalIn.toFixed(1)}
          </div>
        </div>
        
        <div className="bg-[#1e1e2e] rounded-xl p-4 border border-[#313244]">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <TrendingDown className="w-4 h-4 text-red-400" />
            Credits Out
          </div>
          <div className="text-2xl font-bold text-red-400">
            -{summary.totalOut.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#1e1e2e] border border-[#313244] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        
        <FilterDropdown value={typeFilter} onChange={setTypeFilter} />
      </div>

      {/* Transaction List */}
      <div className="space-y-3 mb-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-12">
            <History className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No transactions found</p>
          </div>
        ) : (
          filteredTransactions.map(tx => (
            <TransactionRow key={tx.id} transaction={tx} />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg bg-[#1e1e2e] text-gray-400 hover:text-white disabled:opacity-50"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <span className="px-4 py-2 text-gray-400">
            Page {page} of {totalPages}
          </span>
          
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg bg-[#1e1e2e] text-gray-400 hover:text-white disabled:opacity-50"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;
