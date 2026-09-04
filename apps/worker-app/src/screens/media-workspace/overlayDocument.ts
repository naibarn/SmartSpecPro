/** Static overlay documents never inherit the desktop application's DOM or IPC origin. */
export function buildOverlayDocument(html: string, css = ""): string {
  // A template keeps images/resources inert while sanitizing; a parsed HTML document may fetch them.
  const template = document.createElement("template");
  template.innerHTML = html;
  const doc = template.content;
  doc.querySelectorAll("script,iframe,object,embed,base,meta,link,form").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (/^on/i.test(attribute.name) || ["href", "xlink:href", "action", "formaction", "srcdoc", "srcset", "poster"].includes(attribute.name.toLowerCase()) || (attribute.name.toLowerCase() === "src" && !attribute.value.startsWith("data:image/"))) node.removeAttribute(attribute.name);
    }
  });
  const style = document.createElement("style");
  style.textContent = css;
  // Escape the raw-text closing tag so CSS cannot escape its element.
  const safeCss = style.innerHTML.replace(/<\/style/gi, "<\\/style");
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;background:transparent}${safeCss}</style></head><body>${template.innerHTML}</body></html>`;
}
