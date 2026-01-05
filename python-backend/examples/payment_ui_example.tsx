/**
 * Payment UI Example - React/TypeScript
 * 
 * Example implementation of payment UI for SmartSpec Pro
 * Can be used in React web app or Tauri desktop app
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';

// Types
interface PredefinedAmount {
  amount_usd: number;
  credits: number;
  label: string;
}

interface PaymentAmounts {
  amounts: Record<string, PredefinedAmount>;
  currency: string;
  min_amount: number;
  max_amount: number;
}

interface CheckoutResponse {
  session_id: string;
  url: string;
  credits_to_receive: number;
  amount_usd: number;
  payment_transaction_id: number;
}

interface PaymentHistory {
  payments: Array<{
    id: number;
    amount_usd: number;
    credits_amount: number;
    status: string;
    payment_method: string;
    created_at: string;
    completed_at: string | null;
  }>;
  total: number;
  limit: number;
  offset: number;
}

// Component
export const PaymentPage: React.FC = () => {
  const { user } = useAuth();
  const [amounts, setAmounts] = useState<PaymentAmounts | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<PaymentHistory | null>(null);

  // Load predefined amounts
  useEffect(() => {
    loadAmounts();
    loadHistory();
  }, []);

  const loadAmounts = async () => {
    try {
      const response = await api.get('/api/payments/amounts');
      setAmounts(response.data);
    } catch (error) {
      console.error('Failed to load amounts:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const response = await api.get('/api/payments/history?limit=5');
      setHistory(response.data);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const handleTopUp = async () => {
    if (!selectedAmount && !customAmount) {
      alert('Please select or enter an amount');
      return;
    }

    const amount = selectedAmount || parseFloat(customAmount);
    
    if (amounts && (amount < amounts.min_amount || amount > amounts.max_amount)) {
      alert(`Amount must be between $${amounts.min_amount} and $${amounts.max_amount}`);
      return;
    }

    setLoading(true);

    try {
      const response = await api.post<CheckoutResponse>('/api/payments/checkout', {
        amount_usd: amount,
        success_url: `${window.location.origin}/dashboard?payment=success`,
        cancel_url: `${window.location.origin}/dashboard?payment=cancel`
      });

      // Redirect to Stripe Checkout
      window.location.href = response.data.url;
    } catch (error) {
      console.error('Failed to create checkout:', error);
      alert('Failed to create payment session. Please try again.');
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatCredits = (credits: number) => {
    return new Intl.NumberFormat('en-US').format(credits);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!amounts) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Top-up Credits</h1>
        <p className="text-gray-600">
          Current Balance: <span className="font-semibold">{formatCredits(user?.credits_balance || 0)} credits</span>
          {' '}({formatCurrency((user?.credits_balance || 0) / 1000)})
        </p>
      </div>

      {/* Predefined Amounts */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Select Amount</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(amounts.amounts).map(([key, amount]) => (
            <button
              key={key}
              onClick={() => {
                setSelectedAmount(amount.amount_usd);
                setCustomAmount('');
              }}
              className={`p-6 border-2 rounded-lg transition-all ${
                selectedAmount === amount.amount_usd
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="text-2xl font-bold mb-2">
                {formatCurrency(amount.amount_usd)}
              </div>
              <div className="text-sm text-gray-600 mb-2">
                {amount.label}
              </div>
              <div className="text-lg font-semibold text-blue-600">
                {formatCredits(amount.credits)} credits
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Amount */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Or Enter Custom Amount</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <input
              type="number"
              min={amounts.min_amount}
              max={amounts.max_amount}
              step="0.01"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setSelectedAmount(null);
              }}
              placeholder={`Enter amount (${formatCurrency(amounts.min_amount)} - ${formatCurrency(amounts.max_amount)})`}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>
          {customAmount && (
            <div className="text-right">
              <div className="text-sm text-gray-600">You'll receive</div>
              <div className="text-lg font-semibold text-blue-600">
                {formatCredits(Math.floor(parseFloat(customAmount) / 1.15 * 1000))} credits
              </div>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-2">
          * 15% markup included. You'll receive {formatCurrency(1 / 1.15)} worth of credits per ${formatCurrency(1)} paid.
        </p>
      </div>

      {/* Top-up Button */}
      <div className="mb-8">
        <button
          onClick={handleTopUp}
          disabled={loading || (!selectedAmount && !customAmount)}
          className="w-full py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Processing...' : 'Proceed to Payment'}
        </button>
      </div>

      {/* Payment Info */}
      <div className="mb-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold mb-2">Payment Information</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>✓ Secure payment powered by Stripe</li>
          <li>✓ Support for credit/debit cards, Google Pay, Apple Pay</li>
          <li>✓ Credits added instantly after payment</li>
          <li>✓ 15% markup included in displayed prices</li>
          <li>✓ 1 USD = 1,000 credits</li>
        </ul>
      </div>

      {/* Payment History */}
      {history && history.payments.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Payments</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Amount</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Credits</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 text-sm">
                      {formatDate(payment.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {formatCurrency(payment.amount_usd)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {formatCredits(payment.credits_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          payment.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : payment.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {payment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// API client example
// lib/api.ts
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle payment success/cancel
// pages/dashboard.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export const DashboardPage: React.FC = () => {
  const router = useRouter();
  const { payment } = router.query;

  useEffect(() => {
    if (payment === 'success') {
      // Show success message
      alert('Payment successful! Credits have been added to your account.');
      // Reload balance
      // ...
    } else if (payment === 'cancel') {
      // Show cancel message
      alert('Payment cancelled.');
    }
  }, [payment]);

  return (
    <div>
      {/* Dashboard content */}
    </div>
  );
};
