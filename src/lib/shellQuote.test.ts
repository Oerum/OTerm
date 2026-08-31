import { describe, expect, it } from "vitest";
import { shellQuote, quoteForShell } from "./shellQuote";

describe("shellQuote", () => {
  it("leaves safe alphanumeric strings, dots, dashes, and underscores unquoted", () => {
    expect(shellQuote("my-container_123.v1")).toBe("my-container_123.v1");
    expect(shellQuote("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("quotes strings containing spaces", () => {
    expect(shellQuote("my container")).toBe("'my container'");
  });

  it("quotes strings containing shell metacharacters safely", () => {
    expect(shellQuote("foo; rm -rf /")).toBe("'foo; rm -rf /'");
    expect(shellQuote("$(whoami)")).toBe("'$(whoami)'");
    expect(shellQuote("`id`")).toBe("'`id`'");
    expect(shellQuote("foo && bar")).toBe("'foo && bar'");
    expect(shellQuote("foo | bar")).toBe("'foo | bar'");
    expect(shellQuote("foo > bar")).toBe("'foo > bar'");
    expect(shellQuote("$VAR")).toBe("'$VAR'");
  });

  it("escapes single quotes within the string", () => {
    expect(shellQuote("it's a container")).toBe("'it'\\''s a container'");
    expect(shellQuote("'''")).toBe("''\\'''\\'''\\'''");
  });

  it("safely quotes empty strings", () => {
    expect(shellQuote("")).toBe("''");
  });

  it("quotes strings with double quotes without escaping them inside single quotes", () => {
    expect(shellQuote('container "name"')).toBe("'container \"name\"'");
  });
});

describe("quoteForShell", () => {
  describe("cmd.exe", () => {
    it("wraps in double quotes and strips internal double quotes", () => {
      expect(quoteForShell("my container", "cmd")).toBe('"my container"');
      expect(quoteForShell('foo" && calc.exe && "', "cmd")).toBe('"foo && calc.exe && "');
      expect(quoteForShell("safe_name", "cmd")).toBe('"safe_name"');
      expect(quoteForShell("", "cmd")).toBe('""');
    });
  });

  describe("PowerShell", () => {
    it("wraps in single quotes and doubles internal single quotes", () => {
      expect(quoteForShell("my container", "pwsh")).toBe("'my container'");
      expect(quoteForShell("it's a test", "pwsh")).toBe("'it''s a test'");
      expect(quoteForShell("my container", "powershell")).toBe("'my container'");
      expect(quoteForShell("it's a test", "powershell")).toBe("'it''s a test'");
      expect(quoteForShell("$env:PATH; rm -rf", "pwsh")).toBe("'$env:PATH; rm -rf'");
      expect(quoteForShell("", "pwsh")).toBe("''");
    });
  });

  describe("POSIX shells and default fallback", () => {
    it("delegates to shellQuote for bash, zsh, and undefined", () => {
      expect(quoteForShell("simple", "bash")).toBe("simple");
      expect(quoteForShell("simple")).toBe("simple");
      expect(quoteForShell("with space", "bash")).toBe("'with space'");
      expect(quoteForShell("it's", "zsh")).toBe("'it'\\''s'");
      expect(quoteForShell("")).toBe("''");
    });
  });
});
