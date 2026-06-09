import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    link({ href, title, text }) {
      const safeHref = href ?? "";
      const titleAttr = title ? ` title="${title.replace(/"/g, "&quot;")}"` : "";
      return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

export function renderMarkdown(source: string): string {
  const trimmed = source.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";
  const raw = marked.parse(trimmed, { async: false }) as string;
  const hook = (node: Element) => {
    if (node.tagName?.toLowerCase() !== "input") {
      return;
    }
    const input = node as HTMLInputElement;
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
