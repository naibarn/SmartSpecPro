/**
 * Generic Content Page
 * Renders tenant-aware content pages (about, changelog, careers, etc.)
 * Uses useTenantPage for tenant-specific content with luxurious default fallbacks.
 */

import { motion } from 'framer-motion';
import DOMPurify from 'dompurify';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { useTenantPage } from '@/hooks/useTenantPage';
import type { LucideIcon } from 'lucide-react';

interface ContentPageProps {
  pageKey: string;
  defaultTitle: string;
  defaultBody: string;
  icon?: LucideIcon;
  badge?: string;
  gradientFrom?: string;
  gradientTo?: string;
}

function parseTitle(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  return m?.[1]?.replace(/<[^>]*>/g, '').trim() || null;
}

export default function ContentPage({
  pageKey,
  defaultTitle,
  defaultBody,
  icon: Icon,
  badge,
  gradientFrom = 'violet-500',
  gradientTo = 'teal-500',
}: ContentPageProps) {
  const { page: tenantPage } = useTenantPage(pageKey);

  const body = tenantPage?.content || defaultBody;
  const title = (tenantPage?.content ? parseTitle(tenantPage.content) : null) || tenantPage?.title || defaultTitle;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 via-transparent to-transparent" />
        <div className={`absolute top-20 left-1/4 w-96 h-96 bg-${gradientFrom}/10 rounded-full blur-3xl`} />
        <div className={`absolute top-40 right-1/4 w-96 h-96 bg-${gradientTo}/10 rounded-full blur-3xl`} />

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto"
          >
            {badge && (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                {Icon && <Icon className="w-4 h-4" />}
                {badge}
              </span>
            )}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6">
              {title}
            </h1>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="pb-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="max-w-4xl mx-auto"
          >
            <div className="glass-card rounded-2xl p-6 sm:p-8 lg:p-10">
              <div
                className="prose prose-lg max-w-none
                  prose-headings:font-bold prose-headings:tracking-tight
                  prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4
                  prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3
                  prose-p:text-muted-foreground prose-p:leading-relaxed
                  prose-li:text-muted-foreground
                  prose-strong:text-foreground
                  prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                  prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
                  prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-xl
                  prose-ul:space-y-1 prose-ol:space-y-1"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body, { ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','a','ul','ol','li','strong','em','b','i','code','pre','blockquote','img','br','hr','span','div','table','thead','tbody','tr','th','td'], ALLOWED_ATTR: ['href','src','alt','class','target','rel','id'] }) }}
              />
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
