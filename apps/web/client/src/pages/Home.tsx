/**
 * SmartAIHub public homepage.
 *
 * The homepage keeps tenant-page loading for the public content contract, but
 * uses the publicSite locale namespace as the complete, bilingual baseline so
 * stale or incomplete database copy cannot make the landing page empty.
 */

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Blocks,
  Bot,
  Check,
  Clapperboard,
  CreditCard,
  Film,
  History,
  Library,
  Lock,
  MessageSquareText,
  Play,
  Presentation,
  Sparkles,
  Store,
  Video,
  Wallet,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { Seo } from "@/components/Seo";
import { useTenantPage } from "@/hooks/useTenantPage";
import {
  HOME_FEATURE_GROUPS,
  HOME_FEATURES,
  HOME_PUBLIC_ASSETS,
  getHomeFeatureTranslationKey,
  type HomeFeature,
} from "./homeContent";

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  blocks: Blocks,
  chart: BarChart3,
  clapperboard: Clapperboard,
  credit: CreditCard,
  film: Film,
  history: History,
  library: Library,
  lock: Lock,
  message: MessageSquareText,
  presentation: Presentation,
  sparkles: Sparkles,
  store: Store,
  video: Video,
  wallet: Wallet,
};

const proofKeys = ["proof.1", "proof.2", "proof.3", "proof.4", "proof.5"];
const verticalPoints = [1, 2, 3, 4];
const productPoints = [1, 2, 3, 4];
const workhubPoints = [1, 2, 3, 4];
const capturePoints = [1, 2, 3, 4];
const runtimePoints = [1, 2, 3, 4];
const chatPoints = [1, 2, 3, 4];
const skillsChips = [1, 2, 3, 4, 5];
const workflowSteps = [1, 2, 3, 4];

type HomeSection = {
  type?: string;
  settings?: Record<string, unknown>;
};

function getTenantBackgroundVideo(
  sections: Array<HomeSection> | undefined
): string | null {
  const hero = sections?.find(section => section.type === "hero");
  const value = hero?.settings?.backgroundVideo;
  return typeof value === "string" && value.trim() ? value : null;
}

