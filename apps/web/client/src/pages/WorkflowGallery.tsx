import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clapperboard,
  FileCheck2,
  Sparkles,
  Video,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  listSeriesProfiles,
  type VdSeriesProfileId,
  type VdSeriesProfile,
} from "@shared/verticalDramaSeries/seriesProfile";

const profileGroups = [
  {
    key: "drama",
    icon: Clapperboard,
    ids: [
      "drama_romance",
      "horror_thriller",
      "sci_fi_cyberpunk",
      "action_epic",
      "fantasy_fairytale_xianxia",
      "animation_cartoon",
    ] as VdSeriesProfileId[],
  },
  {
    key: "documentary",
    icon: BookOpen,
    ids: [
      "documentary",
      "news_report",
      "hybrid_docu_drama",
    ] as VdSeriesProfileId[],
  },
  {
    key: "review",
    icon: Video,
    ids: [
      "location_review",
      "restaurant_review",
      "product_review",
      "software_review",
    ] as VdSeriesProfileId[],
  },
] as const;
const profileImages: Record<VdSeriesProfileId, string> = {
  drama_romance: "/images/smartaihub-drama-profile-drama-romance.webp",
  horror_thriller: "/images/smartaihub-drama-profile-horror-thriller.webp",
  sci_fi_cyberpunk: "/images/smartaihub-drama-profile-sci-fi-cyberpunk.webp",
  action_epic: "/images/smartaihub-drama-profile-action-epic.webp",
  fantasy_fairytale_xianxia:
    "/images/smartaihub-drama-profile-fantasy-xianxia.webp",
  animation_cartoon: "/images/smartaihub-drama-profile-animation-cartoon.webp",
  documentary: "/images/smartaihub-drama-profile-documentary.webp",
  news_report: "/images/smartaihub-drama-profile-news-report.webp",
  location_review: "/images/smartaihub-drama-profile-location-review.webp",
  restaurant_review: "/images/smartaihub-drama-profile-restaurant-review.webp",
  product_review: "/images/smartaihub-drama-profile-product-review.webp",
  software_review: "/images/smartaihub-drama-profile-software-review.webp",
  hybrid_docu_drama: "/images/smartaihub-drama-profile-hybrid-docu-drama.webp",
};

function getProfileTypeLabel(profile: VdSeriesProfile, locale: string) {
  return locale === "th" ? profile.title : profile.titleEn;
}

function SafeImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-[9/16] overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        onError={event => {
          event.currentTarget.style.display = "none";
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-white/10"
      />
    </div>
  );
}

export default function WorkflowGallery() {
  const { t, locale } = useScopedTranslation("publicSite");
  const profileMap = new Map(
    listSeriesProfiles().map(profile => [profile.profileId, profile])
  );
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <Seo
        title={t("gallery.meta.title")}
        description={t("gallery.meta.description")}
        keywords={t("gallery.meta.keywords").split(", ")}
        canonicalPath="/workflows/gallery"
      />
      <Navbar />
      <section className="relative overflow-hidden border-b border-border/60 pt-28 sm:pt-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_18%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_12%_25%,rgba(139,92,246,0.14),transparent_36%),linear-gradient(180deg,rgba(248,250,252,0.9),transparent_58%)] dark:bg-[radial-gradient(circle_at_75%_18%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_12%_25%,rgba(139,92,246,0.16),transparent_36%),linear-gradient(180deg,rgba(2,6,23,0.95),transparent_58%)]" />
        <div className="container relative mx-auto max-w-7xl px-4 pb-20 text-center sm:px-6 lg:px-8 lg:pb-28">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" /> {t("gallery.hero.eyebrow")}
          </p>
          <h1 className="mx-auto max-w-5xl text-4xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
            {t("gallery.hero.title")}
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
            {t("gallery.hero.body")}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link href="/drama-series">
                {t("gallery.hero.primaryCta")}{" "}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-border/70 bg-background/70 text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <Link href="/features">{t("gallery.hero.secondaryCta")}</Link>
            </Button>
          </div>
          <div className="mx-auto mt-12 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
            {["catalog", "continuity", "review"].map(key => (
              <div
                key={key}
                className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm"
              >
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {t(`gallery.proof.${key}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="container mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[.25em] text-primary">
            {t("gallery.catalog.eyebrow")}
          </p>
          <h2 className="mt-4 text-3xl font-semibold sm:text-5xl">
            {t("gallery.catalog.title")}
          </h2>
          <p className="mt-5 leading-8 text-muted-foreground">
            {t("gallery.catalog.body")}
          </p>
        </div>
        <div className="space-y-20">
          {profileGroups.map(group => {
            const GroupIcon = group.icon;
            return (
              <section
                key={group.key}
                aria-labelledby={`profile-group-${group.key}`}
              >
                <div className="mb-7 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <GroupIcon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3
                      id={`profile-group-${group.key}`}
                      className="text-2xl font-semibold"
                    >
                      {t(`gallery.category.${group.key}.title`)}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(`gallery.category.${group.key}.body`)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.ids.map((id, index) => {
                    const profile = profileMap.get(id);
                    if (!profile) return null;
                    const title =
                      locale === "th" ? profile.title : profile.titleEn;
                    return (
                      <motion.article
                        key={id}
                        initial={{ opacity: 0, y: 18 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.035 }}
                        className="group overflow-hidden rounded-3xl border border-border/60 bg-card/80 shadow-sm transition hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl"
                      >
                        <SafeImage
                          src={profileImages[id]}
                          alt={t(`gallery.profile.${id}.imageAlt`)}
                        />
                        <div className="p-5">
                          <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
                            <span className="rounded-full bg-primary/10 px-2.5 py-1">
                              <span data-testid={`profile-type-${id}`}>
                                {getProfileTypeLabel(profile, locale)}
                              </span>
                            </span>
                            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-200">
                              {profile.sourceGatePolicy === "required"
                                ? t("gallery.badge.sourcesRequired")
                                : t("gallery.badge.sourcesOptional")}
                            </span>
                          </div>
                          <h4 className="mt-4 text-xl font-semibold">
                            {title}
                          </h4>
                          <p className="mt-3 min-h-20 text-sm leading-7 text-muted-foreground">
                            {t(`gallery.profile.${id}.description`)}
                          </p>
                          <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                            <FileCheck2 className="h-4 w-4 text-primary" />
                            {t(`gallery.profile.${id}.evidence`)}
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>
      <section className="border-y border-border/60 bg-card/60 py-20 sm:py-28">
        <div className="container mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.25em] text-primary">
              {t("gallery.cta.eyebrow")}
            </p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-5xl">
              {t("gallery.cta.title")}
            </h2>
            <p className="mt-5 max-w-2xl leading-8 text-muted-foreground">
              {t("gallery.cta.body")}
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Link href="/drama-series">
              {t("gallery.cta.primary")} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
      <Footer />
    </main>
  );
}
