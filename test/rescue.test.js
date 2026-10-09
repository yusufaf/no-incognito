import { describe, expect, it } from "vitest";
import { isRescuableUrl, planRescue } from "../extension/rescue.js";

describe("isRescuableUrl", () => {
  it.each([
    "https://example.com/",
    "http://example.com/path?q=1#frag",
  ])("accepts %s", (url) => {
    expect(isRescuableUrl(url)).toBe(true);
  });

  it.each([
    "ftp://files.example.com/a.txt",
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

describe("planRescue", () => {
  it("keeps rescuable URLs in order and filters the rest", () => {
    expect(
      planRescue(
        ["https://a.example/", "about:privatebrowsing", "https://b.example/", "file:///x"],
        true,
      ),
    ).toEqual({ open: ["https://a.example/", "https://b.example/"], createWindow: false });
  });

  it("opens in the existing normal window when there is one", () => {
    expect(planRescue(["https://a.example/"], true)).toEqual({
      open: ["https://a.example/"],
      createWindow: false,
    });
  });

  it("asks for a new window when none exists and there are URLs", () => {
    expect(planRescue(["https://a.example/"], false)).toEqual({
      open: ["https://a.example/"],
      createWindow: true,
    });
  });

  it("with only blank/about tabs and a normal window, opens nothing", () => {
    expect(planRescue(["about:blank", "about:privatebrowsing"], true)).toEqual({
      open: [],
      createWindow: false,
    });
  });

  it("with only blank/about tabs and no normal window, still asks for a window", () => {
    expect(planRescue(["about:privatebrowsing"], false)).toEqual({
      open: [],
      createWindow: true,
    });
  });

  it("handles an empty tab list", () => {
    expect(planRescue([], false)).toEqual({ open: [], createWindow: true });
    expect(planRescue([], true)).toEqual({ open: [], createWindow: false });
  });
});
