import { describe, expect, it } from "vitest";
import { isRescuableUrl } from "../extension/rescue.js";

describe("isRescuableUrl", () => {
  it.each([
    "https://example.com/",
    "http://example.com/path?q=1#frag",
    "ftp://files.example.com/a.txt",
  ])("accepts %s", (url) => {
    expect(isRescuableUrl(url)).toBe(true);
  });

  it.each([
    "about:privatebrowsing",
    "about:blank",
    "about:newtab",
    "about:config",
    "file:///C:/secret.txt",
    "moz-extension://abc/page.html",
    "data:text/html,hi",
    "view-source:https://example.com/",
    "javascript:alert(1)",
    "",
    "not a url",
    undefined,
  ])("rejects %s", (url) => {
    expect(isRescuableUrl(url)).toBe(false);
  });
});
