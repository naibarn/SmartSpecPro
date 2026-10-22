const feedUrl = "https://nodejs.org/en/feed/blog.xml";
const latestReviewedAdvisory = Date.parse("2026-10-21T22:00:00Z");

const response = await fetch(feedUrl, { signal: AbortSignal.timeout(20_000) });
if (!response.ok) {
  throw new Error(`Node.js security feed returned HTTP ${response.status}.`);
}

const feed = await response.text();
const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)];
if (items.length === 0) {
  throw new Error("Node.js security feed contained no RSS items.");
}

function readTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() ?? null;
}

const advisories = items
  .map(([ , item]) => ({
    title: readTag(item, "title"),
    link: readTag(item, "link"),
    published: readTag(item, "pubDate"),
  }))
  .filter((item) => item.link?.includes("/blog/vulnerability/") && item.published)
  .map((item) => ({ ...item, timestamp: Date.parse(item.published) }));

if (advisories.length === 0 || advisories.some((item) => !Number.isFinite(item.timestamp))) {
  throw new Error("Node.js security feed did not contain parseable vulnerability entries.");
}

const unreviewed = advisories.filter((item) => item.timestamp > latestReviewedAdvisory);
if (unreviewed.length > 0) {
  console.error("New Node.js vulnerability advisory requires impact and fixed-version review:");
  for (const item of unreviewed) console.error(`- ${item.published}: ${item.title} — ${item.link}`);
  process.exit(1);
}

console.log(`No Node.js vulnerability advisory newer than 2026-10-21 was found (${advisories.length} feed entries reviewed).`);
