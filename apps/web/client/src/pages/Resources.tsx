/**
 * Site Index / Resources page
 * Central hub for internal links, search intent clusters, and public discovery.
 */

import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Seo } from '@/components/Seo';
import { smartaihubPublicIndexSections } from '../../../shared/smartaihubPublicIndex';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function Resources() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
      <Seo
        title="SmartAIHub Site Index | Resources, Docs, Blog & Search Hubs"
        description="Browse SmartAIHub's site index for docs, blog, FAQs, media workflows, and enterprise search hubs."
        keywords={[
          "SmartAIHub site index",
          "resources",
          "docs hub",
          "blog hub",
          "FAQ pages",
          "AI search optimization",
        ]}
        canonicalPath="/resources"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "SmartAIHub Site Index",
          description: "Internal link hub for SmartAIHub public pages and search clusters.",
          url: "/resources",
        }}
      />
      <Navbar />

      <section className="pt-32 pb-14 px-4">
        <div className="container max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/70 backdrop-blur-sm border border-blue-100 text-sm text-blue-600 mb-6">
              <Sparkles className="w-4 h-4" />
              Site Index
            </span>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-5">
              Explore every SmartAIHub{' '}
              <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-400 bg-clip-text text-transparent">
                search cluster
              </span>
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl">
              This hub ties the public site together so search engines and AI systems can understand
              where each page belongs: marketplace, workflow, media, security, blog, and FAQs.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="pb-20 px-4">
        <div className="container max-w-6xl mx-auto space-y-8">
          {smartaihubPublicIndexSections.map((section, sectionIndex) => (
            <motion.section
              key={section.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: sectionIndex * 0.08 }}
              className="rounded-3xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-lg shadow-blue-500/5 overflow-hidden"
            >
              <div className="border-b border-border/50 px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600 mb-2">
                  {section.title}
                </p>
                <h2 className="text-2xl font-bold text-gray-900">{section.description}</h2>
              </div>

              <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-3">
                {section.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group block border-b border-r border-border/50 p-6 no-underline hover:bg-blue-50/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                          {link.label}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-gray-600">
                          {link.description}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 mt-1 text-blue-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            </motion.section>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
