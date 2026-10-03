import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ArrowRight, BookOpen, LifeBuoy, Sparkles } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import EmergencyPublicEntry from "@/components/emergency/EmergencyPublicEntry";
import { Seo } from "@/components/Seo";
import { getPublicHomeSeo } from "@shared/publicHomeContent";

export default function Home() {
  const { t, i18n } = useTranslation("publicSite");
  const homeLanguage = (i18n.resolvedLanguage || i18n.language)
    .toLowerCase()
    .startsWith("th")
    ? "th"
    : "en";
  const homeSeo = getPublicHomeSeo(homeLanguage);

  useEffect(() => {
    document.documentElement.lang = homeLanguage;
  }, [homeLanguage]);

  return (
    <>
      <Seo
        title={homeSeo.title}
        description={homeSeo.description}
        keywords={[...homeSeo.keywords]}
        image={null}
        canonicalPath="/"
        fetchTenantSeo={false}
        useTenantDefaults={false}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "SmartAIHub",
            url: "/",
            description: homeSeo.description,
          },
          {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "SmartAIHub",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: homeSeo.description,
          },
        ]}
      />
      <Navbar />

      <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
        <section className="relative isolate overflow-hidden px-4 pb-16 pt-20 before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br before:from-primary/5 before:via-background before:to-accent/20 sm:px-6 sm:pb-24 sm:pt-24 lg:px-8">
          <header className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
              {t("homePublic.eyebrow")}
            </p>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-7xl">
              {t("homePublic.title")}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              {t("homePublic.description")}
            </p>
            <nav
              aria-label={t("homePublic.primaryNavigation")}
              className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"
            >
              <Link
                href="/signup"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Sparkles aria-hidden="true" className="h-5 w-5" />
                {t("hero.primaryCta")}
              </Link>
              <Link
                href="/features"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-5 py-3 font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("hero.secondaryCta")}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </nav>
            <p className="mt-6 text-sm text-muted-foreground">
              {t("hero.trust")}
            </p>
          </header>
        </section>

        <EmergencyPublicEntry variant="home" />

        <section
          aria-labelledby="home-product-title"
          className="border-y border-border/60 bg-card/50 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
        >
          <header className="mx-auto max-w-3xl text-center">
            <h2
              id="home-product-title"
              className="text-3xl font-bold tracking-tight sm:text-4xl"
            >
              {t("homePublic.productTitle")}
            </h2>
            <p className="mt-4 text-base leading-8 text-muted-foreground sm:text-lg">
              {t("homePublic.productBody")}
            </p>
          </header>
          <nav
            aria-label={t("homePublic.resourcesTitle")}
            className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-3"
          >
            <Link
              href="/features"
              className="group flex min-h-32 items-center gap-4 rounded-xl border border-border bg-background p-5 transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Sparkles
                aria-hidden="true"
                className="h-6 w-6 shrink-0 text-primary"
              />
              <p className="font-semibold">{t("homePublic.featuresLink")}</p>
              <ArrowRight
                aria-hidden="true"
                className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1"
              />
            </Link>
            <Link
              href="/docs"
              className="group flex min-h-32 items-center gap-4 rounded-xl border border-border bg-background p-5 transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BookOpen
                aria-hidden="true"
                className="h-6 w-6 shrink-0 text-primary"
              />
              <p className="font-semibold">{t("homePublic.docsLink")}</p>
              <ArrowRight
                aria-hidden="true"
                className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1"
              />
            </Link>
            <Link
              href="/contact"
              className="group flex min-h-32 items-center gap-4 rounded-xl border border-border bg-background p-5 transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LifeBuoy
                aria-hidden="true"
                className="h-6 w-6 shrink-0 text-primary"
              />
              <p className="font-semibold">{t("homePublic.contactLink")}</p>
              <ArrowRight
                aria-hidden="true"
                className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1"
              />
            </Link>
          </nav>
        </section>
      </main>

      <Footer />
    </>
  );
}
