import DOMPurify, { type UponSanitizeElementHook } from "isomorphic-dompurify";
import { marked } from "marked";

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    link({ href, title, text }) {
      const safeHref = (href ?? "").replace(/"/g, "&quot;");
      const titleAttr = title ? ` title="${title.replace(/"/g, "&quot;")}"` : "";
      return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

export function renderMarkdown(source: string): string {
  const trimmed = source.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";
  const raw = marked.parse(trimmed, { async: false }) as string;
  const hook: UponSanitizeElementHook = (currentNode) => {
    const tagName =
      "tagName" in currentNode && typeof currentNode.tagName === "string"
        ? currentNode.tagName.toLowerCase()
        : "";
    if (tagName !== "input") {
      return;
    }
    const input = currentNode as HTMLInputElement;
    if (input.getAttribute("type") !== "checkbox") {
      input.setAttribute("type", "checkbox");
    }
    input.setAttribute("disabled", "true");
  };
  DOMPurify.addHook("uponSanitizeElement", hook);
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["input"],
    ADD_ATTR: ["target", "rel", "disabled", "checked", "type"],
  });
  DOMPurify.removeHook("uponSanitizeElement");
  return clean;
}
