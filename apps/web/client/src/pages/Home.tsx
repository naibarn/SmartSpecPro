/**
 * Home Page - Landing Page
 * Design: Ethereal Gradient Flow
 * Sections: Hero, Features, How It Works, Testimonials, CTA
 */

import { useAuth } from '@/_core/hooks/useAuth';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { useTenantPage } from '@/hooks/useTenantPage';
import {
  Sparkles,
  Code2,
  Zap,
  Shield,
  Layers,
  GitBranch,
  Play,
  ArrowRight,
  CheckCircle2,
  Star,
  Users,
  Rocket,
  Brain,
  Globe,
  Mail,
  Database,
  LayoutGrid,
} from 'lucide-react';

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

const features = [
  {
    icon: Code2,
    title: 'AI Code Generation',
    description: 'Transform natural language into production-ready code with our advanced AI models.',
    image: '/images/ai-code-generation.png'
  },
  {
    icon: Layers,
    title: 'Workflow Automation',
    description: 'Automate repetitive tasks and streamline your development workflow.',
    image: '/images/workflow-automation.png'
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Bank-grade encryption, MFA, and comprehensive audit logs for your peace of mind.',
    image: '/images/security-shield.png'
  }
];

const stats = [
  { value: '10K+', label: 'Developers' },
  { value: '500K+', label: 'Lines Generated' },
  { value: '99.9%', label: 'Uptime' },
  { value: '4.9/5', label: 'Rating' }
];

const howItWorks = [
  {
    step: '01',
    title: 'Describe Your Idea',
    description: 'Simply describe what you want to build in natural language. Our AI understands context and requirements.'
  },
  {
    step: '02',
    title: 'AI Generates Code',
    description: 'SmartSpec analyzes your requirements and generates clean, production-ready code with best practices.'
  },
  {
    step: '03',
    title: 'Deploy & Scale',
    description: 'Review, customize, and deploy your application. Scale effortlessly with our cloud infrastructure.'
  }
];

