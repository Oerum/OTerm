import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("returns empty string for blank input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   ")).toBe("");
  });

  it("renders basic markdown", () => {
    const html = renderMarkdown("**bold** and `code`");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("strips script tags", () => {
    const html = renderMarkdown('<script>alert("x")</script>Hello');
    expect(html).not.toContain("<script");
    expect(html).toContain("Hello");
  });

  it("renders bullet lists", () => {
    const html = renderMarkdown("* Test1\n* Test2");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Test1</li>");
    expect(html).toContain("<li>Test2</li>");
  });

  it("opens links in a new tab", () => {
    const html = renderMarkdown("[GitHub](https://github.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("escapes double quotes in link href to prevent attribute injection", () => {
    const html = renderMarkdown('[click](<https://example.com?q="test">)');
    expect(html).not.toContain('href="https://example.com?q="test""');
    expect(html).toContain('&quot;');
  });

  it("preserves GFM task list checkboxes", () => {
    const html = renderMarkdown("- [x] Done\n- [ ] Todo");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  it("strips target and rel attributes from non-anchor elements", () => {
    const html = renderMarkdown('<div target="_blank" rel="noopener">test</div>');
    expect(html).toContain("<div>test</div>");
    expect(html).not.toContain("target=");
    expect(html).not.toContain("rel=");
  });

  it("neutralizes non-checkbox input elements", () => {
    const html = renderMarkdown('<input type="text" value="secret">');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('disabled="true"');
  });
});

