/**
 * Home Page - SmartAIHub Landing Pitch Deck
 * Design: Liquid Glass, Hero Motion, Smooth Transitions
 */

import React from 'react';
import { PitchDeck, Slide, VideoBackground } from '@/components/PitchDeck';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Seo } from '@/components/Seo';
import {
  ArrowRight,
  Bot,
  Boxes,
  MessageSquareText,
  Presentation,
  Sparkles,
  Store,
  Video,
  Workflow,
  Zap,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';

const coreCapabilities = [
  {
    icon: Store,
    title: 'Skill Marketplace',
    desc: 'Discover, publish, and version reusable skills so teams can build from a shared catalog instead of starting over.',
    accent: 'from-blue-400/20 to-cyan-400/20',
    iconClass: 'text-blue-400',
    points: ['Discover', 'Publish', 'Reuse'],
  },
  {
    icon: Workflow,
    title: 'Virtual Workflow Builder',
    desc: 'Compose triggers, approvals, routing, and context into a virtual workflow that turns a prompt into a repeatable process.',
    accent: 'from-cyan-400/20 to-teal-400/20',
    iconClass: 'text-cyan-400',
    points: ['Trigger', 'Route', 'Approve'],
  },
  {
    icon: Bot,
    title: 'Swarm Execution',
    desc: 'Run multiple specialist skills in parallel, coordinate their work, and merge the best output into a final deliverable.',
    accent: 'from-emerald-400/20 to-lime-400/20',
    iconClass: 'text-emerald-400',
    points: ['Parallelize', 'Coordinate', 'Merge'],
  },
];

const outputSurfaces = [
  {
    icon: MessageSquareText,
    title: 'Chat',
    desc: 'Ask a skill-aware assistant that can pull the right workflow and keep the conversation grounded in live context.',
    badge: 'Interactive output',
    accent: 'from-cyan-400/20 to-blue-400/20',
    iconClass: 'text-cyan-300',
  },
  {
    icon: Presentation,
    title: 'Presentation',
    desc: 'Convert swarm output into a structured deck with narrative flow, slide logic, and reusable presentation blocks.',
    badge: 'Slide-ready output',
    accent: 'from-cyan-400/20 to-teal-400/20',
    iconClass: 'text-cyan-300',
  },
  {
    icon: Video,
    title: 'Video',
    desc: 'Turn the same workflow into scripts, scene plans, and production cues for video generation and editing.',
    badge: 'Media-ready output',
    accent: 'from-emerald-400/20 to-teal-400/20',
    iconClass: 'text-emerald-300',
  },
];

export default function Home() {
  return (
    <>
      <Seo
        title="SmartAIHub | Enterprise Skill Marketplace & Workflow Swarms"
        description="Discover reusable skills, build virtual workflows, and run swarm execution that delivers chat, presentation, and video outputs."
        keywords={["SmartAIHub", "skill marketplace", "virtual workflows", "swarm execution", "chat output", "presentation output", "video output", "enterprise AI"]}
        canonicalPath="/"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "SmartAIHub",
            url: "/",
            description: "Enterprise skill marketplace and workflow orchestration platform.",
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "SmartAIHub",
            url: "/",
            potentialAction: {
              "@type": "SearchAction",
              target: "/marketplace?search={search_term_string}",
              "query-input": "required name=search_term_string",
            },
          },
        ]}
      />
      <Navbar />

      <PitchDeck>
        {/* Slide 1: Hero */}
        <Slide isActive={false} direction={0}>
          <VideoBackground url="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" opacity={0.18} />
          <div className="relative z-10 flex flex-col items-center justify-center text-center h-full">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/75 border border-border/60 backdrop-blur-md text-foreground mb-8 shadow-[0_0_30px_rgba(59,130,246,0.12)]">
                <Sparkles className="w-5 h-5 text-teal-400" />
                <span className="text-sm font-medium tracking-wide">Skill Marketplace + Virtual Workflow Swarms</span>
              </div>
            </motion.div>

            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-foreground mb-8 leading-tight tracking-tighter drop-shadow-2xl">
              Ship <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400">Skills into Outcomes.</span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mb-12 font-light leading-relaxed drop-shadow-lg">
              SmartAIHub connects a skill marketplace, virtual workflows, and swarm execution so teams can produce chat answers, presentations, and videos from one platform.
            </p>

            <div className="flex gap-6">
              <Link href="/marketplace">
                <Button size="lg" className="h-14 px-8 text-lg bg-primary text-primary-foreground hover:bg-primary/90 rounded-full shadow-[0_0_40px_rgba(59,130,246,0.22)] transition-all hover:scale-105">
                  Explore Marketplace <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="lg" variant="outline" className="h-14 px-8 text-lg text-foreground border-border/70 backdrop-blur-md rounded-full hover:bg-white/80 transition-all bg-white/60">
                  Start Free
                </Button>
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
              {['Browse skills', 'Compose workflows', 'Run swarms', 'Export outputs'].map((item) => (
                <span key={item} className="rounded-full border border-border/60 bg-white/70 px-4 py-2 backdrop-blur-md">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </Slide>

        {/* Slide 2: Platform layers */}
        <Slide isActive={false} direction={0}>
          <div className="relative z-10 h-full flex flex-col justify-center">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
                Three layers that turn a prompt into a <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-teal-400">repeatable system.</span>
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                SmartAIHub lets you find a skill, compose it into a workflow, and run it as a coordinated swarm without rebuilding the process every time.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {coreCapabilities.map((feature, i) => (
                <div key={i} className={`glass-card p-8 rounded-3xl hover:-translate-y-2 transition-transform duration-300 border border-border/60 shadow-xl bg-gradient-to-b ${feature.accent} bg-white/80 backdrop-blur-xl`}>
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-white/80 flex items-center justify-center border border-border/60">
                      <feature.icon className={`w-8 h-8 ${feature.iconClass}`} />
                    </div>
                    <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Layer 0{i + 1}</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{feature.title}</h3>
                  <p className="text-muted-foreground text-lg leading-relaxed">{feature.desc}</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {feature.points.map((point) => (
                      <span key={point} className="rounded-full border border-border/60 bg-white/80 px-3 py-1 text-xs font-medium text-foreground/80">
                        {point}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Slide>

        {/* Slide 3: Output surfaces */}
        <Slide isActive={false} direction={0}>
          <div className="relative z-10 h-full flex flex-col justify-center gap-12">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="text-5xl md:text-7xl font-bold mb-8 leading-tight">
                Same workflow, <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">multiple outputs.</span>
              </h2>
              <p className="text-2xl text-muted-foreground">
                A single swarm can answer in chat, draft a presentation, or generate a video plan, depending on the surface your team needs.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {outputSurfaces.map((item, i) => (
                <div key={i} className={`glass-card p-8 rounded-3xl border border-border/60 shadow-xl bg-gradient-to-b ${item.accent} bg-white/75 backdrop-blur-xl`}>
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-14 h-14 rounded-2xl bg-white/80 border border-border/60 flex items-center justify-center">
                      <item.icon className={`w-7 h-7 ${item.iconClass}`} />
                    </div>
                    <div>
                      <div className="text-sm uppercase tracking-[0.25em] text-muted-foreground">{item.badge}</div>
                      <h3 className="text-2xl font-bold">{item.title}</h3>
                    </div>
                  </div>
                  <p className="text-lg text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-border/60 bg-white/80 px-6 py-5 backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-foreground/80">
                <span className="rounded-full border border-border/60 bg-white/80 px-4 py-2">Input: skill + context</span>
                <Zap className="w-4 h-4 text-teal-400" />
                <span className="rounded-full border border-border/60 bg-white/80 px-4 py-2">Orchestration: workflow + swarm</span>
                <Zap className="w-4 h-4 text-teal-400" />
                <span className="rounded-full border border-border/60 bg-white/80 px-4 py-2">Output: chat, presentation, video</span>
              </div>
            </div>
          </div>
        </Slide>

        {/* Slide 4: Final CTA */}
        <Slide isActive={false} direction={0}>
          <div className="relative z-10 h-full flex flex-col items-center justify-center text-center">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/15 blur-[100px] rounded-full pointer-events-none" />

            <Boxes className="w-24 h-24 text-cyan-400 mb-8" />

            <h2 className="text-5xl md:text-8xl font-black mb-8">
              Build once. <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-teal-400">Reuse everywhere.</span>
            </h2>

            <p className="text-2xl text-muted-foreground mb-10 max-w-3xl">
              SmartAIHub helps teams package capabilities as skills, connect them into virtual workflows, and launch swarms that deliver the exact output format they need.
            </p>

            <div className="flex flex-wrap justify-center gap-3 mb-12">
              {['Publish a skill', 'Compose a workflow', 'Launch a swarm', 'Ship a deliverable'].map((item) => (
                <span key={item} className="rounded-full border border-border/60 bg-white/80 px-4 py-2 text-sm text-foreground/80 backdrop-blur-md">
                  {item}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Link href="/marketplace">
                <Button size="lg" className="h-16 px-12 text-xl bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-400 text-white hover:scale-105 transition-transform shadow-[0_0_40px_rgba(37,99,235,0.3)] rounded-full border-0">
                  Browse Marketplace
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="lg" variant="outline" className="h-16 px-12 text-xl rounded-full backdrop-blur-md hover:bg-white/80 transition-colors bg-white/60">
                  Start Free
                </Button>
              </Link>
            </div>
          </div>
        </Slide>
      </PitchDeck>
    </>
  );
}
