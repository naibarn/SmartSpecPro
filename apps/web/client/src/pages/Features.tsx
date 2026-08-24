import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clapperboard,
  Database,
  FolderOpen,
  Layers3,
  MessageSquareText,
  MonitorCog,
  ShieldCheck,
  Sparkles,
  Store,
  Video,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type Icon = typeof Bot;
const spotlights: Array<{
  key: "vertical" | "product" | "chat" | "skills" | "capture" | "worker";
  image: string;
  icon: Icon;
  points: number;
}> = [
  {
    key: "vertical",
    image: "/images/smartaihub-features-creation-suite.webp",
    icon: Clapperboard,
    points: 4,
  },
  {
    key: "product",
    image: "/images/smartaihub-features-product-review.webp",
    icon: Video,
    points: 4,
  },
  {
    key: "chat",
    image: "/images/smartaihub-features-chat-orchestration.webp",
    icon: MessageSquareText,
    points: 4,
  },
  {
    key: "skills",
    image: "/images/smartaihub-features-media-pipeline.webp",
    icon: Layers3,
    points: 4,
  },
  {
    key: "capture",
    image: "/images/smartaihub-features-marketplace-capture.webp",
    icon: Store,
    points: 4,
  },
  {
    key: "worker",
    image: "/images/smartaihub-features-worker-mcp.webp",
    icon: MonitorCog,
    points: 4,
  },
];
const featureGroups = [
  {
    key: "create",
    items: [
      "chat",
      "mediaStudio",
      "storyboard",
      "verticalSeries",
      "videoStudio",
      "productData",
      "presentation",
    ],
    icon: Sparkles,
  },
  {
    key: "organize",
    items: ["skills", "mediaHistory", "renderQueue", "library", "privateFiles"],
    icon: FolderOpen,
  },
  {
    key: "operate",
    items: ["finance", "financeReports", "credits"],
    icon: Database,
  },
] as const;

function SafeImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 ${className ?? ""}`}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={event => {
          event.currentTarget.style.display = "none";
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-white/5"
      />
    </div>
  );
}

export default function Features() {
  const { t } = useScopedTranslation("publicSite");
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <Seo
        title={t("features.meta.title")}
        description={t("features.meta.description")}
        keywords={t("features.meta.keywords").split(", ")}
        canonicalPath="/features"
      />
      <Navbar />
      <section className="relative isolate overflow-hidden border-b border-border/60 pt-28 sm:pt-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_15%_20%,rgba(139,92,246,0.14),transparent_38%),linear-gradient(180deg,rgba(248,250,252,0.9),transparent_58%)] dark:bg-[radial-gradient(circle_at_70%_25%,rgba(34,211,238,0.12),transparent_34%),radial-gradient(circle_at_15%_20%,rgba(139,92,246,0.16),transparent_38%),linear-gradient(180deg,rgba(2,6,23,0.95),transparent_58%)]" />
        <div className="container relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-8 lg:pb-28">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" /> {t("features.hero.eyebrow")}
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
              {t("features.hero.title")}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              {t("features.hero.body")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link href="/signup">
                  {t("features.hero.primaryCta")}{" "}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-border/70 bg-background/70 text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Link href="/docs">{t("features.hero.secondaryCta")}</Link>
              </Button>
            </div>
          </motion.div>
          <SafeImage
            src="/images/smartaihub-features-creation-suite.webp"
            alt={t("features.a11y.heroImage")}
            className="min-h-[20rem] rounded-[2rem] border border-border/60 shadow-2xl shadow-primary/10 sm:min-h-[30rem]"
          />
        </div>
      </section>
      <section className="border-b border-border/60 bg-card/60 py-5">
        <div className="container mx-auto flex max-w-7xl flex-wrap justify-center gap-x-8 gap-y-3 px-4 text-sm text-muted-foreground sm:px-6 lg:px-8">
          {["vertical", "product", "chat", "skills"].map(key => (
            <span key={key} className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {t(`features.proof.${key}`)}
            </span>
          ))}
        </div>
      </section>
      <section className="container mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mb-14 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[.25em] text-primary">
            {t("features.spotlights.eyebrow")}
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
            {t("features.spotlights.title")}
          </h2>
        </div>
        <div className="space-y-20 lg:space-y-28">
          {spotlights.map((spotlight, index) => (
            <motion.article
              key={spotlight.key}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16"
            >
              <SafeImage
                src={spotlight.image}
                alt={t(`features.spotlight.${spotlight.key}.imageAlt`)}
                className={`min-h-[18rem] rounded-[1.75rem] border border-border/60 shadow-2xl sm:min-h-[25rem] ${index % 2 ? "lg:order-2" : ""}`}
              />
              <div className={index % 2 ? "lg:order-1" : ""}>
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-400/20 text-primary">
                  <spotlight.icon className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold uppercase tracking-[.2em] text-primary">
                  {t(`features.spotlight.${spotlight.key}.eyebrow`)}
                </p>
                <h3 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {t(`features.spotlight.${spotlight.key}.title`)}
                </h3>
                <p className="mt-5 text-base leading-8 text-muted-foreground">
                  {t(`features.spotlight.${spotlight.key}.body`)}
                </p>
                <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: spotlight.points }, (_, point) => (
                    <li
                      key={point}
                      className="flex gap-3 text-sm text-foreground/85"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {t(
                        `features.spotlight.${spotlight.key}.point.${point + 1}`
                      )}
                    </li>
                  ))}
                </ul>
                <Link
                  href={
                    spotlight.key === "vertical"
                      ? "/drama-series"
                      : spotlight.key === "chat"
                        ? "/chat"
                        : spotlight.key === "capture"
                          ? "/docs#marketplace-capture"
                          : spotlight.key === "worker"
                            ? "/docs#worker-render"
                            : "/signup"
                  }
                  className="mt-8 inline-flex items-center font-semibold text-primary hover:text-primary/80"
                >
                  {t(`features.spotlight.${spotlight.key}.cta`)}{" "}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </motion.article>
          ))}
        </div>
      </section>
      <section className="border-y border-primary/15 bg-primary/5 py-16 sm:py-20">
        <div className="container mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.25em] text-primary">
              {t("features.advanced.eyebrow")}
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("features.advanced.title")}
            </h2>
          </div>
          <p className="leading-8 text-muted-foreground">
            {t("features.advanced.body")}
          </p>
        </div>
      </section>
      <section className="border-y border-border/60 bg-muted/35 py-20 sm:py-28">
        <div className="container mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-8">
          <SafeImage
            src="/images/smartaihub-features-organization-security.webp"
            alt={t("features.a11y.organizationImage")}
            className="min-h-[20rem] rounded-[2rem] border border-border/60 shadow-2xl sm:min-h-[28rem]"
          />
          <div>
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-400/20 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[.2em] text-primary">
              {t("features.organization.eyebrow")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("features.organization.title")}
            </h2>
            <p className="mt-5 leading-8 text-muted-foreground">
              {t("features.organization.body")}
            </p>
            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map(point => (
                <li
                  key={point}
                  className="flex gap-3 text-sm text-foreground/85"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {t(`features.organization.point.${point}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section className="border-y border-border/60 bg-gradient-to-b from-card/70 to-transparent py-20 sm:py-28">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[.25em] text-primary">
              {t("features.catalog.eyebrow")}
            </p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-5xl">
              {t("features.catalog.title")}
            </h2>
            <p className="mt-5 text-muted-foreground">
              {t("features.catalog.body")}
            </p>
          </div>
          <div className="space-y-12">
            {featureGroups.map(group => {
              const GroupIcon = group.icon;
              return (
                <div key={group.key}>
                  <div className="mb-5 flex items-center gap-3">
                    <GroupIcon className="h-5 w-5 text-primary" />
                    <h3 className="text-xl font-semibold">
                      {t(`features.group.${group.key}`)}
                    </h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {group.items.map(item => (
                      <div
                        key={item}
                        className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm transition hover:border-primary/30 hover:bg-accent/60 hover:shadow-md"
                      >
                        <h4 className="font-semibold">
                          {t(`feature.${item}.title`)}
                        </h4>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {t(`feature.${item}.description`)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <section className="container mx-auto max-w-5xl px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
        <div className="rounded-[2rem] border border-primary/20 bg-card/80 p-8 text-center shadow-sm sm:p-12">
          <h2 className="text-3xl font-semibold sm:text-4xl">
            {t("features.story.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl leading-8 text-muted-foreground">
            {t("features.story.body")}
          </p>
          <Link
            href="/docs#smartaihub-story"
            className="mt-7 inline-flex items-center font-semibold text-primary hover:text-primary/80"
          >
            {t("features.story.cta")} <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>
      <section className="container mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:py-28 lg:px-8">
        <div className="rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/15 via-cyan-400/10 to-card/60 p-8 text-center shadow-2xl shadow-primary/10 sm:p-14">
          <Bot className="mx-auto h-12 w-12 text-primary" />
          <h2 className="mt-5 text-3xl font-semibold sm:text-5xl">
            {t("features.cta.title")}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl leading-8 text-muted-foreground">
            {t("features.cta.body")}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link href="/signup">{t("features.cta.primary")}</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-border/70 text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <Link href="/docs">{t("features.cta.secondary")}</Link>
            </Button>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
