import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearch } from "wouter";
import { Search } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { List } from "@astryxdesign/core/List";
import { ListItem } from "@astryxdesign/core/List";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { getSpec260ApiPath, getSpec260PagePath } from "@smartspec/shared/src/emergencyRouteManifest";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

interface SearchItem {
  kind?: unknown;
  publicRef?: unknown;
  title?: unknown;
  status?: unknown;
  freshness?: unknown;
}

function destination(item: SearchItem): string | null {
  if (typeof item.publicRef !== "string") return null;
  if (item.kind === "situation") return getSpec260PagePath("public.event", { publicRef: item.publicRef });
  if ((item.kind === "facility" || item.kind === "alert") && typeof item.title === "string") {
    const query = new URLSearchParams({ q: item.title });
    return `${getSpec260PagePath("public.map")}?${query.toString()}`;
  }
  return null;
}

export default function EmergencyPublicSearch() {
  const { t } = useScopedTranslation("emergency");
  const searchParams = useSearch();
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "empty" | "unavailable">("idle");
  const [truncated, setTruncated] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<Array<{ canonicalRef: string; kind: string; names: { en: string; th: string }; jurisdiction: { countryCode: string; admin1Code?: string } }>>([]);
  const [placeState, setPlaceState] = useState<"idle" | "loading" | "ready" | "empty" | "unavailable">("idle");
  const requestRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (rawValue: string) => {
    const value = rawValue.trim();
    if (value.length < 2) {
      setItems([]);
      setState("empty");
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState("loading");
    try {
      const response = await fetch(`${getSpec260ApiPath("public.search")}?q=${encodeURIComponent(value)}`, {
        credentials: "omit", cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw new Error("search_unavailable");
      const payload = await response.json() as { items?: SearchItem[]; truncated?: boolean };
      if (controller.signal.aborted) return;
      const results = Array.isArray(payload.items) ? payload.items : [];
      setItems(results);
      setTruncated(payload.truncated === true);
      setState(results.length ? "ready" : "empty");
    } catch {
      if (controller.signal.aborted) return;
      setItems([]);
      setTruncated(false);
      setState("unavailable");
    }
  }, []);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    const value = new URLSearchParams(searchParams).get("q") ?? "";
    setQuery(value);
    if (value.trim().length >= 2) void runSearch(value);
    else {
      requestRef.current?.abort();
      setItems([]);
      setTruncated(false);
      setState("idle");
    }
  }, [runSearch, searchParams]);

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(query);
  };

  const searchPlaces = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = placeQuery.trim();
    if (value.length < 2) { setPlaceResults([]); setPlaceState("empty"); return; }
    setPlaceResults([]);
    setPlaceState("loading");
    try {
      const url = new URL(getSpec260ApiPath("public.geo.places.search"), window.location.origin);
      url.searchParams.set("q", value);
      url.searchParams.set("locale", document.documentElement.lang.startsWith("th") ? "th" : "en");
      const response = await fetch(url.toString(), { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error("place_search_unavailable");
      const payload = await response.json() as { results?: typeof placeResults };
      const results = Array.isArray(payload.results) ? payload.results : [];
      setPlaceResults(results);
      setPlaceState(results.length ? "ready" : "empty");
    } catch {
      setPlaceResults([]);
      setPlaceState("unavailable");
    }
  };

  return <Card className="border-slate-200 shadow-sm">
    <VStack gap={4}>
      <header>
        <Heading level={2}>{t("search.title")}</Heading>
        <Text>{t("search.description")}</Text>
      </header>
      <form onSubmit={search} role="search">
        <VStack gap={2}>
        <TextInput label={t("search.label")} value={query} onChange={value => setQuery(value.slice(0, 80))}
          placeholder={t("search.placeholder")} startIcon={<Search size={16} aria-hidden="true" />} hasClear />
        <Button type="submit" isDisabled={state === "loading" || query.trim().length < 2}
          label={state === "loading" ? t("search.loading") : t("search.submit")} />
        </VStack>
      </form>
      {state === "empty" && <Text role="status">{t("search.empty")}</Text>}
      {state === "unavailable" && <Text role="status">{t("search.unavailable")}</Text>}
      {truncated && <Text role="status">{t("search.truncated")}</Text>}
      {items.length > 0 && <List header={t("search.results")} hasDividers>
        {items.map((item, index) => {
          const href = destination(item);
          const title = typeof item.title === "string" ? item.title : t("search.untitled");
          const description = [item.status, item.freshness].filter(value => typeof value === "string").join(" · ");
          return <ListItem key={`${String(item.kind)}:${String(item.publicRef)}:${index}`} label={title}
            description={description || undefined} href={href ?? undefined} />;
        })}
      </List>}
      <VStack gap={3}>
        <Heading level={3}>{t("geoSearch.title")}</Heading>
        <Text>{t("geoSearch.description")}</Text>
        <form onSubmit={searchPlaces} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextInput label={t("geoSearch.label")} value={placeQuery}
            onChange={value => { setPlaceQuery(value); setPlaceResults([]); setPlaceState("idle"); }} placeholder={t("geoSearch.placeholder")}
            isDisabled={placeState === "loading"} hasClear />
          <Button type="submit" isDisabled={placeState === "loading" || placeQuery.trim().length < 2}
            label={placeState === "loading" ? t("geoSearch.loading") : t("geoSearch.submit")} />
        </form>
        {placeState === "empty" && <Text role="status">{t("geoSearch.empty")}</Text>}
        {placeState === "unavailable" && <Text role="status">{t("geoSearch.unavailable")}</Text>}
        {placeResults.map(place => <Text key={place.canonicalRef} role="status">
          {`${document.documentElement.lang.startsWith("th") ? place.names.th : place.names.en} · ${place.jurisdiction.countryCode}${place.jurisdiction.admin1Code ? ` / ${place.jurisdiction.admin1Code}` : ""} · ${t("geoSearch.limited")}`}
        </Text>)}
      </VStack>
    </VStack>
  </Card>;
}
