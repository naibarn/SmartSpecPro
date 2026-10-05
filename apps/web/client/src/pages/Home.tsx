import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import EmergencyPublicEntry from "@/components/emergency/EmergencyPublicEntry";
import { PublicHomeExperience } from "@/components/publicUi";
import { Seo } from "@/components/Seo";
import { HOME_PUBLIC_ASSETS } from "./homeContent";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantPage, type TenantPageData } from "@/hooks/useTenantPage";
import TenantHomePage from "./TenantHomePage";
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
  const { page: tenantPage } = useTenantPage("home");

  useEffect(() => {
    document.documentElement.lang = homeLanguage;
  }, [homeLanguage]);

  if (isLoading) return null;
  if (tenantPage) return <TenantHomePage page={tenantPage} />;
  if (tenant?.primaryDomain?.toLowerCase() !== "smartaihub.app") {
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

      <main>
        <PublicHomeExperience
          copy={{
            eyebrow: t("homePublic.eyebrow"),
            title: t("homePublic.title"),
            description: t("homePublic.description"),
            primaryNavigation: t("homePublic.primaryNavigation"),
            primaryCta: t("hero.primaryCta"),
            secondaryCta: t("hero.secondaryCta"),
            trust: t("hero.trust"),
            heroImageAlt: t("homePublic.heroImageAlt"),
            illustrationCaption: t("homePublic.illustrationCaption"),
            imageUnavailable: t("homePublic.imageUnavailable"),
            flagshipEyebrow: t("homePublic.flagshipEyebrow"),
            flagshipTitle: t("homePublic.flagshipTitle"),
            flagshipBody: t("homePublic.flagshipBody"),
            flagshipCta: t("homePublic.flagshipCta"),
            flagshipDetailsCta: t("homePublic.flagshipDetailsCta"),
            flagshipImageAlt: t("homePublic.flagshipImageAlt"),
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
          }}
          assets={{
            hero: HOME_PUBLIC_ASSETS.hero,
            verticalSeries: HOME_PUBLIC_ASSETS.verticalSeries,
          }}
          afterHero={<EmergencyPublicEntry variant="home" />}
        />
      </main>

      <Footer />
    </>
  );
}