export default function Home() {
  const { page: tenantPage } = useTenantPage('home');

  // Extract tenant section data if available, to merge into the luxurious design
  const heroSection        = tenantPage?.sections?.find(s => s.type === 'hero');
  const featuresSection    = tenantPage?.sections?.find(s => s.type === 'features');
  const ctaSection         = tenantPage?.sections?.find(s => s.type === 'cta');
  const statsSection       = tenantPage?.sections?.find(s => s.type === 'stats');
  const processSection     = tenantPage?.sections?.find(s => s.type === 'process');
  const testimonialsSection = tenantPage?.sections?.find(s => s.type === 'testimonials');

  // Content-managed display data (sections → hardcoded fallback)
  const displayStats = (statsSection?.items as Array<{value:string;label:string}> | undefined)?.length
    ? (statsSection!.items as Array<{value:string;label:string}>)
    : stats;

  const displayHowItWorks = (processSection?.items as Array<{step:string;title:string;description:string}> | undefined)?.length
    ? (processSection!.items as Array<{step:string;title:string;description:string}>)
    : howItWorks;

  const displayTestimonials = (testimonialsSection?.items as Array<{quote:string;author:string;role:string;avatar:string}> | undefined)?.length
    ? (testimonialsSection!.items as Array<{quote:string;author:string;role:string;avatar:string}>)
    : [
        { quote: "SmartSpec Pro has completely transformed how we build applications. What used to take weeks now takes days.", author: "Sarah Chen", role: "CTO at TechStart", avatar: "SC" },
        { quote: "The AI code generation is incredibly accurate. It understands context and produces clean, maintainable code.", author: "Michael Park", role: "Senior Developer", avatar: "MP" },
        { quote: "Finally, a tool that actually delivers on its promises. The ROI has been phenomenal for our team.", author: "Emily Rodriguez", role: "Engineering Lead", avatar: "ER" },
      ];

  // Parse content HTML as fallback when sections are null
  const parsedContent = (() => {
    if (heroSection || !tenantPage?.content) return null;
    const html = tenantPage.content;
    const getTextBetween = (tag: string, src: string) => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
      const match = src.match(regex);
      return match?.[1]?.replace(/<[^>]*>/g, '').trim() || null;
    };
    // Extract hero h1 and first p from first section
    const heroMatch = html.match(/<section[^>]*class="[^"]*hero[^"]*"[^>]*>([\s\S]*?)<\/section>/);
    const heroHtml = heroMatch?.[1] || '';
    const heroTitle = getTextBetween('h1', heroHtml);
    const heroDesc = getTextBetween('p', heroHtml);
    // Extract features section items
    const featMatch = html.match(/<section[^>]*class="[^"]*feature[^"]*"[^>]*>([\s\S]*?)<\/section>/);
    const featHtml = featMatch?.[1] || '';
    const featTitle = getTextBetween('h2', featHtml);
    const featItems: Array<{ title: string; description: string }> = [];
    const itemRegex = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(featHtml)) !== null) {
      featItems.push({
        title: itemMatch[1].replace(/<[^>]*>/g, '').trim(),
        description: itemMatch[2].replace(/<[^>]*>/g, '').trim(),
      });
    }
    // Extract CTA section
    const ctaMatch = html.match(/<section[^>]*class="[^"]*cta[^"]*"[^>]*>([\s\S]*?)<\/section>/);
    const ctaHtml = ctaMatch?.[1] || '';
    const ctaTitle = getTextBetween('h2', ctaHtml);
    const ctaDesc = getTextBetween('p', ctaHtml);
    return { heroTitle, heroDesc, featTitle, featItems, ctaTitle, ctaDesc };
  })();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        {/* Background */}
        <div className="absolute inset-0">
          <img 
            src="/images/hero-gradient.png" 
            alt="" 
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background" />
        </div>
        
        {/* Floating Orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-violet-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <motion.div 
            className="max-w-4xl mx-auto text-center"
            initial="initial"
            animate="animate"
            variants={staggerContainer}
          >
            {/* Badge */}
            <motion.div variants={fadeInUp} className="mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                Powered by Advanced AI
              </span>
            </motion.div>
            
            {/* Headline */}
            <motion.h1
              variants={fadeInUp}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight"
            >
              {heroSection?.title || parsedContent?.heroTitle || (<>Transform Ideas into{' '}<span className="gradient-text">Production-Ready</span>{' '}Applications</>)}
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={fadeInUp}
              className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto"
            >
              {heroSection?.subtitle || heroSection?.content || parsedContent?.heroDesc || 'SmartSpec Pro uses cutting-edge AI to generate clean, scalable code from natural language descriptions. Build SaaS applications 10x faster.'}
            </motion.p>
            
            {/* CTA Buttons */}
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              {heroSection?.buttons && heroSection.buttons.length > 0
                ? heroSection.buttons.map((btn, i) => (
                    <Link key={i} href={btn.link}>
                      <Button
                        size="lg"
                        variant={btn.style === 'outline' ? 'outline' : 'default'}
                        className={btn.style !== 'outline'
                          ? "bg-gradient-to-r from-violet-500 to-teal-400 hover:from-violet-600 hover:to-teal-500 text-white shadow-xl shadow-violet-500/25 text-lg px-8"
                          : "text-lg px-8 bg-background/50 backdrop-blur-sm"
                        }
                      >
                        {i === 0 && btn.style !== 'outline' && <Sparkles className="mr-2 w-5 h-5" />}
                        {i > 0 && btn.style === 'outline' && <Play className="mr-2 w-5 h-5" />}
                        {btn.text}
                        {btn.style !== 'outline' && <ArrowRight className="ml-2 w-5 h-5" />}
                      </Button>
                    </Link>
                  ))
                : (
                  <>
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-violet-500 to-teal-400 hover:from-violet-600 hover:to-teal-500 text-white shadow-xl shadow-violet-500/25 text-lg px-8"
                    >
                      Start Building Free
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-lg px-8 bg-background/50 backdrop-blur-sm"
                    >
                      <Play className="mr-2 w-5 h-5" />
                      Watch Demo
                    </Button>
                  </>
                )
              }
            </motion.div>
            
            {/* Social Proof */}
            <motion.div variants={fadeInUp} className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {[1,2,3,4,5].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-teal-400 border-2 border-background" />
                  ))}
                </div>
                <span>10,000+ developers</span>
              </div>
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map((i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
                <span className="ml-1">4.9/5 rating</span>
              </div>
            </motion.div>
          </motion.div>
          
          {/* Dashboard Preview */}
          <motion.div 
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-16 max-w-5xl mx-auto"
          >
            <div className="glass-card rounded-2xl p-2 shadow-2xl">
              <img 
                src="/images/dashboard-preview.png" 
                alt="SmartSpec Dashboard" 
                className="w-full rounded-xl"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {displayStats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-center"
              >
                <div className="text-3xl sm:text-4xl font-bold gradient-text mb-2">
                  {stat.value}
                </div>
                <div className="text-muted-foreground">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Zap className="w-4 h-4" />
              Powerful Features
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              {featuresSection?.title || parsedContent?.featTitle || (<>Everything You Need to{' '}<span className="gradient-text">Build Faster</span></>)}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {featuresSection?.subtitle || 'From code generation to deployment, SmartSpec Pro provides all the tools you need to accelerate your development workflow.'}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {(featuresSection?.items && featuresSection.items.length > 0
              ? featuresSection.items.map((item: any, index: number) => ({
                  icon: features[index]?.icon || Code2,
                  title: item.title,
                  description: item.description,
                  image: features[index]?.image || '/images/ai-code-generation.png',
                }))
              : parsedContent?.featItems && parsedContent.featItems.length > 0
              ? parsedContent.featItems.map((item, index) => ({
                  icon: features[index]?.icon || Code2,
                  title: item.title,
                  description: item.description,
                  image: features[index]?.image || '/images/ai-code-generation.png',
                }))
              : features
            ).map((feature: any, index: number) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="glass-card h-full hover:shadow-2xl transition-all duration-300 group overflow-hidden">
                  <CardContent className="p-6">
                    <div className="aspect-square rounded-xl overflow-hidden mb-6 bg-gradient-to-br from-violet-100 to-teal-100">
                      <img
                        src={feature.image}
                        alt={feature.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-teal-400 flex items-center justify-center mb-4">
                      {feature.icon && <feature.icon className="w-6 h-6 text-white" />}
                    </div>
                    <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Gallery Section */}
      <section className="py-24 bg-muted/30 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Copy */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                <LayoutGrid className="w-4 h-4" />
                Workflow Gallery
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
                60+ Ready-to-Use{' '}
                <span className="gradient-text">Workflow Templates</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-6">
                Browse our curated library of AI automation workflows — from content generation to data pipelines, customer support to media creation. Pick a template and get started in minutes.
              </p>

              {/* Category pills */}
              <div className="flex flex-wrap gap-2 mb-8">
                {[
                  { label: 'Content & Marketing', color: 'bg-violet-100 text-violet-700' },
                  { label: 'Customer Support', color: 'bg-blue-100 text-blue-700' },
                  { label: 'Data & Analytics', color: 'bg-orange-100 text-orange-700' },
                  { label: 'Media Generation', color: 'bg-amber-100 text-amber-700' },
                  { label: 'DevOps & Code', color: 'bg-teal-100 text-teal-700' },
                  { label: 'E-commerce', color: 'bg-pink-100 text-pink-700' },
                ].map((cat) => (
                  <span
                    key={cat.label}
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${cat.color}`}
                  >
                    {cat.label}
                  </span>
                ))}
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                  +9 more
                </span>
              </div>

              <Link href="/workflows/gallery">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-violet-500 to-teal-400 hover:from-violet-600 hover:to-teal-500 text-white shadow-xl shadow-violet-500/25"
                >
                  <LayoutGrid className="mr-2 w-5 h-5" />
                  Browse All Templates
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            </motion.div>

            {/* Right: Visual template cards preview */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="relative"
            >
              {/* Decorative grid of mini cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Brain, title: 'AI Blog Writer', steps: 5, category: 'Content', color: '#3B82F6' },
                  { icon: Mail, title: 'Email Campaign', steps: 4, category: 'Marketing', color: '#8B5CF6' },
                  { icon: Database, title: 'Data Pipeline', steps: 7, category: 'Analytics', color: '#F97316' },
                  { icon: Globe, title: 'Web Scraper', steps: 6, category: 'Integration', color: '#06B6D4' },
                  { icon: Layers, title: 'Image Generator', steps: 3, category: 'Media', color: '#F59E0B' },
                  { icon: GitBranch, title: 'CI/CD Monitor', steps: 8, category: 'DevOps', color: '#10B981' },
                ].map((card, i) => (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.07 }}
                    className="glass-card rounded-xl p-4 hover:shadow-lg transition-all duration-200 group cursor-default"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                      style={{ backgroundColor: `${card.color}18`, border: `1.5px solid ${card.color}40` }}
                    >
                      <card.icon className="w-4 h-4" style={{ color: card.color }} />
                    </div>
                    <p className="text-sm font-semibold leading-tight mb-1">{card.title}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">{card.steps} steps</span>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: `${card.color}15`, color: card.color }}
                      >
                        {card.category}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Floating stats badge */}
              <div className="absolute -bottom-4 -right-4 bg-white dark:bg-card border rounded-2xl shadow-xl px-5 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-teal-400 flex items-center justify-center">
                  <LayoutGrid className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-lg font-bold leading-none">60+</div>
                  <div className="text-xs text-muted-foreground">Templates</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <GitBranch className="w-4 h-4" />
              Simple Process
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              {processSection?.title || (<>How It <span className="gradient-text">Works</span></>)}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Get from idea to deployed application in three simple steps.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connection Line */}
            <div className="hidden md:block absolute top-24 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-violet-500 via-coral-400 to-teal-400" />
            
            {displayHowItWorks.map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
                className="relative"
              >
                <div className="glass-card rounded-2xl p-8 text-center h-full">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-teal-400 flex items-center justify-center mx-auto mb-6 text-white font-bold text-xl shadow-lg">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                  <p className="text-muted-foreground">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-500/5 to-transparent" />
        
        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Users className="w-4 h-4" />
              Testimonials
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Loved by <span className="gradient-text">Developers</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {displayTestimonials.map((testimonial, index) => (
              <motion.div
                key={testimonial.author}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="glass-card h-full">
                  <CardContent className="p-6">
                    <div className="flex gap-1 mb-4">
                      {[1,2,3,4,5].map((i) => (
                        <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <p className="text-foreground mb-6 italic">"{testimonial.quote}"</p>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-teal-400 flex items-center justify-center text-white font-semibold">
                        {testimonial.avatar}
                      </div>
                      <div>
                        <div className="font-semibold">{testimonial.author}</div>
                        <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative rounded-3xl overflow-hidden"
          >
            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-purple-600 to-teal-500" />
            <div className="absolute inset-0 bg-[url('/images/hero-gradient.png')] opacity-30 mix-blend-overlay" />
            
            <div className="relative px-8 py-16 sm:px-16 sm:py-24 text-center text-white">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
              >
                <Rocket className="w-16 h-16 mx-auto mb-6 opacity-80" />
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
                  {ctaSection?.title || parsedContent?.ctaTitle || 'Ready to Build Something Amazing?'}
                </h2>
                <p className="text-lg sm:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
                  {ctaSection?.subtitle || ctaSection?.content || parsedContent?.ctaDesc || 'Join thousands of developers who are already building faster with SmartSpec Pro. Start your free trial today.'}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    size="lg" 
                    className="bg-white text-violet-600 hover:bg-white/90 text-lg px-8 shadow-xl"
                  >
                    Get Started Free
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                  <Link href="/pricing">
                    <Button 
                      size="lg" 
                      variant="outline" 
                      className="text-lg px-8 border-white/30 text-white hover:bg-white/10"
                    >
                      View Pricing
                    </Button>
                  </Link>
                </div>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm opacity-80">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>No credit card required</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>10 free credits</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Cancel anytime</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
