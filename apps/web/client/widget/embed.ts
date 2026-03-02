/**
 * Widget Embed Script — served at /widget/v1/embed.js
 *
 * Website owners embed this with a single <script> tag:
 *   <script src="https://smartaihub.app/widget/v1/embed.js"
 *     data-widget-id="<WIDGET_UUID>"
 *     data-position="bottom-right">
 *   </script>
 *
 * Security:
 * - All postMessage handlers validate event.origin strictly
 * - Duplicate initialization is idempotent (no double iframes)
 * - Token stored in iframe's sessionStorage only (not accessible to parent)
 */

export const WIDGET_CONTAINER_ID = "ssp-widget-container";
const ALLOWED_ORIGIN = "https://smartaihub.app";
const INIT_ENDPOINT = `${ALLOWED_ORIGIN}/api/widget/init`;

/**
 * Check if a postMessage origin is the trusted smartaihub.app origin.
 * Exported for unit testing.
 */
export function isValidOrigin(origin: string): boolean {
  return origin === ALLOWED_ORIGIN;
}

/**
 * Build the iframe src URL for the widget chat page.
 * Exported for unit testing.
 */
export function buildIframeSrc(widgetId: string, token: string): string {
  return `${ALLOWED_ORIGIN}/widget/v1/chat?widget=${encodeURIComponent(widgetId)}&token=${encodeURIComponent(token)}`;
}

/**
 * Create and inject the widget iframe into the DOM.
 * Idempotent — skips creation if container already exists.
 * Exported for unit testing.
 */
export function createWidgetIframe(
  widgetId: string,
  _iframeSrc: string,
  position: "bottom-right" | "bottom-left" = "bottom-right",
): void {
  if (document.getElementById(WIDGET_CONTAINER_ID)) {
    return; // Already initialized
  }

  const container = document.createElement("div");
  container.id = WIDGET_CONTAINER_ID;
  container.style.position = "fixed";
  container.style.bottom = "24px";
  container.style.zIndex = "999999";
  container.style.width = "380px";
  container.style.height = "600px";

  if (position === "bottom-left") {
    container.style.left = "24px";
  } else {
    container.style.right = "24px";
  }

  const iframe = document.createElement("iframe");
  iframe.src = _iframeSrc;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  iframe.style.borderRadius = "12px";
  iframe.style.boxShadow = "0 4px 24px rgba(0,0,0,0.18)";
  // Sandbox: allow scripts and same-origin for WS, but restrict navigation
  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-forms allow-popups",
  );
  iframe.setAttribute("title", "Chat Widget");

  container.appendChild(iframe);
  document.body.appendChild(container);

  // Listen for postMessage from iframe (resize, toggle)
  window.addEventListener("message", (event) => {
    if (!isValidOrigin(event.origin)) return;
    const msg = event.data as { type?: string; height?: number };
    if (msg.type === "widget:resize" && typeof msg.height === "number") {
      container.style.height = `${Math.min(Math.max(msg.height, 200), 700)}px`;
    }
    if (msg.type === "widget:close") {
      container.style.display = "none";
    }
    if (msg.type === "widget:open") {
      container.style.display = "block";
    }
  });
}

// ── Auto-init from script tag data attributes ─────────────────────────────────

function autoInit(): void {
  const script =
    document.currentScript ??
    document.querySelector<HTMLScriptElement>(`script[data-widget-id]`);

  if (!script) return;

  const widgetId = (script as HTMLScriptElement).dataset.widgetId;
  const position = ((script as HTMLScriptElement).dataset.position ?? "bottom-right") as
    | "bottom-right"
    | "bottom-left";

  if (!widgetId) return;

  // Fetch init token from server
  fetch(INIT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ widgetId }),
  })
    .then((res) => res.json())
    .then((data: { token?: string; error?: string }) => {
      if (!data.token) return;
      const src = buildIframeSrc(widgetId, data.token);
      createWidgetIframe(widgetId, src, position);
    })
    .catch(() => {
      // Silently fail — widget should not break the host page
    });
}

// Run on DOMContentLoaded or immediately if already loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoInit);
} else {
  autoInit();
}
