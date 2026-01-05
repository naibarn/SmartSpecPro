/**
 * SmartSpec Pro - Subscription Plans
 * Display and manage subscription plans with pricing.
 */

import React, { useState, useEffect } from 'react';
import {
  Check,
  X,
  Sparkles,
  Zap,
  Crown,
  ArrowRight,
  RefreshCw,
  Star,
  Shield,
  Headphones,
  Image,
  Video,
  Music,
  Key,
  BarChart3,
} from 'lucide-react';

// Types
interface SubscriptionPlan {
  id: string;
  name: string;
  display_name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  monthly_credits: number;
  bonus_credits: number;
  max_storage_mb: number;
  features: string[];
  is_popular?: boolean;
}

interface CurrentSubscription {
  plan_name: string;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

// Mock API functions
const fetchPlans = async (): Promise<SubscriptionPlan[]> => {
  return [
    {
      id: 'free',
      name: 'free',
      display_name: 'Free',
      description: 'Get started with basic features',
      price_monthly: 0,
      price_yearly: 0,
      currency: 'USD',
      monthly_credits: 10,
      bonus_credits: 5,
      max_storage_mb: 100,
      features: [
        'image_generation',
        'basic_support',
      ],
    },
    {
      id: 'pro',
      name: 'pro',
      display_name: 'Pro',
      description: 'For professionals and small teams',
      price_monthly: 29,
      price_yearly: 290,
      currency: 'USD',
      monthly_credits: 500,
      bonus_credits: 50,
      max_storage_mb: 5000,
      features: [
        'image_generation',
        'video_generation',
        'audio_generation',
        'priority_queue',
        'email_support',
        'api_access',
      ],
      is_popular: true,
    },
    {
      id: 'enterprise',
      name: 'enterprise',
      display_name: 'Enterprise',
      description: 'For large teams and organizations',
      price_monthly: 199,
      price_yearly: 1990,
      currency: 'USD',
      monthly_credits: 5000,
      bonus_credits: 500,
      max_storage_mb: 50000,
      features: [
        'image_generation',
        'video_generation',
        'audio_generation',
        'priority_queue',
        'dedicated_support',
        'api_access',
        'custom_models',
        'sla',
        'audit_logs',
      ],
    },
  ];
};

const fetchCurrentSubscription = async (): Promise<CurrentSubscription | null> => {
  return {
    plan_name: 'pro',
    status: 'active',
    current_period_end: new Date(Date.now() + 12 * 86400000).toISOString(),
    cancel_at_period_end: false,
  };
};

// Feature display mapping
const featureLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  image_generation: { label: 'Image Generation', icon: <Image className="w-4 h-4" /> },
  video_generation: { label: 'Video Generation', icon: <Video className="w-4 h-4" /> },
  audio_generation: { label: 'Audio/Speech', icon: <Music className="w-4 h-4" /> },
  priority_queue: { label: 'Priority Queue', icon: <Zap className="w-4 h-4" /> },
  basic_support: { label: 'Community Support', icon: <Headphones className="w-4 h-4" /> },
  email_support: { label: 'Email Support', icon: <Headphones className="w-4 h-4" /> },
  dedicated_support: { label: 'Dedicated Support', icon: <Headphones className="w-4 h-4" /> },
  api_access: { label: 'API Access', icon: <Key className="w-4 h-4" /> },
  custom_models: { label: 'Custom Models', icon: <Sparkles className="w-4 h-4" /> },
  sla: { label: '99.9% SLA', icon: <Shield className="w-4 h-4" /> },
  audit_logs: { label: 'Audit Logs', icon: <BarChart3 className="w-4 h-4" /> },
};

// All features for comparison
const allFeatures = [
  'image_generation',
  'video_generation',
  'audio_generation',
  'priority_queue',
  'api_access',
  'custom_models',
  'sla',
  'audit_logs',
];