function ImageFrame({
  src,
  alt,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const [hasError, setHasError] = useState(false);

  return (
    <figure
      className={`relative isolate overflow-hidden rounded-[2rem] border border-white/15 bg-slate-950/80 shadow-[0_30px_100px_rgba(15,23,42,0.28)] ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/15 via-transparent to-fuchsia-500/20" />
      {hasError ? (
        <div
          className="flex aspect-[16/9] items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.34),transparent_38%),linear-gradient(135deg,#071326,#111827_55%,#312e81)]"
          role="img"
          aria-label={alt}
        >
          <Sparkles className="h-12 w-12 text-cyan-200/70" aria-hidden="true" />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          width={1672}
          height={941}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={() => setHasError(true)}
          className="relative z-10 aspect-[16/9] w-full object-cover"
        />
      )}
      <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-slate-950/35 via-transparent to-white/5" />
    </figure>
  );
}

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary sm:text-sm">
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      {children}
    </span>
  );
}

function ActionLink({
  href,
  children,
  variant = "default",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "default" | "outline";
  className?: string;
}) {
  return (
    <Link href={href}>
      <Button
        size="lg"
        variant={variant}
        className={`h-auto min-h-12 w-full rounded-full px-6 py-3 text-base sm:w-auto sm:px-8 ${className}`}
      >
        {children}
        {variant === "default" ? (
          <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
        ) : null}
      </Button>
    </Link>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="px-4 pb-24 pt-32 sm:px-6">
        <div className="mx-auto max-w-7xl animate-pulse space-y-10">
          <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-5">
              <div className="h-7 w-52 rounded-full bg-muted/60" />
              <div className="h-24 rounded-3xl bg-muted/60" />
              <div className="h-16 rounded-2xl bg-muted/50" />
            </div>
            <div className="aspect-[16/9] rounded-[2rem] bg-muted/50" />
          </div>
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  feature,
  t,
}: {
  feature: HomeFeature;
  t: (key: string) => string;
}) {
  const Icon = ICONS[feature.icon] ?? Sparkles;

  return (
    <article className="group rounded-3xl border border-border/60 bg-card/80 p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl sm:p-6">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-400/20 text-primary transition-colors group-hover:from-primary group-hover:to-cyan-400 group-hover:text-white">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">
        {t(getHomeFeatureTranslationKey(feature, "title"))}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {t(getHomeFeatureTranslationKey(feature, "description"))}
      </p>
    </article>
  );
}

function SpotlightSection({
  id,
  tone,
  eyebrow,
  title,
  body,
  points,
  cta,
  href,
  image,
  alt,
  workflowLabel,
  dark = false,
  reverse = false,
}: {
  id: string;
  tone: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  cta: string;
  href: string;
  image: string;
  alt: string;
  workflowLabel: string;
  dark?: boolean;
  reverse?: boolean;
}) {
  return (
    <section
      id={id}
      className={`relative overflow-hidden py-20 sm:py-28 ${tone}`}
    >
      <div className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-1/4 h-72 w-72 rounded-full bg-fuchsia-400/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <motion.div
          initial={{ opacity: 0, x: reverse ? 24 : -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.18 }}
          transition={{ duration: 0.55 }}
          className={reverse ? "lg:order-2" : ""}
        >
          <SectionKicker>{eyebrow}</SectionKicker>
          <h2
            className={`mt-6 max-w-2xl text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl ${dark ? "text-white" : "text-foreground"}`}
          >
            {title}
          </h2>
          <p
            className={`mt-6 max-w-2xl text-base leading-8 sm:text-lg ${dark ? "text-slate-300" : "text-muted-foreground"}`}
          >
            {body}
          </p>
          <ul className="mt-7 grid gap-3 sm:grid-cols-2">
            {points.map(point => (
              <li
                key={point}
                className={`flex items-start gap-3 text-sm leading-6 sm:text-base ${dark ? "text-slate-200" : "text-foreground/85"}`}
              >
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <ActionLink href={href}>{cta}</ActionLink>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: reverse ? -24 : 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.18 }}
          transition={{ duration: 0.55, delay: 0.08 }}
          className={reverse ? "lg:order-1" : ""}
        >
          <ImageFrame src={image} alt={alt} className="lg:rounded-[2.5rem]" />
          <div
            className={`mt-4 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] ${dark ? "text-slate-400" : "text-muted-foreground"}`}
          >
            <span className="h-px w-8 bg-primary/50" />
            {workflowLabel}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default function Home() {
  const { t } = useTranslation("publicSite");
  const { page: tenantPage, isLoading } = useTenantPage("home");

  if (isLoading) return <LoadingState />;

  const tenantBackgroundVideo = getTenantBackgroundVideo(
    tenantPage?.sections as Array<HomeSection> | undefined
  );
  const featureGroups = HOME_FEATURE_GROUPS.map(group => ({
    ...group,
    features: HOME_FEATURES.filter(feature => feature.group === group.id),
  }));
  const keywords = t("meta.keywords")
    .split(",")
    .map(keyword => keyword.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Seo
        title={t("meta.title")}
        description={t("meta.description")}
        keywords={keywords}
        canonicalPath="/"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "SmartAIHub",
            url: "/",
            description: t("meta.description"),
          },
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "SmartAIHub",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: t("meta.description"),
          },
        ]}
      />
      <Navbar />

      <main>
        <section className="relative overflow-hidden pb-16 pt-28 sm:pb-24 sm:pt-36">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_85%_18%,rgba(139,92,246,0.14),transparent_32%),linear-gradient(180deg,rgba(248,250,252,0.9),transparent_58%)] dark:bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_85%_18%,rgba(139,92,246,0.16),transparent_32%),linear-gradient(180deg,rgba(2,6,23,0.95),transparent_58%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <SectionKicker>{t("hero.eyebrow")}</SectionKicker>
              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.02] tracking-tight text-foreground sm:text-5xl lg:text-7xl">
                {t("hero.title")}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                {t("hero.subtitle")}
              </p>
              <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <ActionLink href="/signup">{t("hero.primaryCta")}</ActionLink>
                <ActionLink href="/gallery" variant="outline">
                  <Play className="mr-2 h-5 w-5" aria-hidden="true" />
                  {t("hero.secondaryCta")}
                </ActionLink>
              </div>
              <p className="mt-7 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:text-sm">
                {t("hero.trust")}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.75, delay: 0.1 }}
              className="relative"
            >
              <ImageFrame
                src={HOME_PUBLIC_ASSETS.hero}
                alt={t("a11y.heroImage")}
                priority
                className="rounded-[2rem] lg:rounded-[2.75rem]"
              />
              {tenantBackgroundVideo ? (
                <span className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-slate-950/65 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-white/80 backdrop-blur-md">
                  {t("label.livePreview")}
                </span>
              ) : null}
            </motion.div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-card/60 py-5">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
            {proofKeys.map(key => (
              <span
                key={key}
                className="rounded-full border border-border/70 bg-background/70 px-4 py-2 text-xs font-medium text-foreground/80 sm:px-5 sm:text-sm"
              >
                {t(key)}
              </span>
            ))}
          </div>
        </section>

        <SpotlightSection
          id="ai-work-hub"
          tone="bg-gradient-to-b from-background to-indigo-50/60 dark:to-indigo-950/25"
          eyebrow={t("workhub.eyebrow")}
          title={t("workhub.title")}
          body={t("workhub.body")}
          points={workhubPoints.map(point => t(`workhub.point.${point}`))}
          cta={t("workhub.cta")}
          href="/docs#idea-to-output"
          image={HOME_PUBLIC_ASSETS.aiWorkHub}
          alt={t("a11y.workhubImage")}
          workflowLabel={t("label.workflow")}
        />

        <section
          id="harness-platform"
          className="border-y border-border/60 bg-slate-950 py-20 text-white sm:py-28"
        >
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8">
            <ImageFrame
              src={HOME_PUBLIC_ASSETS.harnessPlatform}
              alt={t("harness.imageAlt")}
            />
            <div>
              <SectionKicker>{t("harness.eyebrow")}</SectionKicker>
              <h2 className="mt-6 text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                {t("harness.title")}
              </h2>
              <p className="mt-6 text-base leading-8 text-slate-300 sm:text-lg">
                {t("harness.body")}
              </p>
              <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map(point => (
                  <li
                    key={point}
                    className="flex items-start gap-3 text-sm leading-6 text-slate-200 sm:text-base"
                  >
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-200">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    {t(`harness.point.${point}`)}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <ActionLink
                  href="/features"
                  className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                >
                  {t("harness.cta")}
                </ActionLink>
              </div>
            </div>
          </div>
        </section>

        <SpotlightSection
          id="vertical-series"
          tone="bg-slate-950 text-white"
          eyebrow={t("vertical.eyebrow")}
          title={t("vertical.title")}
          body={t("vertical.body")}
          points={verticalPoints.map(point => t(`vertical.point.${point}`))}
          cta={t("vertical.cta")}
          href="/signup"
          image={HOME_PUBLIC_ASSETS.verticalSeries}
          alt={t("a11y.verticalImage")}
          workflowLabel={t("label.workflow")}
          dark
        />

        <SpotlightSection
          id="product-review-video"
          tone="bg-gradient-to-b from-background to-cyan-50/40 dark:to-cyan-950/20"
          eyebrow={t("product.eyebrow")}
          title={t("product.title")}
          body={t("product.body")}
          points={productPoints.map(point => t(`product.point.${point}`))}
          cta={t("product.cta")}
          href="/signup"
          image={HOME_PUBLIC_ASSETS.productReview}
          alt={t("a11y.productImage")}
          workflowLabel={t("label.workflow")}
          reverse
        />

        <SpotlightSection
          id="marketplace-capture"
          tone="bg-slate-950 text-white"
          eyebrow={t("capture.eyebrow")}
          title={t("capture.title")}
          body={t("capture.body")}
          points={capturePoints.map(point => t(`capture.point.${point}`))}
          cta={t("capture.cta")}
          href="/docs#marketplace-capture"
          image={HOME_PUBLIC_ASSETS.marketplaceToContent}
          alt={t("a11y.captureImage")}
          workflowLabel={t("label.workflow")}
          dark
          reverse
        />

        <SpotlightSection
          id="connected-ecosystem"
          tone="bg-gradient-to-b from-background to-indigo-50/50 dark:to-indigo-950/20"
          eyebrow={t("runtime.eyebrow")}
          title={t("runtime.title")}
          body={t("runtime.body")}
          points={runtimePoints.map(point => t(`runtime.point.${point}`))}
          cta={t("runtime.cta")}
          href="/docs#worker-render"
          image={HOME_PUBLIC_ASSETS.connectedEcosystem}
          alt={t("a11y.runtimeImage")}
          workflowLabel={t("label.workflow")}
        />

        <section
          id="chat-skills"
          className="relative overflow-hidden bg-slate-100/70 py-20 dark:bg-slate-900/70 sm:py-28"
        >
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8">
            <ImageFrame
              src={HOME_PUBLIC_ASSETS.chatSkills}
              alt={t("a11y.chatImage")}
            />
            <div>
              <SectionKicker>{t("chat.eyebrow")}</SectionKicker>
              <h2 className="mt-6 text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                {t("chat.title")}
              </h2>
              <p className="mt-6 text-base leading-8 text-muted-foreground sm:text-lg">
                {t("chat.body")}
              </p>
              <ul className="mt-7 space-y-3">
                {chatPoints.map(point => (
                  <li
                    key={point}
                    className="flex items-center gap-3 text-sm text-foreground/85 sm:text-base"
                  >
                    <Bot
                      className="h-5 w-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {t(`chat.point.${point}`)}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <ActionLink href="/signup">{t("chat.cta")}</ActionLink>
              </div>
            </div>
          </div>
        </section>

        <section
          id="skills"
          className="relative overflow-hidden py-20 sm:py-28"
        >
          <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-primary/10 to-transparent" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-8">
            <div>
              <SectionKicker>{t("skills.eyebrow")}</SectionKicker>
              <h2 className="mt-6 text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                {t("skills.title")}
              </h2>
              <p className="mt-6 text-base leading-8 text-muted-foreground sm:text-lg">
                {t("skills.body")}
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {skillsChips.map(chip => (
                  <span
                    key={chip}
                    className="rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
                  >
                    {t(`skills.chip.${chip}`)}
                  </span>
                ))}
              </div>
              <div className="mt-8">
                <ActionLink href="/marketplace">{t("skills.cta")}</ActionLink>
              </div>
            </div>
            <ImageFrame
              src={HOME_PUBLIC_ASSETS.skillsLibrary}
              alt={t("a11y.skillsImage")}
            />
          </div>
        </section>

        <section id="features" className="bg-muted/35 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <SectionKicker>{t("catalog.eyebrow")}</SectionKicker>
              <h2 className="mt-6 text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                {t("catalog.title")}
              </h2>
              <p className="mt-5 text-base leading-8 text-muted-foreground sm:text-lg">
                {t("catalog.body")}
              </p>
            </div>
            <div className="mt-12 space-y-12">
              {featureGroups.map(group => (
                <div key={group.id}>
                  <div className="mb-5 flex items-center gap-3">
                    <span className="h-px w-8 bg-primary" />
                    <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
                      {t(group.translationKey)}
                    </h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.features.map(feature => (
                      <FeatureCard key={feature.id} feature={feature} t={t} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="workflow"
          className="relative overflow-hidden py-20 sm:py-28"
        >
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-end gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
              <div>
                <SectionKicker>{t("workflow.eyebrow")}</SectionKicker>
                <h2 className="mt-6 text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                  {t("workflow.title")}
                </h2>
              </div>
              <p className="text-base leading-8 text-muted-foreground sm:text-lg">
                {t("workflow.body")}
              </p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-4">
              {workflowSteps.map((step, index) => (
                <article
                  key={step}
                  className="relative rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-6"
                >
                  <span className="text-sm font-bold text-primary">
                    0{index + 1}
                  </span>
                  <Workflow
                    className="mt-7 h-7 w-7 text-primary"
                    aria-hidden="true"
                  />
                  <h3 className="mt-5 text-base font-semibold text-foreground">
                    {t(`workflow.step.${step}`)}
                  </h3>
                  {index < workflowSteps.length - 1 ? (
                    <ArrowRight
                      className="absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 text-primary md:block"
                      aria-hidden="true"
                    />
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-card/70 py-16 sm:py-20">
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
            <div>
              <SectionKicker>{t("story.eyebrow")}</SectionKicker>
              <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
                {t("story.title")}
              </h2>
              <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
                {t("story.body")}
              </p>
            </div>
            <ActionLink href="/docs#smartaihub-story" variant="outline">
              {t("story.cta")}
              <ArrowUpRight className="ml-2 h-5 w-5" aria-hidden="true" />
            </ActionLink>
          </div>
        </section>

        <section className="relative overflow-hidden bg-slate-950 py-20 text-white sm:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.24),transparent_42%),radial-gradient(circle_at_80%_100%,rgba(168,85,247,0.22),transparent_38%)]" />
          <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <SectionKicker>{t("cta.eyebrow")}</SectionKicker>
            <h2 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {t("cta.title")}
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              {t("cta.body")}
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <ActionLink
                href="/signup"
                className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
              >
                {t("cta.primary")}
              </ActionLink>
              <ActionLink
                href="/features"
                variant="outline"
                className="border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                {t("cta.secondary")}
                <ArrowUpRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </ActionLink>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
