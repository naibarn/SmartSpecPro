/**
 * Home Page - SmartAIHub landing pitch deck
 * Database-driven copy for smartaihub.app
 */

import React from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Seo } from "@/components/Seo";
import { PitchDeck, Slide, VideoBackground } from "@/components/PitchDeck";
import { useTenantPage } from "@/hooks/useTenantPage";

type HomeButton = {
  text: string;
  link: string;
  style?: string;
};

type HomeSectionItem = {
  [key: string]: unknown;
  title?: string;
  subtitle?: string;
  description?: string;
  content?: string;
  value?: string;
  label?: string;
  text?: string;
  points?: string[];
};

type HomeSection = {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  content?: string;
  buttons?: HomeButton[];
  items?: Array<HomeSectionItem | string>;
  settings?: Record<string, unknown>;
};

const featureIcons = [Store, Workflow, Zap];
const outputIcons = [MessageSquareText, Presentation, Video];

const featureCardAccents = [
  "from-blue-400/20 to-cyan-400/20",
  "from-cyan-400/20 to-teal-400/20",
  "from-emerald-400/20 to-lime-400/20",
];

const featureCardIcons = ["text-blue-400", "text-cyan-400", "text-emerald-400"];

const outputCardAccents = [
  "from-cyan-400/20 to-blue-400/20",
  "from-cyan-400/20 to-teal-400/20",
  "from-emerald-400/20 to-teal-400/20",
];

const outputCardIcons = ["text-cyan-300", "text-cyan-300", "text-emerald-300"];

function toText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return "";
}

function normalizeItems(
  items?: Array<HomeSectionItem | string> | null
): HomeSectionItem[] {
  if (!Array.isArray(items)) return [];
  return items.map(item =>
    typeof item === "string" ? { title: item } : (item ?? {})
  );
}

function getTextFromItem(
  item: HomeSectionItem | undefined,
  fields: Array<keyof HomeSectionItem>
): string {
  if (!item) return "";
  for (const field of fields) {
    const value = toText(item[field]);
    if (value) return value;
  }
  return "";
}

function getPointsFromItem(item: HomeSectionItem | undefined): string[] {
  const points = item?.points;
  if (!Array.isArray(points)) return [];
  return points.map(toText).filter(Boolean);
}

function findSection(
  sections: HomeSection[],
  type: string,
  predicate?: (section: HomeSection) => boolean
): HomeSection | undefined {
  return sections.find(
    section => section.type === type && (!predicate || predicate(section))
  );
}

function isExternalLink(link: string): boolean {
  return /^https?:\/\//i.test(link);
}

function HomeActionButton({
  button,
  className,
  showArrow = false,
}: {
  button: HomeButton;
  className: string;
  showArrow?: boolean;
}) {
  const isOutline = button.style === "outline";
  const buttonContent = (
    <>
      {button.text}
      {showArrow && !isOutline ? <ArrowRight className="ml-2 h-5 w-5" /> : null}
    </>
  );

  return isExternalLink(button.link) ? (
    <Button
      asChild
      size="lg"
      variant={isOutline ? "outline" : "default"}
      className={className}
    >
      <a href={button.link} target="_blank" rel="noreferrer">
        {buttonContent}
      </a>
    </Button>
  ) : (
    <Button
      asChild
      size="lg"
      variant={isOutline ? "outline" : "default"}
      className={className}
    >
      <Link href={button.link}>{buttonContent}</Link>
    </Button>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="SmartAIHub"
        description="Loading SmartAIHub homepage content..."
        canonicalPath="/"
        fetchTenantSeo={false}
      />
      <Navbar />

      <main className="px-4 pt-24 sm:pt-32">
        <div className="container mx-auto max-w-5xl animate-pulse">
          <div className="mx-auto mb-6 h-6 w-48 rounded-full bg-muted/60" />
          <div className="mx-auto h-20 rounded-3xl bg-muted/60" />
          <div className="mx-auto mt-6 h-10 rounded-2xl bg-muted/50" />
          <div className="mx-auto mt-8 grid gap-4 sm:grid-cols-2">
            <div className="h-14 rounded-full bg-muted/50" />
            <div className="h-14 rounded-full bg-muted/50" />
          </div>
        </div>
      </main>
    </div>
  );
}

