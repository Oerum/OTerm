import DOMPurify, { type ElementHook } from "isomorphic-dompurify";
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
  const hook: ElementHook = (currentNode) => {
    const tagName = currentNode.tagName.toLowerCase();
    if (tagName === "input") {
      const input = currentNode as HTMLInputElement;
      if (input.getAttribute("type") !== "checkbox") {
        input.setAttribute("type", "checkbox");
      }
      input.setAttribute("disabled", "true");
    } else if (tagName === "a") {
      const anchor = currentNode as HTMLAnchorElement;
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    } else if (currentNode.hasAttribute("rel")) {
      currentNode.removeAttribute("rel");
    }
  };
  DOMPurify.addHook("afterSanitizeAttributes", hook);
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["input"],
  });
  DOMPurify.removeHook("afterSanitizeAttributes");
  return clean;
}
