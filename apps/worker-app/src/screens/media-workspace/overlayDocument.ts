/** Static overlay documents never inherit the desktop application's DOM or IPC origin. */
export function buildOverlayDocument(html: string, css = ""): string {
  // 1. Strip HTML comments to prevent information leaks
  const cleanHtml = (html || "").replace(/<!--[\s\S]*?-->/g, "");

  // A template keeps images/resources inert while sanitizing; a parsed HTML document may fetch them.
  const template = document.createElement("template");
  template.innerHTML = cleanHtml;
  const doc = template.content;

  // Case-insensitive query for dangerous elements
  doc.querySelectorAll("script, SCRIPT, iframe, IFRAME, object, OBJECT, embed, EMBED, base, BASE, meta, META, link, LINK, form, FORM").forEach((node) => node.remove());

  doc.querySelectorAll("*").forEach((node) => {
    const attributes = Array.from(node.attributes);
    for (const attribute of attributes) {
      const attrNameLower = attribute.name.toLowerCase();
      const attrValLower = attribute.value.toLowerCase().replace(/\s+/g, "");

      if (/^on/i.test(attribute.name) || attrValLower.includes("javascript:") || attrValLower.includes("data:text/html")) {
        node.removeAttribute(attribute.name);
        continue;
      }

      if (["href", "xlink:href", "action", "formaction", "srcdoc", "srcset", "poster", "target"].includes(attrNameLower)) {
        node.removeAttribute(attribute.name);
        continue;
      }

      if (attrNameLower === "src" && !attribute.value.startsWith("data:image/")) {
        node.removeAttribute(attribute.name);
      }
    }
  });

  // Sanitize CSS to prevent @import or external url(...) network leaks
  const sanitizedCss = (css || "")
    .replace(/@import\s+[^;]+;/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/-moz-binding\s*:[^;]+;/gi, "")
    .replace(/url\(\s*["']?(?!data:image\/|data:font\/)[^"'\)]+["']?\s*\)/gi, "none");

  const style = document.createElement("style");
  style.textContent = sanitizedCss;

  // Escape the raw-text closing tag so CSS cannot escape its element.
  const safeCss = style.innerHTML.replace(/<\/style/gi, "<\\/style");

  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;background:transparent;overflow:hidden}${safeCss}</style></head><body>${template.innerHTML}</body></html>`;
}