function UnavailableState() {
  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="SmartAIHub"
        description="SmartAIHub homepage content is unavailable."
        canonicalPath="/"
        fetchTenantSeo={false}
      />
      <Navbar />

      <main className="px-4 pt-24 sm:pt-32">
        <div className="container mx-auto max-w-3xl">
          <div className="glass-card rounded-3xl border border-border/60 p-8 text-center">
            <Sparkles className="mx-auto mb-4 h-10 w-10 text-cyan-400" />
            <h1 className="text-3xl font-bold text-foreground">
              Homepage content is not published yet.
            </h1>
            <p className="mt-4 text-muted-foreground">
              The public tenant page is waiting for DB content to be published.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const { page: tenantPage, isLoading } = useTenantPage("home");

  if (isLoading) {
    return <LoadingState />;
  }

  if (!tenantPage) {
    return <UnavailableState />;
  }

  const sections = (tenantPage.sections ?? []) as HomeSection[];
  const heroSection = findSection(sections, "hero");
  const statsSection = findSection(sections, "stats");
  const featuresSection = findSection(sections, "features");
  const outputsSection = findSection(
    sections,
    "content",
    section => toText(section.settings?.sectionType) === "outputs"
  );
  const ctaSection = findSection(sections, "cta");

  const heroSettings = (heroSection?.settings ?? {}) as Record<string, unknown>;
  const featureSettings = (featuresSection?.settings ?? {}) as Record<
    string,
    unknown
  >;
  const outputSettings = (outputsSection?.settings ?? {}) as Record<
    string,
    unknown
  >;

  const heroTitle = heroSection?.title || "SmartAIHub";
  const heroSubtitle =
    heroSection?.subtitle || tenantPage.metadata?.description || "";
  const heroBadge = toText(heroSettings.badge);
  const heroTrustLine = toText(heroSettings.trustLine);
  const heroBackgroundVideo = toText(heroSettings.backgroundVideo);
  const heroBackgroundOpacity =
    typeof heroSettings.backgroundOpacity === "number"
      ? heroSettings.backgroundOpacity
      : 0.18;
  const heroButtons = heroSection?.buttons?.length
    ? heroSection.buttons
    : (ctaSection?.buttons ?? []);
  const featureCards = normalizeItems(featuresSection?.items);
  const outputCards = normalizeItems(outputsSection?.items);
  const trustItems = normalizeItems(statsSection?.items)
    .map(item => getTextFromItem(item, ["value", "label", "text"]))
    .filter(Boolean);

  const featureBadge = toText(featureSettings.badge);
  const outputBadge = toText(outputSettings.badge);
  const seoTitle = toText(heroSettings.seoTitle) || heroTitle;
  const seoDescription = toText(heroSettings.seoDescription) || heroSubtitle;
  const seoKeywords = tenantPage.metadata?.keywords || [];
  const ctaButtons = ctaSection?.buttons?.length
    ? ctaSection.buttons
    : heroButtons;

  return (
    <>
      <Seo
        title={seoTitle}
        description={seoDescription}
        keywords={seoKeywords}
        canonicalPath="/"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "SmartAIHub",
            url: "/",
            description: seoDescription,
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
        <Slide isActive={false} direction={0}>
          <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
            {heroBackgroundVideo ? (
              <VideoBackground
                url={heroBackgroundVideo}
                opacity={heroBackgroundOpacity}
              />
            ) : (
              <>
                <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-background to-blue-50/40" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(255,255,255,0.72)_100%)]" />
              </>
            )}

            <div className="relative z-10 flex max-w-5xl flex-col items-center">
              {heroBadge ? (
                <motion.div
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.12, duration: 0.4 }}
                  className="mb-5 inline-flex max-w-full items-center justify-center gap-2 rounded-full border border-border/60 bg-white/75 px-4 py-2.5 text-xs font-medium leading-snug text-foreground shadow-[0_0_30px_rgba(59,130,246,0.12)] backdrop-blur-md sm:mb-8 sm:px-6 sm:py-3 sm:text-sm"
                >
                  <Sparkles className="h-4 w-4 shrink-0 text-teal-400 sm:h-5 sm:w-5" />
                  <span>{heroBadge}</span>
                </motion.div>
              ) : null}

              <motion.h1
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.18, duration: 0.5 }}
                className="mb-5 max-w-6xl text-4xl font-black leading-[1.02] text-foreground drop-shadow-2xl sm:text-5xl md:text-6xl lg:mb-8 lg:text-8xl"
              >
                {heroTitle}
              </motion.h1>

              <motion.p
                initial={{ y: 18, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.28, duration: 0.5 }}
                className="mb-8 max-w-4xl text-base leading-7 text-muted-foreground drop-shadow-lg sm:text-lg md:text-xl lg:mb-12 lg:text-2xl"
              >
                {heroSubtitle}
              </motion.p>

              <motion.div
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.36, duration: 0.5 }}
                className="flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4"
              >
                {heroButtons.slice(0, 2).map(button => (
                  <HomeActionButton
                    key={`${button.text}-${button.link}`}
                    button={button}
                    className={
                      button.style === "outline"
                        ? "h-auto min-h-12 w-full whitespace-normal rounded-full border-border/70 bg-white/60 px-5 py-3 text-center text-base leading-snug text-foreground backdrop-blur-md transition-colors hover:bg-white/80 sm:h-14 sm:w-auto sm:px-8 sm:text-lg"
                        : "h-auto min-h-12 w-full whitespace-normal rounded-full border-0 bg-primary px-5 py-3 text-center text-base leading-snug text-primary-foreground shadow-[0_0_40px_rgba(59,130,246,0.22)] transition-all hover:bg-primary/90 sm:h-14 sm:w-auto sm:px-8 sm:text-lg sm:hover:scale-105"
                    }
                    showArrow
                  />
                ))}
              </motion.div>

              {heroTrustLine ? (
                <motion.p
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.46, duration: 0.45 }}
                  className="mt-8 text-xs font-medium uppercase leading-5 tracking-[0.2em] text-muted-foreground/90 sm:mt-10 sm:text-sm sm:tracking-[0.28em]"
                >
                  {heroTrustLine}
                </motion.p>
              ) : null}

              {trustItems.length > 0 ? (
                <motion.div
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.54, duration: 0.45 }}
                  className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-foreground/80 sm:gap-3 sm:text-sm"
                >
                  {trustItems.slice(0, 5).map(item => (
                    <span
                      key={item}
                      className="rounded-full border border-border/60 bg-white/70 px-3 py-1.5 backdrop-blur-md sm:px-4 sm:py-2"
                    >
                      {item}
                    </span>
                  ))}
                </motion.div>
              ) : null}
            </div>
          </div>
        </Slide>

        <Slide isActive={false} direction={0}>
          <div className="relative z-10 flex h-full flex-col justify-center">
            <div className="absolute top-20 left-1/4 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute top-40 right-1/4 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="relative z-10 mb-8 text-center sm:mb-12 lg:mb-16">
              {featureBadge ? (
                <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                  <Store className="h-4 w-4" />
                  {featureBadge}
                </span>
              ) : null}
              <h2 className="mb-4 text-3xl font-bold leading-tight text-foreground sm:text-4xl md:text-5xl lg:mb-6 lg:text-6xl">
                {featuresSection?.title ||
                  "Reusable AI workflows from a shared marketplace"}
              </h2>
              <p className="mx-auto max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg lg:text-xl">
                {featuresSection?.subtitle ||
                  "Publish once, reuse everywhere, and keep every team moving from the same source of truth."}
              </p>
            </div>

            <div className="relative z-10 grid gap-4 sm:gap-6 md:grid-cols-3 lg:gap-8">
              {featureCards.slice(0, 3).map((item, index) => {
                const Icon = featureIcons[index % featureIcons.length];
                const points = getPointsFromItem(item);

                return (
                  <motion.div
                    key={
                      getTextFromItem(item, [
                        "title",
                        "text",
                        "label",
                        "value",
                      ]) || `feature-${index}`
                    }
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.08 }}
                  >
                    <div
                      className={`glass-card rounded-2xl border border-border/60 bg-gradient-to-b ${featureCardAccents[index % featureCardAccents.length]} bg-white/80 p-5 shadow-xl backdrop-blur-xl transition-transform duration-300 sm:p-6 md:hover:-translate-y-2 lg:rounded-3xl lg:p-8`}
                    >
                      <div className="mb-5 flex items-center justify-between gap-3 sm:mb-6">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-white/80 sm:h-14 sm:w-14 lg:h-16 lg:w-16 lg:rounded-2xl">
                          <Icon
                            className={`h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 ${featureCardIcons[index % featureCardIcons.length]}`}
                          />
                        </div>
                        <span className="text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground sm:text-xs sm:tracking-[0.3em]">
                          Layer 0{index + 1}
                        </span>
                      </div>

                      <h3 className="mb-3 text-xl font-bold leading-tight text-foreground sm:mb-4 sm:text-2xl">
                        {getTextFromItem(item, [
                          "title",
                          "text",
                          "label",
                          "value",
                        ])}
                      </h3>
                      <p className="text-base leading-7 text-muted-foreground sm:text-lg sm:leading-relaxed">
                        {getTextFromItem(item, [
                          "description",
                          "content",
                          "subtitle",
                        ])}
                      </p>

                      {points.length > 0 ? (
                        <div className="mt-5 flex flex-wrap gap-2 sm:mt-6">
                          {points.map(point => (
                            <span
                              key={point}
                              className="rounded-full border border-border/60 bg-white/80 px-3 py-1 text-xs font-medium text-foreground/80"
                            >
                              {point}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </Slide>

        <Slide isActive={false} direction={0}>
          <div className="relative z-10 flex h-full flex-col justify-center gap-8 lg:gap-12">
            <div className="absolute inset-x-0 top-12 mx-auto h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="relative z-10 mx-auto max-w-3xl text-center">
              {outputBadge ? (
                <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                  <Zap className="h-4 w-4" />
                  {outputBadge}
                </span>
              ) : null}
              <h2 className="mb-4 text-3xl font-bold leading-tight text-foreground sm:text-4xl md:text-5xl lg:mb-8 lg:text-7xl">
                {outputsSection?.title || "One workflow, three outputs"}
              </h2>
              <p className="text-base leading-7 text-muted-foreground sm:text-xl lg:text-2xl">
                {outputsSection?.subtitle ||
                  "The same source material can become grounded answers, slide-ready decks, or video briefs."}
              </p>
            </div>

            <div className="relative z-10 grid gap-4 sm:gap-6 md:grid-cols-3 lg:gap-8">
              {outputCards.slice(0, 3).map((item, index) => {
                const Icon = outputIcons[index % outputIcons.length];

                return (
                  <motion.div
                    key={
                      getTextFromItem(item, [
                        "title",
                        "text",
                        "label",
                        "value",
                      ]) || `output-${index}`
                    }
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.08 }}
                  >
                    <div
                      className={`glass-card rounded-2xl border border-border/60 bg-gradient-to-b ${outputCardAccents[index % outputCardAccents.length]} bg-white/75 p-5 shadow-xl backdrop-blur-xl sm:p-6 lg:rounded-3xl lg:p-8`}
                    >
                      <div className="mb-5 flex items-center gap-3 sm:gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-white/80 sm:h-14 sm:w-14 sm:rounded-2xl">
                          <Icon
                            className={`h-6 w-6 sm:h-7 sm:w-7 ${outputCardIcons[index % outputCardIcons.length]}`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground sm:text-sm sm:tracking-[0.25em]">
                            Output Surface
                          </div>
                          <h3 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">
                            {getTextFromItem(item, [
                              "title",
                              "text",
                              "label",
                              "value",
                            ])}
                          </h3>
                        </div>
                      </div>

                      <p className="text-base leading-7 text-muted-foreground sm:text-lg sm:leading-relaxed">
                        {getTextFromItem(item, [
                          "description",
                          "content",
                          "subtitle",
                        ])}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {featureCards.length > 0 ? (
              <div className="relative z-10 rounded-2xl border border-border/60 bg-white/80 px-4 py-4 backdrop-blur-xl sm:px-6 sm:py-5 lg:rounded-3xl">
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-foreground/80 sm:gap-3 sm:text-sm">
                  {featureCards.slice(0, 3).map((item, index) => {
                    const title = getTextFromItem(item, [
                      "title",
                      "text",
                      "label",
                      "value",
                    ]);
                    return (
                      <span
                        key={`${title}-${index}`}
                        className="rounded-full border border-border/60 bg-white/80 px-3 py-1.5 sm:px-4 sm:py-2"
                      >
                        {title}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </Slide>

        <Slide isActive={false} direction={0}>
          <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
            <div className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/15 blur-[100px] pointer-events-none" />

            <Boxes className="mb-6 h-16 w-16 text-cyan-400 sm:mb-8 sm:h-20 sm:w-20 lg:h-24 lg:w-24" />

            <h2 className="mb-5 text-4xl font-black leading-tight text-foreground sm:text-5xl md:text-6xl lg:mb-8 lg:text-8xl">
              {ctaSection?.title || "See SmartAIHub in action"}
            </h2>

            <p className="mb-8 max-w-4xl text-base leading-7 text-muted-foreground sm:text-xl lg:mb-10 lg:text-2xl">
              {ctaSection?.subtitle ||
                "Start with a sample workflow or watch the 2-minute demo to see the full loop."}
            </p>

            {trustItems.length > 0 ? (
              <div className="mb-8 flex flex-wrap justify-center gap-2 sm:mb-12 sm:gap-3">
                {trustItems.slice(0, 5).map(item => (
                  <span
                    key={item}
                    className="rounded-full border border-border/60 bg-white/80 px-3 py-1.5 text-xs text-foreground/80 backdrop-blur-md sm:px-4 sm:py-2 sm:text-sm"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}

            {featureCards.length > 0 ? (
              <div className="mb-8 flex flex-wrap justify-center gap-2 sm:mb-12 sm:gap-3">
                {featureCards.slice(0, 3).map((item, index) => {
                  const title = getTextFromItem(item, [
                    "title",
                    "text",
                    "label",
                    "value",
                  ]);
                  return (
                    <span
                      key={`${title}-${index}`}
                      className="rounded-full border border-border/60 bg-white/80 px-3 py-1.5 text-xs text-foreground/80 backdrop-blur-md sm:px-4 sm:py-2 sm:text-sm"
                    >
                      {title}
                    </span>
                  );
                })}
              </div>
            ) : null}

            <div className="flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center sm:gap-6">
              {ctaButtons.slice(0, 2).map(button => (
                <HomeActionButton
                  key={`${button.text}-${button.link}`}
                  button={button}
                  className={
                    button.style === "outline"
                      ? "h-auto min-h-12 w-full whitespace-normal rounded-full border-border/70 bg-white/60 px-5 py-3 text-center text-base leading-snug text-foreground backdrop-blur-md transition-colors hover:bg-white/80 sm:h-16 sm:w-auto sm:px-12 sm:text-xl"
                      : "h-auto min-h-12 w-full whitespace-normal rounded-full border-0 bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-400 px-5 py-3 text-center text-base leading-snug text-white shadow-[0_0_40px_rgba(37,99,235,0.3)] transition-transform sm:h-16 sm:w-auto sm:px-12 sm:text-xl sm:hover:scale-105"
                  }
                  showArrow
                />
              ))}
            </div>
          </div>
        </Slide>
      </PitchDeck>
    </>
  );
}
