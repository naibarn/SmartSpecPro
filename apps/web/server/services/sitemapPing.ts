const PING_ENABLED = process.env.NODE_ENV === "production" || process.env.ENABLE_SITEMAP_PING === "true";

function sitemapUrlForDomain(domain: string): string {
  const baseDomain = domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return `https://${baseDomain}/sitemap.xml`;
}

export async function pingSmartAiHubSearchEngines(domain: string): Promise<void> {
  if (!PING_ENABLED) return;

  const sitemapUrl = sitemapUrlForDomain(domain);
  const endpoints = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
  ];

  await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        await fetch(endpoint, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    }),
  );
}
