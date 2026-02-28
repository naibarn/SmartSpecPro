/**
 * Features Page
 * Design: Ethereal Gradient Flow
 * Showcases all SmartAIHub features in detail
 */

import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { useTenantPage } from '@/hooks/useTenantPage';
import {
  Code2,
  Sparkles,
  Zap,
  Shield,
  Layers,
  GitBranch,
  Image,
  Video,
  Mic,
  Database,
  Lock,
  Users,
  Workflow,
  Brain,
  Globe,
  Cpu,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';

const mainFeatures = [
  {
    icon: Code2,
    title: 'AI Code Generation',
    description: 'Transform natural language descriptions into clean, production-ready code. Our AI understands context, follows best practices, and generates code that actually works.',
    benefits: [
      'Support for 20+ programming languages',
      'Framework-aware code generation',
      'Automatic error handling',
      'Clean, documented code output'
    ],
    image: '/images/ai-code-generation.png'
  },
  {
    icon: Workflow,
    title: 'Workflow Automation',
    description: 'Automate repetitive development tasks with intelligent workflows. From code reviews to deployment, let AI handle the mundane while you focus on innovation.',
    benefits: [
      'Custom workflow templates',
      'CI/CD integration',
      'Automated testing',
      'Smart task scheduling'
    ],
    image: '/images/workflow-automation.png'
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Bank-grade security for your code and data. Multi-factor authentication, encrypted storage, and comprehensive audit logs keep your projects safe.',
    benefits: [
      'End-to-end encryption',
      'MFA with TOTP support',
      'Role-based access control',
      'SOC 2 compliance ready'
    ],
    image: '/images/security-shield.png'
  }
];

const additionalFeatures = [
  {
    icon: Image,
    title: 'Image Generation',
    description: 'Generate stunning visuals for your applications with AI-powered image creation.'
  },
  {
    icon: Video,
    title: 'Video Generation',
    description: 'Create promotional videos, tutorials, and demos with automated video generation.'
  },
  {
    icon: Mic,
    title: 'Audio & Speech',
    description: 'Text-to-speech and audio generation for podcasts, voiceovers, and more.'
  },
  {
    icon: Database,
    title: 'Smart Database',
    description: 'AI-assisted database design with automatic schema optimization.'
  },
  {
    icon: Lock,
    title: 'Secure Key Management',
    description: 'Enterprise-grade API key management with rotation and audit trails.'
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Real-time collaboration features for teams of any size.'
  },
  {
    icon: Brain,
    title: 'Memory System',
    description: 'AI remembers your preferences and project context for better suggestions.'
  },
  {
    icon: Globe,
    title: 'Multi-language Support',
    description: 'Generate code in 20+ programming languages and frameworks.'
  },
  {
    icon: Cpu,
    title: 'Multiple AI Models',
    description: 'Access to GPT-4, Claude, Gemini, and other cutting-edge models.'
  }
];

const integrations = [
  { name: 'GitHub', logo: '🐙' },
  { name: 'GitLab', logo: '🦊' },
  { name: 'VS Code', logo: '💻' },
  { name: 'Slack', logo: '💬' },
  { name: 'Jira', logo: '📋' },
  { name: 'Notion', logo: '📝' },
  { name: 'Discord', logo: '🎮' },
  { name: 'Vercel', logo: '▲' },
];

export default function Features() {
  const { page: tenantPage } = useTenantPage('features');

  // Sections-first approach (same pattern as Home.tsx)
  const heroSection    = tenantPage?.sections?.find(s => s.type === 'hero');
  const featuresSection = tenantPage?.sections?.find(s => s.type === 'features');
  const ctaSection     = tenantPage?.sections?.find(s => s.type === 'cta');
  const mainFeaturesSection = tenantPage?.sections?.find(
    s => s.type === 'content' && (s.settings as Record<string,string> | undefined)?.sectionType === 'main-features'
  );
  const integrationsSection = tenantPage?.sections?.find(
    s => s.type === 'content' && (s.settings as Record<string,string> | undefined)?.sectionType === 'integrations'
  );

  // Parse content HTML as fallback when sections are absent (FIXED condition: skip if sections cover it)
  const parsed = (() => {
    if (heroSection || !tenantPage?.content) return null;
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
    // Main features with benefits
    const mainMatch = html.match(/<section[^>]*class="[^"]*main[^"]*"[^>]*>([\s\S]*?)<\/section>/);
    const mainHtml = mainMatch?.[1] || '';
    const mainItems: Array<{ title: string; description: string; benefits: string[] }> = [];
    const detailRegex = /<div[^>]*class="[^"]*feature-detail[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div|$)/g;
    let dm;
    while ((dm = detailRegex.exec(mainHtml)) !== null) {
      const block = dm[1];
      const title = getText('h2', block) || '';
      const desc = getText('p', block) || '';
      const benefits: string[] = [];
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/g;
      let lm;
      while ((lm = liRegex.exec(block)) !== null) {
        benefits.push(lm[1].replace(/<[^>]*>/g, '').trim());
      }
      mainItems.push({ title, description: desc, benefits });
    }
    // Additional features
    const addMatch = html.match(/<section[^>]*class="[^"]*additional[^"]*"[^>]*>([\s\S]*?)<\/section>/);
    const addHtml = addMatch?.[1] || '';
    const addTitle = getText('h2', addHtml);
    const addItems: Array<{ title: string; description: string }> = [];
    const addItemRegex = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g;
    let am;
    while ((am = addItemRegex.exec(addHtml)) !== null) {
      addItems.push({
        title: am[1].replace(/<[^>]*>/g, '').trim(),
        description: am[2].replace(/<[^>]*>/g, '').trim(),
      });
    }
    // CTA
    const ctaMatch = html.match(/<section[^>]*class="[^"]*cta[^"]*"[^>]*>([\s\S]*?)<\/section>/);
    const ctaHtml = ctaMatch?.[1] || '';
    const ctaTitle = getText('h2', ctaHtml);
    const ctaDesc = getText('p', ctaHtml);
    return { heroTitle, heroDesc, mainItems, addTitle, addItems, ctaTitle, ctaDesc };
  })();

  // Integrations: sections → hardcoded fallback
  const displayIntegrations = (integrationsSection?.items as Array<{name:string;logo:string}> | undefined)?.length
    ? (integrationsSection!.items as Array<{name:string;logo:string}>)
    : integrations;

  // Additional features: sections items → parsed → hardcoded
  const displayAdditionalFeatures = (() => {
    const items = featuresSection?.items as Array<{ title: string; description: string }> | undefined;
    if (items && items.length > 0) {
      return items.map((item, i) => ({
        icon: additionalFeatures[i]?.icon || Sparkles,
        title: item.title,
        description: item.description,
      }));
    }
    if (parsed?.addItems && parsed.addItems.length > 0) {
      return parsed.addItems.map((item, i) => ({
        icon: additionalFeatures[i]?.icon || Sparkles,
        title: item.title,
        description: item.description,
      }));
    }
    return additionalFeatures;
  })();

  // Main features: sections → parsed HTML → hardcoded
  const displayMainFeatures = (() => {
    type SectionMainItem = { title: string; description: string; benefits?: string[]; image?: string };
    const sItems = mainFeaturesSection?.items as SectionMainItem[] | undefined;
    if (sItems?.length) {
      return sItems.map((item, i) => ({
        ...(mainFeatures[i] ?? mainFeatures[0]),
        title: item.title,
        description: item.description,
        benefits: item.benefits?.length ? item.benefits : (mainFeatures[i]?.benefits ?? []),
        image: item.image ?? mainFeatures[i]?.image ?? mainFeatures[0].image,
      }));
    }
    if (parsed?.mainItems && parsed.mainItems.length > 0) {
      return parsed.mainItems.map((item, i) => ({
        ...(mainFeatures[i] || mainFeatures[0]),
        title: item.title,
        description: item.description,
        benefits: item.benefits.length > 0 ? item.benefits : (mainFeatures[i]?.benefits || []),
      }));
    }
    return mainFeatures;
  })();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              Powerful Features
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6">
              {heroSection?.title || parsed?.heroTitle || (<>Everything You Need to{' '}<span className="gradient-text">Build Faster</span></>)}
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              {heroSection?.subtitle || heroSection?.content || parsed?.heroDesc || 'SmartAIHub combines cutting-edge AI with developer-friendly tools to supercharge your productivity.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-violet-500 to-teal-400 text-white"
              >
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Link href="/pricing">
                <Button size="lg" variant="outline">
                  View Pricing
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Main Features */}
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {displayMainFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className={`flex flex-col ${index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-12 items-center mb-24 last:mb-0`}
            >
              {/* Image */}
              <div className="flex-1">
                <div className="glass-card rounded-2xl p-4 shadow-2xl">
                  <img 
                    src={feature.image} 
                    alt={feature.title}
                    className="w-full rounded-xl"
                  />
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-teal-400 flex items-center justify-center mb-6">
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">{feature.title}</h2>
                <p className="text-lg text-muted-foreground mb-6">{feature.description}</p>
                <ul className="space-y-3">
                  {feature.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Additional Features Grid */}
      <section className="py-24 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Zap className="w-4 h-4" />
              And Much More
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              {featuresSection?.title || parsed?.addTitle || (<>Packed with <span className="gradient-text">Powerful Tools</span></>)}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Every feature is designed to help you build better software, faster.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayAdditionalFeatures.map((feature: any, index: number) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="glass-card h-full hover:shadow-xl transition-all duration-300 group">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-teal-400/20 flex items-center justify-center mb-4 group-hover:from-violet-500 group-hover:to-teal-400 transition-all duration-300">
                      <feature.icon className="w-6 h-6 text-primary group-hover:text-white transition-colors" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <GitBranch className="w-4 h-4" />
              Integrations
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Works with Your <span className="gradient-text">Favorite Tools</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Seamlessly integrate with the tools you already use and love.
            </p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-6">
            {displayIntegrations.map((integration, index) => (
              <motion.div
                key={integration.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="glass-card rounded-xl p-6 text-center hover:shadow-lg transition-shadow"
              >
                <div className="text-4xl mb-2">{integration.logo}</div>
                <div className="text-sm font-medium">{integration.name}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card rounded-2xl p-8 sm:p-12 text-center max-w-4xl mx-auto"
          >
            <Sparkles className="w-16 h-16 mx-auto mb-6 text-primary" />
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              {ctaSection?.title || parsed?.ctaTitle || 'Ready to Experience the Future of Development?'}
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              {ctaSection?.subtitle || ctaSection?.content || parsed?.ctaDesc || 'Join thousands of developers who are already building faster with SmartAIHub.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-violet-500 to-teal-400 text-white"
              >
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Link href="/docs">
                <Button size="lg" variant="outline">
                  Read Documentation
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