// Components
const PlanCard: React.FC<{
  plan: SubscriptionPlan;
  isYearly: boolean;
  isCurrent: boolean;
  onSelect: (plan: SubscriptionPlan) => void;
}> = ({ plan, isYearly, isCurrent, onSelect }) => {
  const price = isYearly ? plan.price_yearly / 12 : plan.price_monthly;
  const yearlyDiscount = plan.price_monthly > 0 
    ? Math.round((1 - plan.price_yearly / (plan.price_monthly * 12)) * 100)
    : 0;

  const getPlanIcon = () => {
    switch (plan.name) {
      case 'free': return <Sparkles className="w-6 h-6" />;
      case 'pro': return <Zap className="w-6 h-6" />;
      case 'enterprise': return <Crown className="w-6 h-6" />;
      default: return <Sparkles className="w-6 h-6" />;
    }
  };

  const getPlanColor = () => {
    switch (plan.name) {
      case 'free': return 'gray';
      case 'pro': return 'blue';
      case 'enterprise': return 'purple';
      default: return 'gray';
    }
  };

  const color = getPlanColor();
  const colorClasses = {
    gray: {
      bg: 'bg-gray-500/10',
      text: 'text-gray-400',
      border: 'border-gray-700',
      button: 'bg-gray-600 hover:bg-gray-500',
    },
    blue: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-400',
      border: 'border-blue-500/50',
      button: 'bg-blue-500 hover:bg-blue-600',
    },
    purple: {
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
      border: 'border-purple-500/50',
      button: 'bg-purple-500 hover:bg-purple-600',
    },
  };

  const classes = colorClasses[color as keyof typeof colorClasses];

  return (
    <div className={`relative bg-[#1e1e2e] rounded-2xl p-6 border ${
      plan.is_popular ? 'border-blue-500' : 'border-[#313244]'
    } ${isCurrent ? 'ring-2 ring-green-500' : ''}`}>
      {/* Popular Badge */}
      {plan.is_popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500 text-white text-xs font-medium rounded-full flex items-center gap-1">
          <Star className="w-3 h-3" /> Most Popular
        </div>
      )}

      {/* Current Badge */}
      {isCurrent && (
        <div className="absolute -top-3 right-4 px-3 py-1 bg-green-500 text-white text-xs font-medium rounded-full">
          Current Plan
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-6">
        <div className={`inline-flex p-3 rounded-xl ${classes.bg} ${classes.text} mb-3`}>
          {getPlanIcon()}
        </div>
        <h3 className="text-xl font-bold text-white">{plan.display_name}</h3>
        <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
      </div>

      {/* Price */}
      <div className="text-center mb-6">
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-4xl font-bold text-white">
            ${price.toFixed(0)}
          </span>
          <span className="text-gray-400">/mo</span>
        </div>
        {isYearly && yearlyDiscount > 0 && (
          <div className="text-sm text-green-400 mt-1">
            Save {yearlyDiscount}% with yearly billing
          </div>
        )}
        {isYearly && plan.price_yearly > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            ${plan.price_yearly}/year billed annually
          </div>
        )}
      </div>

      {/* Credits */}
      <div className={`p-4 rounded-xl ${classes.bg} mb-6`}>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Monthly Credits</span>
          <span className={`font-bold ${classes.text}`}>{plan.monthly_credits.toLocaleString()}</span>
        </div>
        {plan.bonus_credits > 0 && (
          <div className="flex items-center justify-between mt-2 text-sm">
            <span className="text-gray-500">Signup Bonus</span>
            <span className="text-green-400">+{plan.bonus_credits}</span>
          </div>
        )}
        <div className="flex items-center justify-between mt-2 text-sm">
          <span className="text-gray-500">Storage</span>
          <span className="text-gray-300">
            {plan.max_storage_mb >= 1000 
              ? `${(plan.max_storage_mb / 1000).toFixed(0)} GB`
              : `${plan.max_storage_mb} MB`
            }
          </span>
        </div>
      </div>

      {/* Features */}
      <div className="space-y-3 mb-6">
        {plan.features.map(feature => {
          const featureInfo = featureLabels[feature];
          if (!featureInfo) return null;
          
          return (
            <div key={feature} className="flex items-center gap-2">
              <div className={`p-1 rounded ${classes.bg} ${classes.text}`}>
                {featureInfo.icon}
              </div>
              <span className="text-gray-300 text-sm">{featureInfo.label}</span>
            </div>
          );
        })}
      </div>

      {/* CTA Button */}
      <button
        onClick={() => onSelect(plan)}
        disabled={isCurrent}
        className={`w-full py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
          isCurrent 
            ? 'bg-green-500/20 text-green-400 cursor-default'
            : `${classes.button} text-white`
        }`}
      >
        {isCurrent ? (
          <>
            <Check className="w-5 h-5" />
            Current Plan
          </>
        ) : plan.price_monthly === 0 ? (
          'Get Started Free'
        ) : (
          <>
            Upgrade Now
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );
};

const ComparisonTable: React.FC<{
  plans: SubscriptionPlan[];
  currentPlan: string | null;
}> = ({ plans, currentPlan }) => {
  return (
    <div className="bg-[#1e1e2e] rounded-2xl border border-[#313244] overflow-hidden">
      <div className="p-6 border-b border-[#313244]">
        <h3 className="text-xl font-bold text-white">Compare Plans</h3>
        <p className="text-gray-400 text-sm mt-1">See what's included in each plan</p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#313244]">
              <th className="text-left p-4 text-gray-400 font-medium">Feature</th>
              {plans.map(plan => (
                <th key={plan.id} className="p-4 text-center">
                  <span className={`font-bold ${
                    plan.name === currentPlan ? 'text-green-400' : 'text-white'
                  }`}>
                    {plan.display_name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Credits Row */}
            <tr className="border-b border-[#313244]">
              <td className="p-4 text-gray-300">Monthly Credits</td>
              {plans.map(plan => (
                <td key={plan.id} className="p-4 text-center text-white font-medium">
                  {plan.monthly_credits.toLocaleString()}
                </td>
              ))}
            </tr>
            
            {/* Storage Row */}
            <tr className="border-b border-[#313244]">
              <td className="p-4 text-gray-300">Storage</td>
              {plans.map(plan => (
                <td key={plan.id} className="p-4 text-center text-white">
                  {plan.max_storage_mb >= 1000 
                    ? `${(plan.max_storage_mb / 1000).toFixed(0)} GB`
                    : `${plan.max_storage_mb} MB`
                  }
                </td>
              ))}
            </tr>
            
            {/* Feature Rows */}
            {allFeatures.map(feature => {
              const featureInfo = featureLabels[feature];
              if (!featureInfo) return null;
              
              return (
                <tr key={feature} className="border-b border-[#313244]">
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-gray-300">
                      {featureInfo.icon}
                      {featureInfo.label}
                    </div>
                  </td>
                  {plans.map(plan => (
                    <td key={plan.id} className="p-4 text-center">
                      {plan.features.includes(feature) ? (
                        <Check className="w-5 h-5 text-green-400 mx-auto" />
                      ) : (
                        <X className="w-5 h-5 text-gray-600 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Main Component
const SubscriptionPlans: React.FC<{
  onSelectPlan?: (plan: SubscriptionPlan, isYearly: boolean) => void;
}> = ({ onSelectPlan }) => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null);
  const [isYearly, setIsYearly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [plansData, subData] = await Promise.all([
          fetchPlans(),
          fetchCurrentSubscription(),
        ]);
        setPlans(plansData);
        setCurrentSubscription(subData);
      } catch (error) {
        console.error('Failed to load plans:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    if (onSelectPlan) {
      onSelectPlan(plan, isYearly);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6 bg-[#11111b]">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Choose Your Plan</h1>
        <p className="text-gray-400">
          Start free and upgrade as you grow. All plans include core features.
        </p>
      </div>

      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-4 mb-8">
        <span className={`text-sm ${!isYearly ? 'text-white' : 'text-gray-500'}`}>Monthly</span>
        <button
          onClick={() => setIsYearly(!isYearly)}
          className={`relative w-14 h-7 rounded-full transition-colors ${
            isYearly ? 'bg-blue-500' : 'bg-[#313244]'
          }`}
        >
          <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
            isYearly ? 'translate-x-8' : 'translate-x-1'
          }`} />
        </button>
        <span className={`text-sm ${isYearly ? 'text-white' : 'text-gray-500'}`}>
          Yearly
          <span className="ml-1 text-green-400 text-xs">Save 17%</span>
        </span>
      </div>

      {/* Current Subscription Info */}
      {currentSubscription && (
        <div className="max-w-3xl mx-auto mb-8 p-4 bg-[#1e1e2e] rounded-xl border border-[#313244]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20 text-green-400">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <div className="text-white font-medium">
                  Current: {currentSubscription.plan_name.charAt(0).toUpperCase() + currentSubscription.plan_name.slice(1)} Plan
                </div>
                <div className="text-sm text-gray-400">
                  {currentSubscription.cancel_at_period_end 
                    ? `Cancels on ${new Date(currentSubscription.current_period_end).toLocaleDateString()}`
                    : `Renews on ${new Date(currentSubscription.current_period_end).toLocaleDateString()}`
                  }
                </div>
              </div>
            </div>
            <button className="text-sm text-gray-400 hover:text-white">
              Manage Subscription
            </button>
          </div>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-8">
        {plans.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isYearly={isYearly}
            isCurrent={currentSubscription?.plan_name === plan.name}
            onSelect={handleSelectPlan}
          />
        ))}
      </div>

      {/* Compare Plans Toggle */}
      <div className="text-center mb-8">
        <button
          onClick={() => setShowComparison(!showComparison)}
          className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-2 mx-auto"
        >
          {showComparison ? 'Hide' : 'Show'} detailed comparison
          <ArrowRight className={`w-4 h-4 transition-transform ${showComparison ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Comparison Table */}
      {showComparison && (
        <div className="max-w-5xl mx-auto mb-8">
          <ComparisonTable plans={plans} currentPlan={currentSubscription?.plan_name || null} />
        </div>
      )}

      {/* FAQ or Additional Info */}
      <div className="max-w-3xl mx-auto text-center text-gray-400 text-sm">
        <p>
          All plans include 24/7 uptime monitoring, automatic backups, and secure data encryption.
          <br />
          Need a custom plan? <a href="#" className="text-blue-400 hover:underline">Contact our sales team</a>
        </p>
      </div>
    </div>
  );
};

export default SubscriptionPlans;
