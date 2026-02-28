/**
 * Home Page - AI Data Analytics Pitch Deck
 * Design: Liquid Glass, Video Hero, Smooth Transitions
 */

import React from 'react';
import { PitchDeck, Slide, VideoBackground } from '@/components/PitchDeck';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import {
  BarChart,
  BrainCircuit,
  TrendingUp,
  DatabaseZap,
  ArrowRight,
  Sparkles,
  Zap,
  ShieldCheck,
  Globe2
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { motion } from 'framer-motion';

export default function Home() {
  return (
    <>
      <Navbar />

      <PitchDeck>
        {/* Slide 1: Hero Video */}
        <Slide isActive={false} direction={0}>
          <VideoBackground url="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" opacity={0.65} />
          <div className="relative z-10 flex flex-col items-center justify-center text-center h-full">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 border border-white/20 backdrop-blur-md text-white mb-8 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                <Sparkles className="w-5 h-5 text-teal-400" />
                <span className="text-sm font-medium tracking-wide">The Future of Data Analytics</span>
              </div>
            </motion.div>

            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-white mb-8 leading-tight tracking-tighter drop-shadow-2xl">
              Understand <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-coral-400 to-teal-400">Everything.</span>
            </h1>

            <p className="text-xl md:text-2xl text-white/80 max-w-3xl mb-12 font-light leading-relaxed drop-shadow-lg">
              SmartAIHub digests petabytes of unstructured data into actionable insights in milliseconds using our proprietary neural architecture.
            </p>

            <div className="flex gap-6">
              <Link href="/signup">
                <Button size="lg" className="h-14 px-8 text-lg bg-white text-black hover:bg-white/90 rounded-full shadow-[0_0_40px_rgba(255,255,255,0.3)] transition-all hover:scale-105">
                  Start Analyzing <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg text-white border-white/30 backdrop-blur-md rounded-full hover:bg-white/10 transition-all">
                View Documentation
              </Button>
            </div>
          </div>
        </Slide>

        {/* Slide 2: The Problem/Solution (Liquid Glass Cards) */}
        <Slide isActive={false} direction={0}>
          <div className="relative z-10 h-full flex flex-col justify-center">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
                Data is <span className="text-transparent bg-clip-text bg-gradient-to-r from-destructive to-orange-400">Messy.</span> Let AI handle it.
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Stop writing complex SQL queries and building fragile data pipelines. Just ask questions in plain English.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: DatabaseZap,
                  title: "Instant Integration",
                  desc: "Connect to Postgres, MongoDB, Snowflake, or any API in seconds.",
                  color: "text-violet-500",
                  bg: "bg-violet-500/10"
                },
                {
                  icon: BrainCircuit,
                  title: "Neural Engine",
                  desc: "Our LLM understands context, business logic, and complex table relationships naturally.",
                  color: "text-teal-500",
                  bg: "bg-teal-500/10"
                },
                {
                  icon: BarChart,
                  title: "Instant Visuals",
                  desc: "Generate interactive dashboards and beautiful charts instantly without any code.",
                  color: "text-coral-400",
                  bg: "bg-coral-400/10"
                }
              ].map((feature, i) => (
                <div key={i} className="glass-card p-8 rounded-3xl hover:-translate-y-2 transition-transform duration-300 border border-white/40 dark:border-white/10 shadow-xl bg-white/40 dark:bg-black/40 backdrop-blur-xl">
                  <div className={`w-16 h-16 rounded-2xl ${feature.bg} flex items-center justify-center mb-6`}>
                    <feature.icon className={`w-8 h-8 ${feature.color}`} />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{feature.title}</h3>
                  <p className="text-muted-foreground text-lg leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Slide>

        {/* Slide 3: Growth Metrics */}
        <Slide isActive={false} direction={0}>
          <div className="relative z-10 h-full flex flex-col md:flex-row items-center justify-between gap-16">
            <div className="flex-1">
              <h2 className="text-5xl md:text-7xl font-bold mb-8 leading-tight">
                Scale without <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">Limits.</span>
              </h2>
              <p className="text-2xl text-muted-foreground mb-12">
                Built on a globally distributed edge network, SmartAIHub processes billions of events with sub-50ms latency.
              </p>

              <div className="space-y-6">
                {[
                  { icon: Zap, text: "Sub-50ms Global Latency" },
                  { icon: ShieldCheck, text: "SOC2 Type II & HIPAA Certified" },
                  { icon: Globe2, text: "Deploy to 35+ Edge Regions" }
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-teal-500/20 flex items-center justify-center">
                      <item.icon className="w-6 h-6 text-teal-500" />
                    </div>
                    <span className="text-xl font-medium">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 w-full relative">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 to-emerald-500/20 blur-3xl rounded-full" />
              <div className="relative glass-card p-8 rounded-3xl border border-white/20 shadow-2xl backdrop-blur-2xl">
                <h3 className="text-2xl font-bold mb-8 text-center">Processing Power (TFLOPS)</h3>
                <div className="flex items-end justify-between h-64 gap-2">
                  {[20, 35, 45, 60, 85, 100].map((height, i) => (
                    <div key={i} className="w-full relative group">
                      <div
                        className="absolute bottom-0 w-full bg-gradient-to-t from-teal-500 to-emerald-400 rounded-t-lg transition-all duration-1000 group-hover:opacity-80"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Slide>

        {/* Slide 4: Final CTA */}
        <Slide isActive={false} direction={0}>
          <div className="relative z-10 h-full flex flex-col items-center justify-center text-center">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-violet-500/30 blur-[100px] rounded-full pointer-events-none" />

            <TrendingUp className="w-24 h-24 text-violet-500 mb-8" />

            <h2 className="text-5xl md:text-8xl font-black mb-8">
              Ready to <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-teal-400">Transform?</span>
            </h2>

            <p className="text-2xl text-muted-foreground mb-12 max-w-2xl">
              Join 10,000+ data-driven companies building the future with SmartAIHub.
            </p>

            <div className="flex flex-col sm:flex-row gap-6 justify-center">
              <Link href="/signup">
                <Button size="lg" className="h-16 px-12 text-xl bg-gradient-to-r from-violet-500 to-teal-400 text-white hover:scale-105 transition-transform shadow-[0_0_40px_rgba(139,92,246,0.3)] rounded-full border-0">
                  Get Started Full Access
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline" className="h-16 px-12 text-xl rounded-full backdrop-blur-md hover:bg-white/10 transition-colors">
                  Talk to Sales
                </Button>
              </Link>
            </div>
          </div>
        </Slide>
      </PitchDeck>
    </>
  );
}

