/**
 * Pricing Page - Connected to Packages API
 * Features: Dynamic pricing from database, billing period selection, agency package
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { trpc } from '@/lib/trpc';
import {
  Check,
  X,
  Sparkles,
  Zap,
  Building2,
  HelpCircle,
  ArrowRight,
  Crown,
  Star,
  Shield,
  Rocket,
  CreditCard,
  Headphones,
  Code2,
  Image,
  Video,
  Cpu,
  Globe,
  Users,
  Loader2,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Plan styling configuration based on sort order / package type
const getPlanStyle = (packageType: string, index: number, isFeatured: boolean) => {
  if (packageType === 'agency') {
    return {
      icon: Globe,
      gradient: 'from-amber-500 via-orange-500 to-rose-500',
      bgGradient: 'from-amber-50 via-orange-50 to-rose-50',
      borderColor: 'border-amber-300',
      accentColor: 'text-amber-600',
    };
  }

  const styles = [
    {
      icon: Sparkles,
      gradient: 'from-slate-500 to-slate-600',
      bgGradient: 'from-slate-50 to-slate-100',
      borderColor: 'border-slate-200',
      accentColor: 'text-slate-600',
    },
    {
      icon: Zap,
      gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
      bgGradient: 'from-violet-50 via-purple-50 to-fuchsia-50',
      borderColor: 'border-violet-300',
      accentColor: 'text-violet-600',
    },
    {
      icon: Rocket,
      gradient: 'from-teal-500 via-emerald-500 to-cyan-500',
      bgGradient: 'from-teal-50 via-emerald-50 to-cyan-50',
      borderColor: 'border-teal-200',
      accentColor: 'text-teal-600',
    },
    {
      icon: Building2,
      gradient: 'from-indigo-500 via-blue-500 to-sky-500',
      bgGradient: 'from-indigo-50 via-blue-50 to-sky-50',
      borderColor: 'border-indigo-200',
      accentColor: 'text-indigo-600',
    },
  ];

  return styles[index % styles.length];
};

// All features available (same for all users)
const allFeatures = [
  'AI Code Generation',
  'Access to All AI Models',
  'Image Generation',
  'Video Generation',
  'API Access',
  'Priority Support',
  'Custom Integrations',
];

// Agency exclusive features
const agencyFeatures = [
  'Custom Domain Support',
  'White Label Branding',
  'Domain Admin Panel',
  'Manage Domain Users',
  'Transfer Credits to Users',
  'Custom Invoice Configuration',
];

const faqs = [
  {
    question: 'What are credits and how do they work?',
    answer: 'Credits are the currency used for AI operations in SmartSpec. Different operations consume different amounts of credits. For example, generating code uses 1 credit, while generating images uses 1-2 credits depending on quality. Unused credits roll over to the next month for paid plans.'
  },
  {
    question: 'Can I upgrade or downgrade my plan?',
    answer: 'Yes, you can change your plan at any time. When upgrading, you\'ll be charged the prorated difference. When downgrading, the new rate takes effect at your next billing cycle.'
  },
  {
    question: 'Is there a free trial for paid plans?',
    answer: 'Yes! All paid plans come with a 14-day free trial. No credit card required to start. You can explore all features before committing.'
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards (Visa, MasterCard, American Express), PayPal, and bank transfers for Enterprise plans. All payments are processed securely through Stripe.'
  },
  {
    question: 'Do you offer refunds?',
    answer: 'We offer a 30-day money-back guarantee for annual plans. If you\'re not satisfied, contact our support team for a full refund within the first 30 days.'
  },
  {
    question: 'What happens if I run out of credits?',
    answer: 'You can purchase additional credit packs at any time, or upgrade to a higher plan. We\'ll notify you when you\'re running low on credits so you\'re never caught off guard.'
  },
  {
    question: 'What is the Agency (White Label) plan?',
    answer: 'The Agency plan is designed for businesses who want to offer SmartSpec under their own brand. It includes custom domain support, white label branding, and domain admin features to manage and allocate credits to your users.'
  }
];

type BillingPeriod = 'monthly' | 'quarterly' | 'semi_annual' | 'yearly';

const billingPeriodLabels: Record<BillingPeriod, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annual: 'Semi-Annual',
  yearly: 'Yearly',
};

const billingPeriodMonths: Record<BillingPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  semi_annual: 6,
  yearly: 12,
};

export default function Pricing() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  // Fetch packages from API
  const { data: packages, isLoading, error } = trpc.packages.list.useQuery();

  // Separate packages by type
  const subscriptionPackages = packages?.filter(p => p.packageType === 'subscription') || [];
  const agencyPackages = packages?.filter(p => p.packageType === 'agency') || [];
  const oneTimePackages = packages?.filter(p => p.packageType === 'one_time') || [];

  // Calculate displayed price based on billing period
  const getDisplayPrice = (pkg: typeof packages extends (infer T)[] | undefined ? T : never) => {
    if (pkg.billingPrices && billingPeriod !== 'monthly') {
      return pkg.billingPrices[billingPeriod] || pkg.priceUsd;
    }
    return pkg.priceUsd * billingPeriodMonths[billingPeriod];
  };

  const getMonthlyEquivalent = (pkg: typeof packages extends (infer T)[] | undefined ? T : never) => {
    if (pkg.billingPrices && billingPeriod !== 'monthly') {
      return (pkg.billingPrices[billingPeriod] || pkg.priceUsd) / billingPeriodMonths[billingPeriod];
    }
    return pkg.priceUsd;
  };

  const getSavingsPercent = () => {
    const discounts: Record<BillingPeriod, number> = {
      monthly: 0,
      quarterly: 5,
      semi_annual: 7,
      yearly: 10,
    };
    return discounts[billingPeriod];
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <Navbar />

      {/* Hero Section with Aurora Background */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Animated Aurora Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-100/40 via-transparent to-teal-100/40" />
          <motion.div
            className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-violet-400/20 via-purple-400/20 to-fuchsia-400/20 rounded-full blur-3xl"
            animate={{
              x: [0, 50, 0],
              y: [0, 30, 0],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 15,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut"
            }}
          />
          <motion.div
            className="absolute top-20 right-1/4 w-[500px] h-[500px] bg-gradient-to-br from-teal-400/20 via-emerald-400/20 to-cyan-400/20 rounded-full blur-3xl"
            animate={{
              x: [0, -40, 0],
              y: [0, 50, 0],
              scale: [1, 1.15, 1],
            }}
            transition={{
              duration: 18,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut"
            }}
          />
        </div>

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-4xl mx-auto"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border border-violet-200/50 backdrop-blur-sm mb-6"
            >
              <Crown className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                Simple, Transparent Pricing
              </span>
              <span className="px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-full">
                No Hidden Fees
              </span>
            </motion.div>

            {/* Main Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-5xl sm:text-6xl md:text-7xl font-bold mb-6 tracking-tight"
            >
              <span className="text-gray-900">Choose Your</span>
              <br />
              <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
                Perfect Plan
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto"
            >
              All plans include full access to every feature.
              Choose based on the credits you need.
            </motion.p>

            {/* Billing Period Toggle */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="inline-flex items-center gap-2 p-2 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-200 shadow-lg shadow-gray-200/50"
            >
              {(['monthly', 'quarterly', 'semi_annual', 'yearly'] as BillingPeriod[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setBillingPeriod(period)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                    billingPeriod === period
                      ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {billingPeriodLabels[period]}
                </button>
              ))}
              {getSavingsPercent() > 0 && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-emerald-400 to-teal-500 text-white rounded-full shadow-lg shadow-emerald-500/30"
                >
                  Save {getSavingsPercent()}%
                </motion.span>
              )}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Loading State */}
      {isLoading && (
        <section className="py-16">
          <div className="container mx-auto px-4 text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-violet-500" />
            <p className="mt-4 text-gray-600">Loading pricing plans...</p>
          </div>
        </section>
      )}

      {/* Error State */}
      {error && (
        <section className="py-16">
          <div className="container mx-auto px-4 text-center">
            <p className="text-red-600">Failed to load pricing plans. Please try again later.</p>
          </div>
        </section>
      )}

      {/* Subscription Plans */}
      {!isLoading && !error && subscriptionPackages.length > 0 && (
        <section className="py-16 relative">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
              {subscriptionPackages.map((pkg, index) => {
                const style = getPlanStyle(pkg.packageType, index, pkg.isFeatured);
                const Icon = style.icon;
                const displayPrice = getDisplayPrice(pkg);
                const monthlyEquiv = getMonthlyEquivalent(pkg);

                return (
                  <motion.div
                    key={pkg.id}
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`relative group ${pkg.isFeatured ? 'md:-mt-4 md:mb-4' : ''}`}
                  >
                    {/* Popular Badge */}
                    {pkg.isFeatured && (
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-20">
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="px-6 py-2 text-sm font-bold bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 text-white rounded-full shadow-xl shadow-violet-500/40 flex items-center gap-2"
                        >
                          <Star className="w-4 h-4 fill-current" />
                          Most Popular
                        </motion.div>
                      </div>
                    )}

                    {/* Card */}
                    <div className={`relative h-full rounded-3xl overflow-hidden transition-all duration-500 ${
                      pkg.isFeatured
                        ? 'bg-gradient-to-b from-white to-violet-50/50 border-2 border-violet-300 shadow-2xl shadow-violet-500/20 hover:shadow-violet-500/30'
                        : 'bg-white/80 backdrop-blur-sm border border-gray-200 shadow-xl shadow-gray-200/50 hover:shadow-2xl hover:shadow-gray-300/50 hover:border-gray-300'
                    }`}>
                      <div className="relative p-6">
                        {/* Icon */}
                        <div className={`w-14 h-14 rounded-2xl mb-4 flex items-center justify-center bg-gradient-to-br ${style.gradient} shadow-lg`}>
                          <Icon className="w-7 h-7 text-white" />
                        </div>

                        {/* Plan Name */}
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{pkg.name}</h3>

                        {/* Price */}
                        <div className="mb-4">
                          <div className="flex items-baseline gap-1">
                            <span className={`text-4xl font-bold ${pkg.isFeatured ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent' : 'text-gray-900'}`}>
                              ${Math.round(monthlyEquiv)}
                            </span>
                            <span className="text-gray-500">/mo</span>
                          </div>
                          {billingPeriod !== 'monthly' && (
                            <p className="text-sm text-gray-500 mt-1">
                              ${displayPrice.toFixed(2)} billed {billingPeriodLabels[billingPeriod].toLowerCase()}
                            </p>
                          )}
                          <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            pkg.isFeatured ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            <Zap className="w-3 h-3" />
                            {pkg.credits.toLocaleString()} credits/mo
                          </div>
                        </div>

                        {/* Features */}
                        <ul className="space-y-2 mb-6 text-sm">
                          {allFeatures.slice(0, 5).map((feature) => (
                            <li key={feature} className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                              <span className="text-gray-700">{feature}</span>
                            </li>
                          ))}
                        </ul>

                        {/* CTA Button */}
                        <Link href="/signup">
                          <Button
                            className={`w-full py-5 text-sm font-semibold rounded-xl transition-all duration-300 ${
                              pkg.isFeatured
                                ? 'bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 text-white hover:from-violet-600 hover:via-purple-600 hover:to-fuchsia-600 shadow-lg shadow-violet-500/30'
                                : 'bg-gray-900 text-white hover:bg-gray-800'
                            }`}
                            size="lg"
                          >
                            Get Started
                            <ArrowRight className="ml-2 w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Agency White Label Section */}
      {!isLoading && !error && agencyPackages.length > 0 && (
        <section className="py-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-amber-50/50 via-orange-50/30 to-white" />

          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-10"
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-200/50 text-amber-700 text-sm font-medium mb-4">
                <Globe className="w-4 h-4" />
                White Label Solution
              </span>
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Agency White Label Plan</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Build your own AI platform with your brand. Manage users and credits under your domain.
              </p>
            </motion.div>

            {agencyPackages.map((pkg) => {
              const displayPrice = getDisplayPrice(pkg);
              const monthlyEquiv = getMonthlyEquivalent(pkg);

              return (
                <motion.div
                  key={pkg.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="max-w-4xl mx-auto"
                >
                  <div className="relative bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 rounded-3xl p-1">
                    <div className="bg-white rounded-[22px] p-8 md:p-10">
                      <div className="grid md:grid-cols-2 gap-8 items-center">
                        {/* Left: Features */}
                        <div>
                          <h3 className="text-2xl font-bold text-gray-900 mb-4">{pkg.name}</h3>
                          <p className="text-gray-600 mb-6">
                            Everything in subscription plans, plus exclusive white label features:
                          </p>
                          <ul className="space-y-3">
                            {agencyFeatures.map((feature) => (
                              <li key={feature} className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                                  <Check className="w-3.5 h-3.5 text-white" />
                                </div>
                                <span className="text-gray-700 font-medium">{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Right: Pricing */}
                        <div className="text-center md:text-right">
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold mb-4">
                            <Zap className="w-4 h-4" />
                            {pkg.credits.toLocaleString()} credits/month
                          </div>
                          <div className="mb-2">
                            <span className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                              ${Math.round(monthlyEquiv)}
                            </span>
                            <span className="text-gray-500 text-xl">/mo</span>
                          </div>
                          {billingPeriod !== 'monthly' && (
                            <p className="text-gray-500 mb-6">
                              ${displayPrice.toFixed(2)} billed {billingPeriodLabels[billingPeriod].toLowerCase()}
                            </p>
                          )}
                          <Link href="/contact">
                            <Button
                              size="lg"
                              className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white hover:from-amber-600 hover:via-orange-600 hover:to-rose-600 px-8 py-6 text-base font-semibold shadow-xl shadow-orange-500/30"
                            >
                              Contact Sales
                              <ArrowRight className="ml-2 w-5 h-5" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Credit Packs Section */}
      {!isLoading && !error && oneTimePackages.length > 0 && (
        <section className="py-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-gray-50 via-violet-50/30 to-gray-50" />
          <motion.div
            className="absolute top-1/2 left-0 w-96 h-96 bg-violet-400/10 rounded-full blur-3xl -translate-y-1/2"
            animate={{ x: [-50, 50, -50] }}
            transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY }}
          />

          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-14"
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-teal-500/10 to-emerald-500/10 border border-teal-200/50 text-teal-700 text-sm font-medium mb-4">
                <CreditCard className="w-4 h-4" />
                Flexible Credits
              </span>
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Need More Credits?</h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Purchase additional credit packs anytime. The more you buy, the more you save.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {oneTimePackages.map((pkg, index) => (
                <motion.div
                  key={pkg.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="relative group"
                >
                  {pkg.isFeatured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <span className="px-3 py-1 text-xs font-bold bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-full shadow-lg">
                        Best Value
                      </span>
                    </div>
                  )}
                  <div className={`relative h-full rounded-2xl p-6 transition-all duration-300 ${
                    pkg.isFeatured
                      ? 'bg-gradient-to-b from-teal-50 to-emerald-50 border-2 border-teal-300 shadow-xl shadow-teal-500/20'
                      : 'bg-white border border-gray-200 shadow-lg hover:shadow-xl hover:border-gray-300'
                  }`}>
                    <div className={`w-12 h-12 rounded-xl mb-4 flex items-center justify-center ${
                      pkg.isFeatured
                        ? 'bg-gradient-to-br from-teal-500 to-emerald-500'
                        : 'bg-gray-100'
                    }`}>
                      <Zap className={`w-6 h-6 ${pkg.isFeatured ? 'text-white' : 'text-gray-600'}`} />
                    </div>
                    <div className={`text-4xl font-bold mb-1 ${
                      pkg.isFeatured
                        ? 'bg-gradient-to-r from-teal-600 to-emerald-600 bg-clip-text text-transparent'
                        : 'text-gray-900'
                    }`}>
                      {pkg.credits.toLocaleString()}
                    </div>
                    <div className="text-gray-500 text-sm mb-4">credits</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">${pkg.priceUsd}</div>
                    <div className="text-sm text-gray-500 mb-6">
                      ${pkg.pricePerCredit.toFixed(3)} per credit
                    </div>
                    <Link href="/credits">
                      <Button
                        variant={pkg.isFeatured ? 'default' : 'outline'}
                        className={`w-full ${
                          pkg.isFeatured
                            ? 'bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white'
                            : ''
                        }`}
                      >
                        Buy Now
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features Included Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-200/50 text-violet-700 text-sm font-medium mb-4">
              <Shield className="w-4 h-4" />
              All Plans Include
            </span>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Full Feature Access</h2>
            <p className="text-xl text-gray-600">
              Every plan gives you complete access to all features
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { icon: Code2, title: 'AI Code Generation', desc: 'Generate code in any language' },
              { icon: Image, title: 'Image Generation', desc: 'Create stunning visuals with AI' },
              { icon: Video, title: 'Video Generation', desc: 'Produce AI-powered videos' },
              { icon: Cpu, title: 'All AI Models', desc: 'Access to GPT-4, Claude, and more' },
              { icon: Zap, title: 'API Access', desc: 'Full API for integrations' },
              { icon: Headphones, title: 'Priority Support', desc: 'Fast response times' },
              { icon: Shield, title: 'Enterprise Security', desc: 'SOC 2 compliant' },
              { icon: Rocket, title: 'Regular Updates', desc: 'New features every week' },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="p-6 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-violet-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-white" />

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-200/50 text-orange-700 text-sm font-medium mb-4">
              <HelpCircle className="w-4 h-4" />
              Got Questions?
            </span>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-xl text-gray-600">
              Everything you need to know about our pricing and plans
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                >
                  <AccordionItem
                    value={`item-${index}`}
                    className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow px-6 overflow-hidden"
                  >
                    <AccordionTrigger className="text-left hover:no-underline py-5 text-gray-900 font-medium">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-gray-600 pb-5">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Enterprise CTA */}
      <section className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative max-w-5xl mx-auto"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-3xl transform rotate-1" />
            <div className="relative bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 rounded-3xl p-10 sm:p-14 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />

              <div className="relative flex flex-col lg:flex-row items-center gap-10">
                <div className="flex-1 text-center lg:text-left">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium mb-6">
                    <Building2 className="w-4 h-4" />
                    Enterprise Solutions
                  </div>
                  <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
                    Need a Custom Solution?
                  </h2>
                  <p className="text-xl text-white/80 mb-8 max-w-xl">
                    Get dedicated support, custom integrations, on-premise deployment,
                    and volume discounts tailored to your organization.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                    <Link href="/contact">
                      <Button
                        size="lg"
                        className="bg-white text-violet-600 hover:bg-gray-100 px-8 py-6 text-base font-semibold shadow-xl"
                      >
                        Contact Sales
                        <ArrowRight className="ml-2 w-5 h-5" />
                      </Button>
                    </Link>
                    <Link href="/docs">
                      <Button
                        size="lg"
                        variant="outline"
                        className="border-2 border-white/50 text-white hover:bg-white/10 px-8 py-6 text-base font-semibold"
                      >
                        View Documentation
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-6">
                  {[
                    { value: '99.9%', label: 'Uptime SLA' },
                    { value: '24/7', label: 'Support' },
                    { value: '500+', label: 'Enterprise Clients' },
                    { value: '<1hr', label: 'Response Time' },
                  ].map((stat, index) => (
                    <div key={index} className="text-center p-4 rounded-2xl bg-white/10 backdrop-blur-sm">
                      <div className="text-3xl font-bold text-white">{stat.value}</div>
                      <div className="text-sm text-white/70">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
