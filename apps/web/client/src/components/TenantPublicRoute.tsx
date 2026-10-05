import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantPage } from "@/hooks/useTenantPage";
import { isSmartAIHubPublicSite } from "@/lib/publicSiteTenant";
import TenantHomePage from "@/pages/TenantHomePage";
import { Seo } from "./Seo";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";

type TenantPublicRouteProps = {
  pageKey: string | ((path: string) => string);
  children: ReactNode;
};

/** Prevent SmartAIHub public fallbacks from appearing on custom tenant domains. */
export function TenantPublicRoute({ pageKey, children }: TenantPublicRouteProps) {
  const { tenant, isLoading: tenantLoading } = useTenant();
  const [location] = useLocation();
  const resolvedPageKey = typeof pageKey === "function" ? pageKey(location) : pageKey;
  const { page, isLoading: pageLoading } = useTenantPage(resolvedPageKey);
  const { t } = useTranslation("publicSite");

  if (tenantLoading) return null;
  if (isSmartAIHubPublicSite(tenant)) return children;
  if (pageLoading) return null;
  if (page) {
    const canonicalPath = location.split(/[?#]/, 1)[0] || "/";
    return (
      <TenantHomePage
        page={page}
        canonicalPath={canonicalPath}
        showEmergencyEntry={resolvedPageKey === "home"}
      />
    );
  }
  const canonicalPath = location.split(/[?#]/, 1)[0] || "/";

  return (
    <>
      <Seo
        title={t("tenantPage.unavailableTitle")}
        description={t("tenantPage.unavailableBody")}
        canonicalPath={canonicalPath}
        noIndex
        fetchTenantSeo={false}
        useTenantDefaults={false}
      />
      <Navbar />
      <main className="container mx-auto min-h-[50vh] px-4 py-24 text-center sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold">{t("tenantPage.unavailableTitle")}</h1>
        <p className="mt-4 text-muted-foreground">{t("tenantPage.unavailableBody")}</p>
        <a className="mt-6 inline-flex text-primary underline underline-offset-4" href="/">
          {t("tenantPage.homeLink")}
        </a>
      </main>
      <Footer />
    </>
  );
}
