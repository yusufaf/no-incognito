import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name) =>
  readFileSync(new URL(`../zen-mod/${name}`, import.meta.url), "utf8");

const prefs = JSON.parse(read("preferences.json"));
const css = read("chrome.css");

const cssPrefs = new Set(
  [...css.matchAll(/-moz-pref\("([^"]+)"\)/g)].map((m) => m[1]),
);

describe("zen-mod", () => {
  it("declares only checkbox prefs that default to hidden", () => {
    for (const pref of prefs) {
      expect(pref.type).toBe("checkbox");
      expect(pref.defaultValue).toBe(false);
      expect(pref.property).toMatch(/^no-incognito\.show-[a-z-]+$/);
    }
  });

  it("uses every declared pref in chrome.css and nothing else", () => {
    expect(cssPrefs).toEqual(new Set(prefs.map((p) => p.property)));
  });

  it("gates every rule on a pref and puts one selector in each rule", () => {
    const rules = [...css.matchAll(/@media not \(-moz-pref\("[^"]+"\)\) \{\s*([^{]+)\{/g)];
    const bareRules = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/^[^@\s}][^{]*\{/gm) ?? [];
    expect(bareRules).toEqual([]);
    for (const [, selector] of rules) {
      expect(selector).not.toContain(",");
    }
    expect(rules.length).toBeGreaterThan(0);
  });
});
