/** Route-to-namespace mapping. Ordered most-specific first. */
export const ROUTE_NAMESPACES = [
  { pathPrefix: "/dashboard", namespaces: ["dashboard"] as const },
  { pathPrefix: "/chat", namespaces: ["chat"] as const },
  { pathPrefix: "/agencies", namespaces: ["agency"] as const },
  { pathPrefix: "/workflows", namespaces: ["workflow"] as const },
  { pathPrefix: "/media", namespaces: ["media"] as const },
  { pathPrefix: "/generate", namespaces: ["media"] as const },
  { pathPrefix: "/gallery", namespaces: ["media"] as const },
  { pathPrefix: "/marketplace", namespaces: ["marketplace"] as const },
  { pathPrefix: "/presentation", namespaces: ["presentation"] as const },
  { pathPrefix: "/video-editor", namespaces: ["presentation"] as const },
  { pathPrefix: "/social", namespaces: ["social"] as const },
  { pathPrefix: "/automation", namespaces: ["social"] as const },
  { pathPrefix: "/admin", namespaces: ["admin"] as const },
  { pathPrefix: "/domain-admin", namespaces: ["settings"] as const },
  { pathPrefix: "/profile", namespaces: ["profile"] as const },
  { pathPrefix: "/settings", namespaces: ["settings"] as const },
  { pathPrefix: "/credits", namespaces: ["billing"] as const },
  { pathPrefix: "/usage", namespaces: ["billing"] as const },
  { pathPrefix: "/help", namespaces: ["help"] as const },
] as const;

/**
 * Returns the namespace array for the first matching path prefix,
 * or undefined if no match.
 */
export function getRouteNamespaces(
  pathname: string,
): readonly string[] | undefined {
  const match = ROUTE_NAMESPACES.find((entry) =>
    pathname.startsWith(entry.pathPrefix),
  );
  return match?.namespaces;
}
