/**
 * SmartSpec Pro - Payment Form
 * Handles credit purchases and subscription payments.
 */

import React, { useState } from 'react';
import {
  CreditCard,
  Coins,
  Check,
  AlertCircle,
  Loader2,
  Shield,
  Lock,
  ArrowRight,
  Minus,
  Plus,
  Sparkles,
  Gift,
} from 'lucide-react';

// Types
interface CreditPackage {
  id: string;
  credits: number;
  price: number;
  bonus: number;
  popular?: boolean;
  bestValue?: boolean;
}

interface PaymentFormProps {
  onCheckout: (type: 'credits' | 'subscription', data: any) => Promise<{ url: string }>;
  onClose?: () => void;
}

// Credit packages
const creditPackages: CreditPackage[] = [
  { id: 'starter', credits: 50, price: 5, bonus: 0 },
  { id: 'basic', credits: 100, price: 9, bonus: 5, popular: true },
  { id: 'standard', credits: 250, price: 20, bonus: 15 },
  { id: 'pro', credits: 500, price: 35, bonus: 40 },
  { id: 'business', credits: 1000, price: 60, bonus: 100, bestValue: true },
  { id: 'enterprise', credits: 5000, price: 250, bonus: 750 },
];

// Components
const PackageCard: React.FC<{
  pkg: CreditPackage;
  selected: boolean;
  onSelect: () => void;
}> = ({ pkg, selected, onSelect }) => {
  const pricePerCredit = (pkg.price / (pkg.credits + pkg.bonus)).toFixed(3);
  
  return (
    <button
      onClick={onSelect}
      className={`relative p-4 rounded-xl border-2 transition-all text-left ${
        selected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-[#313244] bg-[#1e1e2e] hover:border-[#414155]'
      }`}
    >
      {/* Badges */}
      {pkg.popular && (
        <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-blue-500 text-white text-xs font-medium rounded-full">
          Popular
        </div>
      )}
      {pkg.bestValue && (
        <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded-full">
          Best Value
        </div>
      )}
      
      {/* Content */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Coins className={`w-5 h-5 ${selected ? 'text-blue-400' : 'text-gray-400'}`} />
          <span className="text-lg font-bold text-white">{pkg.credits.toLocaleString()}</span>
        </div>
        <span className="text-xl font-bold text-white">${pkg.price}</span>
      </div>
      
      {pkg.bonus > 0 && (
        <div className="flex items-center gap-1 text-green-400 text-sm mb-2">
          <Gift className="w-4 h-4" />
          +{pkg.bonus} bonus credits
        </div>
      )}
      
      <div className="text-xs text-gray-500">
        ${pricePerCredit} per credit
      </div>
      
      {/* Selection indicator */}
      {selected && (
        <div className="absolute top-3 left-3">
          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        </div>
      )}
    </button>
  );
};

const CustomAmountInput: React.FC<{
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}> = ({ value, onChange, min = 10, max = 10000 }) => {
  const handleDecrease = () => {
    const newValue = Math.max(min, value - 50);
    onChange(newValue);
  };
  
  const handleIncrease = () => {
    const newValue = Math.min(max, value + 50);
    onChange(newValue);
  };
  
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleDecrease}
        disabled={value <= min}
        className="p-2 rounded-lg bg-[#313244] text-gray-400 hover:text-white disabled:opacity-50"
      >
        <Minus className="w-5 h-5" />
      </button>
      
      <div className="flex-1">
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const newValue = parseInt(e.target.value) || min;
            onChange(Math.min(max, Math.max(min, newValue)));
          }}
          min={min}
          max={max}
          className="w-full px-4 py-3 bg-[#1e1e2e] border border-[#313244] rounded-xl text-white text-center text-xl font-bold focus:outline-none focus:border-blue-500"
        />
      </div>
      
      <button
        onClick={handleIncrease}
        disabled={value >= max}
        className="p-2 rounded-lg bg-[#313244] text-gray-400 hover:text-white disabled:opacity-50"
      >
        <Plus className="w-5 h-5" />
      </button>
    </div>
  );
};

// Main Component
const PaymentForm: React.FC<PaymentFormProps> = ({ onCheckout }) => {
  const [mode, setMode] = useState<'packages' | 'custom'>('packages');
  const [selectedPackage, setSelectedPackage] = useState<string>('basic');
  const [customAmount, setCustomAmount] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSelectedCredits = () => {
    if (mode === 'custom') {
      return customAmount;
    }
    const pkg = creditPackages.find(p => p.id === selectedPackage);
    return pkg ? pkg.credits + pkg.bonus : 0;
  };

  const getSelectedPrice = () => {
    if (mode === 'custom') {
      return customAmount * 0.10; // $0.10 per credit for custom
    }
    const pkg = creditPackages.find(p => p.id === selectedPackage);
    return pkg?.price || 0;
  };

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const credits = mode === 'custom' ? customAmount : creditPackages.find(p => p.id === selectedPackage)?.credits || 0;
      
      const result = await onCheckout('credits', {
        credits_amount: credits,
      });
      
      // Redirect to Stripe checkout
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#11111b] rounded-2xl max-w-2xl mx-auto">
      {/* Header */}
      <div className="p-6 border-b border-[#313244]">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Coins className="w-6 h-6 text-blue-400" />
          Buy Credits
        </h2>
        <p className="text-gray-400 mt-1">
          Purchase credits to use for AI generation
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="p-6 border-b border-[#313244]">
        <div className="flex gap-2 p-1 bg-[#1e1e2e] rounded-xl">
          <button
            onClick={() => setMode('packages')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              mode === 'packages'
                ? 'bg-blue-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Credit Packages
          </button>
          <button
            onClick={() => setMode('custom')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              mode === 'custom'
                ? 'bg-blue-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Custom Amount
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {mode === 'packages' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {creditPackages.map(pkg => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                selected={selectedPackage === pkg.id}
                onSelect={() => setSelectedPackage(pkg.id)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Number of Credits
              </label>
              <CustomAmountInput
                value={customAmount}
                onChange={setCustomAmount}
              />
              <p className="text-xs text-gray-500 mt-2">
                Min: 10 credits | Max: 10,000 credits
              </p>
            </div>
            
            <div className="p-4 bg-[#1e1e2e] rounded-xl">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Price per credit</span>
                <span className="text-white">$0.10</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-gray-400">Total credits</span>
                <span className="text-white">{customAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        )}
      </div>

      {/* Summary & Checkout */}
      <div className="p-6 border-t border-[#313244] bg-[#1e1e2e]/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm text-gray-400">Total</div>
            <div className="text-3xl font-bold text-white">
              ${getSelectedPrice().toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400">You'll receive</div>
            <div className="text-xl font-bold text-blue-400 flex items-center gap-1">
              <Coins className="w-5 h-5" />
              {getSelectedCredits().toLocaleString()} credits
            </div>
          </div>
        </div>

        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Proceed to Checkout
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {/* Security Badge */}
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Secure checkout
          </div>
          <div className="flex items-center gap-1">
            <Shield className="w-3 h-3" />
            SSL encrypted
          </div>
          <div className="flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Powered by Stripe
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentForm;
