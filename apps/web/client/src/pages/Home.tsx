import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import EmergencyPublicEntry from "@/components/emergency/EmergencyPublicEntry";
import { PublicHomeExperience } from "@/components/publicUi";
import { Seo } from "@/components/Seo";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantPage, type TenantPageData } from "@/hooks/useTenantPage";
import TenantHomePage from "./TenantHomePage";
import { isSmartAIHubPublicSite } from "@/lib/publicSiteTenant";
import { getPublicHomeSeo } from "@shared/publicHomeContent";

function getTenantFallbackPage(
  tenant: ReturnType<typeof useTenant>["tenant"]
): TenantPageData {
  const title = tenant?.name || "Welcome";
  const description = tenant?.seo?.defaultDescription || "";
  return {
    id: 0,
    tenantId: tenant?.id || "",
    pageKey: "home",
    title,
    slug: "home",
    isPublished: true,
    metadata: { description },
    sections: [
      { id: "tenant-default-home", type: "hero", title, subtitle: description },
    ],
  };
}

export default function Home() {
  const { t, i18n } = useTranslation("publicSite");
  const homeLanguage = (i18n.resolvedLanguage || i18n.language)
    .toLowerCase()
    .startsWith("th")
    ? "th"
    : "en";
  const homeSeo = getPublicHomeSeo(homeLanguage);
  const { tenant, isLoading } = useTenant();
  const isPlatformPublicSite = isSmartAIHubPublicSite(tenant);
  const { page: tenantPage } = useTenantPage("home", {
    enabled: !isPlatformPublicSite,
  });

  useEffect(() => {
    document.documentElement.lang = homeLanguage;
  }, [homeLanguage]);

  if (isLoading) return null;
  if (tenantPage && !isPlatformPublicSite) {
    return <TenantHomePage page={tenantPage} />;
  }
  if (!isPlatformPublicSite) {
    return <TenantHomePage page={getTenantFallbackPage(tenant)} />;
  }

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

      <main className="public-home-main">
        <PublicHomeExperience
          copy={{
            eyebrow: t("homePublic.eyebrow"),
            title: t("homePublic.title"),
            description: t("homePublic.description"),
            primaryNavigation: t("homePublic.primaryNavigation"),
            flowLabel: t("homePublic.flowLabel"),
            flowTitle: t("homePublic.flowTitle"),
            flowStepOne: t("homePublic.flowStepOne"),
            flowValueOne: t("homePublic.flowValueOne"),
            flowStepTwo: t("homePublic.flowStepTwo"),
            flowValueTwo: t("homePublic.flowValueTwo"),
            flowFootnote: t("homePublic.flowFootnote"),
            seriesFlowLabel: t("homePublic.seriesFlowLabel"),
            seriesFlowTitle: t("homePublic.seriesFlowTitle"),
            seriesStepOne: t("homePublic.seriesStepOne"),
            seriesValueOne: t("homePublic.seriesValueOne"),
            seriesStepTwo: t("homePublic.seriesStepTwo"),
            seriesValueTwo: t("homePublic.seriesValueTwo"),
            seriesFlowFootnote: t("homePublic.seriesFlowFootnote"),
            illustrationDisclosure: t("homePublic.illustrationDisclosure"),
            heroImageAlt: t("a11y.heroImage"),
            heroImageFallback: t("homePublic.humanImageFallback"),
            primaryCta: t("hero.primaryCta"),
            secondaryCta: t("hero.secondaryCta"),
            trust: t("hero.trust"),
            flagshipEyebrow: t("homePublic.flagshipEyebrow"),
            flagshipTitle: t("homePublic.flagshipTitle"),
            flagshipBody: t("homePublic.flagshipBody"),
            flagshipCta: t("homePublic.flagshipCta"),
            flagshipDetailsCta: t("homePublic.flagshipDetailsCta"),
            productTitle: t("homePublic.productTitle"),
            productBody: t("homePublic.productBody"),
            resourcesTitle: t("homePublic.resourcesTitle"),
            featuresLink: t("homePublic.featuresLink"),
            featuresDescription: t("homePublic.featuresDescription"),
            docsLink: t("homePublic.docsLink"),
            docsDescription: t("homePublic.docsDescription"),
            contactLink: t("homePublic.contactLink"),
            galleryLink: t("homePublic.galleryLink"),
            galleryDescription: t("homePublic.galleryDescription"),
            trustTitle: t("homePublic.trustTitle"),
            trustBody: t("homePublic.trustBody"),
            closingTitle: t("homePublic.closingTitle"),
            closingBody: t("homePublic.closingBody"),
            closingCta: t("homePublic.closingCta"),
            whyEyebrow: t("homePublic.whyEyebrow"),
            whyTitle: t("homePublic.whyTitle"),
            whyBody: t("homePublic.whyBody"),
            valueStartTitle: t("homePublic.valueStartTitle"),
            valueStartBody: t("homePublic.valueStartBody"),
            valueCreateTitle: t("homePublic.valueCreateTitle"),
            valueCreateBody: t("homePublic.valueCreateBody"),
            valueContinueTitle: t("homePublic.valueContinueTitle"),
            valueContinueBody: t("homePublic.valueContinueBody"),
            showcaseEyebrow: t("features.spotlights.eyebrow"),
            showcaseTitle: t("features.spotlights.title"),
            showcases: [
              {
                key: "chat",
                eyebrow: t("features.spotlight.chat.eyebrow"),
                title: t("features.spotlight.chat.title"),
                body: t("features.spotlight.chat.body"),
                cta: t("features.spotlight.chat.cta"),
                href: "/chat",
                image: "/images/smartaihub-features-chat-orchestration.webp",
                imageAlt: t("features.spotlight.chat.imageAlt"),
              },
              {
                key: "product",
                eyebrow: t("features.spotlight.product.eyebrow"),
                title: t("features.spotlight.product.title"),
                body: t("features.spotlight.product.body"),
                cta: t("features.spotlight.product.cta"),
                href: "/signup",
                image: "/images/smartaihub-product-review-video.webp",
                imageAlt: t("features.spotlight.product.imageAlt"),
              },
              {
                key: "vertical",
                eyebrow: t("features.spotlight.vertical.eyebrow"),
                title: t("features.spotlight.vertical.title"),
                body: t("features.spotlight.vertical.body"),
                cta: t("features.spotlight.vertical.cta"),
                href: "/login?returnUrl=%2Fdrama-series",
                image: "/images/smartaihub-vertical-series.webp",
                imageAlt: t("features.spotlight.vertical.imageAlt"),
              },
              {
                key: "skills",
                eyebrow: t("features.spotlight.skills.eyebrow"),
                title: t("features.spotlight.skills.title"),
                body: t("features.spotlight.skills.body"),
                cta: t("features.spotlight.skills.cta"),
                href: "/marketplace",
                image: "/images/smartaihub-skills-library.webp",
                imageAlt: t("a11y.skillsImage"),
              },
            ],
          }}
          supportingFeature={<EmergencyPublicEntry variant="home" />}
        />
      </main>

      <Footer />
    </>
  );
}
