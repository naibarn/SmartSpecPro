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
import { useTenantPage } from '@/hooks/useTenantPage';
import { Seo } from '@/components/Seo';
import {
  isWhiteLabelEligibleTopUp,
  WHITE_LABEL_MIN_TOPUP_USD,
} from '@/lib/pricingPackageEligibility';
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
      gradient: 'from-blue-500 via-cyan-500 to-teal-500',
      bgGradient: 'from-blue-50 via-cyan-50 to-teal-50',
      borderColor: 'border-blue-300',
      accentColor: 'text-blue-600',
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
      gradient: 'from-blue-500 via-cyan-500 to-teal-500',
      bgGradient: 'from-blue-50 via-cyan-50 to-teal-50',
      borderColor: 'border-blue-300',
      accentColor: 'text-blue-600',
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
      gradient: 'from-blue-500 via-cyan-500 to-teal-500',
      bgGradient: 'from-blue-50 via-cyan-50 to-teal-50',
      borderColor: 'border-cyan-200',
      accentColor: 'text-cyan-600',
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
    answer: 'Credits are the currency used for AI operations in SmartAIHub. Different operations consume different amounts of credits. For example, generating code uses 1 credit, while generating images uses 1-2 credits depending on quality. Unused credits roll over to the next month for paid plans.'
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
    answer: 'The Agency plan is designed for businesses who want to offer SmartAIHub under their own brand. It includes custom domain support, white label branding, and domain admin features to manage and allocate credits to your users.'
  },
  {
    question: 'Are domain costs included in White Label packages?',
    answer: 'No. Domain registration, renewal, and any other charges from your domain provider are not included in the package price. Purchase an eligible credit package first, then contact us to request White Label branding and custom domain setup.'
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
  const { page: tenantPage } = useTenantPage('pricing');

  // Fetch packages from API
  const { data: packages, isLoading, error } = trpc.packages.list.useQuery();

  // Extract structured sections (primary source — set in domain-admin/content)
  const heroSection = tenantPage?.sections?.find((s: { type: string }) => s.type === 'hero');
  const ctaSection  = tenantPage?.sections?.find((s: { type: string }) => s.type === 'cta');
  const faqSection  = tenantPage?.sections?.find((s: { type: string }) => s.type === 'faq');

  // Parse tenant content HTML for text sections (hero, FAQ, CTA) — legacy fallback
  const parsed = (() => {
    if (!tenantPage?.content) return null;
    const html = tenantPage.content;
    const getText = (tag: string, src: string) => {
      const m = src.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m?.[1]?.replace(/<[^>]*>/g, '').trim() || null;
    };
    // Hero
    const heroMatch = html.match(/<section[^>]*class="[^"]*hero[^"]*"[^>]*>([\s\S]*?)<\/section>/);
    const heroHtml = heroMatch?.[1] || '';
    const heroTitle = getText('h1', heroHtml);
    const heroDesc = getText('p', heroHtml);
    // FAQ
    const faqMatch = html.match(/<section[^>]*class="[^"]*faq[^"]*"[^>]*>([\s\S]*?)<\/section>/);
    const faqHtml = faqMatch?.[1] || '';
    const faqTitle = getText('h2', faqHtml);
    const faqItems: Array<{ question: string; answer: string }> = [];
    const faqRegex = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
    let fm;
    while ((fm = faqRegex.exec(faqHtml)) !== null) {
      faqItems.push({
        question: fm[1].replace(/<[^>]*>/g, '').trim(),
        answer: fm[2].replace(/<[^>]*>/g, '').trim(),
      });
    }
    // Pricing info section (additional descriptions)
    const infoMatch = html.match(/<section[^>]*class="[^"]*(?:pricing-info|info)[^"]*"[^>]*>([\s\S]*?)<\/section>/);
    const infoHtml = infoMatch?.[1] || '';
    const infoTexts: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/g;
    let pm;
    while ((pm = pRegex.exec(infoHtml)) !== null) {
      const text = pm[1].replace(/<[^>]*>/g, '').trim();
      if (text) infoTexts.push(text);
    }
    // CTA / Enterprise
    const ctaMatch = html.match(/<section[^>]*class="[^"]*(?:cta|enterprise)[^"]*"[^>]*>([\s\S]*?)<\/section>/);
    const ctaHtml = ctaMatch?.[1] || '';
    const ctaTitle = getText('h2', ctaHtml);
    const ctaDesc = getText('p', ctaHtml);
    return { heroTitle, heroDesc, infoTexts, faqTitle, faqItems, ctaTitle, ctaDesc };
  })();

  // Separate packages by type
  const subscriptionPackages = packages?.filter(p => p.packageType === 'subscription') || [];
  const agencyPackages = packages?.filter(p => p.packageType === 'agency') || [];
  const oneTimePackages = packages?.filter(p => p.packageType === 'one_time') || [];
  const whiteLabelTopUpPackages = oneTimePackages.filter(isWhiteLabelEligibleTopUp);
  const creditPackPackages = oneTimePackages.filter((pkg) => !isWhiteLabelEligibleTopUp(pkg));

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
      <Seo
        title="SmartAIHub Pricing | Plans for Skill Marketplace Teams"
        description="Flexible plans for teams building with skill marketplaces, virtual workflows, and swarm execution."
        keywords={["SmartAIHub pricing", "enterprise AI pricing", "skill marketplace plans", "workflow automation pricing"]}
        canonicalPath="/pricing"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "SmartAIHub Pricing",
            description: "Pricing plans for skill marketplaces and workflow orchestration.",
            url: "/pricing",
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
              },
            })),
          },
        ]}
      />
      <Navbar />

      {/* Hero Section with Aurora Background */}
      <section className="relative overflow-hidden pt-24 pb-12 sm:pt-28 sm:pb-16 lg:pt-32 lg:pb-20">
        {/* Animated Aurora Background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-100/40 via-transparent to-cyan-100/40" />
          <motion.div
            className="absolute top-0 left-1/4 hidden h-[600px] w-[600px] rounded-full bg-gradient-to-br from-blue-400/20 via-cyan-400/20 to-teal-400/20 blur-3xl sm:block"
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
            className="absolute top-20 right-1/4 hidden h-[500px] w-[500px] rounded-full bg-gradient-to-br from-teal-400/20 via-emerald-400/20 to-cyan-400/20 blur-3xl sm:block"
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
              className="mb-5 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-blue-200/50 bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-teal-500/10 px-4 py-2.5 backdrop-blur-sm sm:mb-6 sm:px-5"
            >
              <Crown className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold bg-gradient-to-r from-blue-600 to-teal-600 bg-clip-text text-transparent">
                Simple, Transparent Pricing
              </span>
              <span className="whitespace-nowrap rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-2 py-0.5 text-xs font-medium text-white">
                No Hidden Fees
              </span>
            </motion.div>

            {/* Main Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-5 text-4xl font-bold leading-tight sm:mb-6 sm:text-5xl md:text-6xl lg:text-7xl"
            >
              {heroSection?.title || parsed?.heroTitle || (<><span className="text-gray-900">Choose Your</span><br /><span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 bg-clip-text text-transparent">Perfect Plan</span></>)}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mx-auto mb-8 max-w-2xl text-base leading-7 text-gray-600 sm:mb-10 sm:text-lg md:text-xl"
            >
              {heroSection?.subtitle || heroSection?.content || parsed?.heroDesc || 'All plans include full access to every feature. Choose based on the credits you need.'}
            </motion.p>

            {/* Billing Period Toggle */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mx-auto grid w-full max-w-sm grid-cols-2 items-center gap-2 rounded-2xl border border-gray-200 bg-white/80 p-2 shadow-lg shadow-gray-200/50 backdrop-blur-sm sm:inline-flex sm:w-auto sm:max-w-none"
            >
              {(['monthly', 'quarterly', 'semi_annual', 'yearly'] as BillingPeriod[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setBillingPeriod(period)}
                  className={`min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 sm:px-4 ${
                    billingPeriod === period
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30'
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
                  className="col-span-2 justify-self-center rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/30 sm:col-span-1"
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
        <section className="py-12 sm:py-16">
          <div className="container mx-auto px-4 text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-500" />
            <p className="mt-4 text-gray-600">Loading pricing plans...</p>
          </div>
        </section>
      )}

      {/* Error State */}
      {error && (
        <section className="py-12 sm:py-16">
          <div className="container mx-auto px-4 text-center">
            <p className="text-red-600">Failed to load pricing plans. Please try again later.</p>
          </div>
        </section>
      )}

      {/* Subscription Plans */}
      {!isLoading && !error && subscriptionPackages.length > 0 && (
        <section className="relative py-12 sm:py-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
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
                          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 px-4 py-2 text-sm font-bold text-white shadow-xl shadow-blue-500/40 sm:px-6"
                        >
                          <Star className="w-4 h-4 fill-current" />
                          Most Popular
                        </motion.div>
                      </div>
                    )}

                    {/* Card */}
                    <div className={`relative h-full overflow-hidden rounded-2xl transition-all duration-500 sm:rounded-3xl ${
                      pkg.isFeatured
                        ? 'bg-gradient-to-b from-white to-blue-50/50 border-2 border-blue-300 shadow-2xl shadow-blue-500/20 hover:shadow-blue-500/30'
                        : 'bg-white/80 backdrop-blur-sm border border-gray-200 shadow-xl shadow-gray-200/50 hover:shadow-2xl hover:shadow-gray-300/50 hover:border-gray-300'
                    }`}>
                      <div className="relative p-5 sm:p-6">
                        {/* Icon */}
                        <div className={`w-14 h-14 rounded-2xl mb-4 flex items-center justify-center bg-gradient-to-br ${style.gradient} shadow-lg`}>
                          <Icon className="w-7 h-7 text-white" />
                        </div>

                        {/* Plan Name */}
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{pkg.name}</h3>

                        {/* Price */}
                        <div className="mb-4">
                          <div className="flex items-baseline gap-1">
                            <span className={`text-4xl font-bold ${pkg.isFeatured ? 'bg-gradient-to-r from-blue-600 to-teal-600 bg-clip-text text-transparent' : 'text-gray-900'}`}>
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
                            pkg.isFeatured ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
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
                            className={`h-auto min-h-11 w-full whitespace-normal rounded-xl py-3 text-center text-sm font-semibold leading-snug transition-all duration-300 ${
                              pkg.isFeatured
                                ? 'bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 text-white hover:from-blue-600 hover:via-cyan-600 hover:to-teal-600 shadow-lg shadow-blue-500/30'
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

      {/* White Label Section */}
      {!isLoading && !error && (agencyPackages.length > 0 || whiteLabelTopUpPackages.length > 0) && (
        <section className="relative overflow-hidden py-12 sm:py-16">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 via-cyan-50/30 to-white" />

          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-8 text-center sm:mb-10"
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-200/50 text-blue-700 text-sm font-medium mb-4">
                <Globe className="w-4 h-4" />
                White Label Solution
              </span>
              <h2 className="mb-3 text-3xl font-bold leading-tight text-gray-900 sm:mb-4 sm:text-4xl">White Label &amp; Custom Domain</h2>
              <p className="mx-auto max-w-2xl text-base leading-7 text-gray-600 sm:text-xl">
                Buy a qualifying top-up through /credits, then contact us to activate your own brand and custom domain. Agency plans are handled through Contact Sales.
              </p>
              <p className="mx-auto mt-3 max-w-2xl text-sm font-medium leading-6 text-amber-700">
                Package prices do not include domain registration, renewal, or any other domain provider fees.
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
                  <div className="relative rounded-2xl bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 p-1 sm:rounded-3xl">
                    <div className="rounded-[1.125rem] bg-white p-5 sm:p-8 md:p-10">
                      <div className="grid items-center gap-8 md:grid-cols-2">
                        {/* Left: Features */}
                        <div>
                          <h3 className="mb-3 text-2xl font-bold text-gray-900 sm:mb-4">{pkg.name}</h3>
                          <p className="mb-5 leading-7 text-gray-600 sm:mb-6">
                            Everything in subscription plans, plus exclusive white label features:
                          </p>
                          <ul className="space-y-3">
                            {agencyFeatures.map((feature) => (
                              <li key={feature} className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
                                  <Check className="w-3.5 h-3.5 text-white" />
                                </div>
                                <span className="text-gray-700 font-medium">{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Right: Pricing */}
                        <div className="text-center md:text-right">
                          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold mb-4">
                            <Zap className="w-4 h-4" />
                            {pkg.credits.toLocaleString()} credits/month
                          </div>
                          <div className="mb-2">
                            <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl md:text-6xl">
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
                              className="h-auto min-h-12 w-full bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 px-8 py-3 text-base font-semibold text-white shadow-xl shadow-blue-500/30 hover:from-blue-600 hover:via-cyan-600 hover:to-teal-600 sm:w-auto sm:py-6"
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

            {whiteLabelTopUpPackages.length > 0 && (
              <div className="mx-auto mt-10 max-w-6xl">
                <div className="mb-5 text-center">
                  <h3 className="text-2xl font-bold text-gray-900">White Label Eligible Credit Packages</h3>
                  <p className="mt-2 text-gray-600">
                    One-time credit purchases of ${WHITE_LABEL_MIN_TOPUP_USD} or more qualify for White Label onboarding.
                  </p>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  {whiteLabelTopUpPackages.map((pkg, index) => (
                    <motion.article
                      key={pkg.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                      className="relative flex h-full flex-col rounded-2xl border-2 border-blue-200 bg-white p-5 shadow-lg shadow-blue-500/10 sm:p-6"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg">
                          <Globe className="h-6 w-6 text-white" />
                        </div>
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                          White Label Eligible
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900">{pkg.name}</h3>
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-4xl font-bold text-transparent">
                          ${pkg.priceUsd.toFixed(2)}
                        </span>
                        <span className="text-sm text-gray-500">one-time</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {pkg.credits.toLocaleString()} credits · ${pkg.pricePerCredit.toFixed(3)} per credit
                      </p>
                      <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                        Domain registration and renewal fees are not included.
                      </p>
                      <p className="mt-3 flex-1 text-sm leading-6 text-gray-600">
                        Purchase credits now, then contact us to activate White Label branding and your custom domain.
                      </p>
                      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        <Link href="/credits" className="flex-1">
                          <Button className="h-11 w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/20 hover:from-blue-600 hover:to-cyan-600">
                            Buy Now
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href="/contact" className="flex-1">
                          <Button variant="outline" className="h-11 w-full border-blue-200 text-blue-700 hover:bg-blue-50">
                            Request Custom Domain
                          </Button>
                        </Link>
                      </div>
                    </motion.article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Credit Packs Section */}
      {!isLoading && !error && creditPackPackages.length > 0 && (
        <section className="relative overflow-hidden py-14 sm:py-20">
          <div className="absolute inset-0 bg-gradient-to-b from-gray-50 via-blue-50/30 to-gray-50" />
          <motion.div
            className="absolute top-1/2 left-0 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl -translate-y-1/2"
            animate={{ x: [-50, 50, -50] }}
            transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY }}
          />

          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-10 text-center sm:mb-14"
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-teal-500/10 to-emerald-500/10 border border-teal-200/50 text-teal-700 text-sm font-medium mb-4">
                <CreditCard className="w-4 h-4" />
                Flexible Credits
              </span>
              <h2 className="mb-3 text-3xl font-bold leading-tight text-gray-900 sm:mb-4 sm:text-4xl">Need More Credits?</h2>
              <p className="mx-auto max-w-2xl text-base leading-7 text-gray-600 sm:text-xl">
                Purchase additional credit packs anytime. The more you buy, the more you save.
              </p>
            </motion.div>

            <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {creditPackPackages.map((pkg, index) => (
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
                  <div className={`relative h-full rounded-2xl p-5 transition-all duration-300 sm:p-6 ${
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
                        className={`h-11 w-full ${
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
      <section className="py-14 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-10 text-center sm:mb-14"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-200/50 text-blue-700 text-sm font-medium mb-4">
              <Shield className="w-4 h-4" />
              All Plans Include
            </span>
            <h2 className="mb-3 text-3xl font-bold leading-tight text-gray-900 sm:mb-4 sm:text-4xl">Full Feature Access</h2>
            <p className="text-base leading-7 text-gray-600 sm:text-xl">
              {parsed?.infoTexts && parsed.infoTexts.length > 0
                ? parsed.infoTexts.join(' ')
                : 'Every plan gives you complete access to all features'}
            </p>
          </motion.div>

          <div className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
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
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="relative overflow-hidden py-14 sm:py-20">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-white" />

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-10 text-center sm:mb-14"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-200/50 text-orange-700 text-sm font-medium mb-4">
              <HelpCircle className="w-4 h-4" />
              Got Questions?
            </span>
            <h2 className="mb-3 text-3xl font-bold leading-tight text-gray-900 sm:mb-4 sm:text-4xl">{faqSection?.title || parsed?.faqTitle || 'Frequently Asked Questions'}</h2>
            <p className="text-base leading-7 text-gray-600 sm:text-xl">
              Everything you need to know about our pricing and plans
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {(parsed?.faqItems && parsed.faqItems.length > 0 ? parsed.faqItems : faqs).map((faq, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                >
                  <AccordionItem
                    value={`item-${index}`}
                    className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 shadow-sm transition-shadow hover:shadow-md sm:px-6"
                  >
                    <AccordionTrigger className="py-5 text-left font-medium text-gray-900 hover:no-underline">
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
      <section className="py-14 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative max-w-5xl mx-auto"
          >
            <div className="absolute inset-0 hidden rotate-1 transform rounded-3xl bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-500 sm:block" />
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 p-6 sm:rounded-3xl sm:p-10 lg:p-14">
              <div className="absolute top-0 right-0 hidden h-64 w-64 rounded-full bg-white/10 blur-3xl sm:block" />
              <div className="absolute bottom-0 left-0 hidden h-64 w-64 rounded-full bg-white/10 blur-3xl sm:block" />

              <div className="relative flex flex-col items-center gap-8 lg:flex-row lg:gap-10">
                <div className="flex-1 text-center lg:text-left">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-medium mb-6">
                    <Building2 className="w-4 h-4" />
                    Enterprise Solutions
                  </div>
                  <h2 className="mb-4 text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
                    {ctaSection?.title || parsed?.ctaTitle || 'Need a Custom Solution?'}
                  </h2>
                  <p className="mb-6 max-w-xl text-base leading-7 text-white/80 sm:mb-8 sm:text-xl">
                    {ctaSection?.subtitle || ctaSection?.content || parsed?.ctaDesc || 'Get dedicated support, custom integrations, on-premise deployment, and volume discounts tailored to your organization.'}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                    <Link href="/contact">
                      <Button
                        size="lg"
                        className="h-auto min-h-12 w-full bg-white px-8 py-3 text-base font-semibold text-blue-600 shadow-xl hover:bg-gray-100 sm:w-auto sm:py-6"
                      >
                        Contact Sales
                        <ArrowRight className="ml-2 w-5 h-5" />
                      </Button>
                    </Link>
                    <Link href="/docs">
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-auto min-h-12 w-full border-2 border-white/50 px-8 py-3 text-base font-semibold text-white hover:bg-white/10 sm:w-auto sm:py-6"
                      >
                        View Documentation
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid w-full grid-cols-2 gap-3 sm:gap-6 lg:w-auto">
                  {[
                    { value: '99.9%', label: 'Uptime SLA' },
                    { value: '24/7', label: 'Support' },
                    { value: '500+', label: 'Enterprise Clients' },
                    { value: '<1hr', label: 'Response Time' },
                  ].map((stat, index) => (
                    <div key={index} className="rounded-2xl bg-white/10 p-4 text-center backdrop-blur-sm">
                      <div className="text-2xl font-bold text-white sm:text-3xl">{stat.value}</div>
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
