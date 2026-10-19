// ==UserScript==
// @name           No Incognito
// @description    Stops private windows from opening, and moves the tabs of any private window that does open into a normal window.
// ==/UserScript==

(() => {
  const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  );
  const { BrowserWindowTracker } = ChromeUtils.importESModule(
    "resource:///modules/BrowserWindowTracker.sys.mjs",
  );

  const EXTENSION_ID = "no-incognito@yusufaf.dev";
  const MAX_WAIT_MS = 20_000;
  const POLL_MS = 150;
  // An active about:blank tab can briefly look idle before the real load
  // starts, so give it a moment before treating it as a genuinely empty tab.
  const SETTLE_MS = 250;
  const RESCUABLE_PROTOCOLS = new Set(["http:", "https:"]);
  // Each private window runs its own rescue. This lets rescues that start
  // while no normal window exists share the one window the first of them opens.
  const OPENING_WINDOW = Symbol.for("no-incognito.opening-window");

  // Sine loads the script again into open windows when the mod is reinstalled.
  if (window.noIncognitoLoaded) return;
  window.noIncognitoLoaded = true;

  // With permanent private browsing every window is private, so there is no
  // normal window to send anything to.
  if (PrivateBrowsingUtils.permanentPrivateBrowsing) return;

  // Ctrl+Shift+P, the File and app menu entries and Zen's URL-bar "Open private
  // window" action all go through the Tools:PrivateBrowsing command, which calls
  // OpenBrowserWindow({ private: true }). Zen rebuilds its <key> elements from
  // its own shortcut settings, so removing key_privatebrowsing would not stick.
  function blockPrivateOpen() {
    const original = window.OpenBrowserWindow;
    // The only caller that uses the returned window (duplicateTabIn) passes
    // private: true only for a tab that is already in a private window.
    window.OpenBrowserWindow = function (options) {
      if (options?.private) return null;
      return original.call(this, options);
    };
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function isRescuable(url) {
    try {
      return RESCUABLE_PROTOCOLS.has(new URL(url).protocol);
    } catch {
      return false;
    }
  }

  function isPending(tab, elapsedMs) {
    const browser = tab.linkedBrowser;
    const spec = browser.currentURI?.spec;
    if (spec && spec !== "about:blank") return false;
    return browser.webProgress?.isLoadingDocument || (tab.selected && elapsedMs < SETTLE_MS);
  }

  // A window opened with -private-window <url> starts on about:blank, so wait
  // until its tabs have committed their real URLs.
  async function collectTabs() {
    await window.delayedStartupPromise;
    const started = Date.now();
    for (;;) {
      const elapsed = Date.now() - started;
      if (elapsed >= MAX_WAIT_MS || !gBrowser.tabs.some((t) => isPending(t, elapsed))) {
        return gBrowser.tabs.map((tab) => ({
          tab,
          url: tab.linkedBrowser.currentURI?.spec,
          pending: isPending(tab, elapsed),
        }));
      }
      await sleep(POLL_MS);
    }
  }

  async function openNormalWindow() {
    const win = OpenBrowserWindow({ private: false });
    await new Promise((resolve) => win.addEventListener("load", resolve, { once: true }));
    await win.delayedStartupPromise;
    return win;
  }

  async function findOrOpenNormalWindow() {
    const opening = BrowserWindowTracker[OPENING_WINDOW];
    if (opening) return { win: await opening, created: false };
    const existing = BrowserWindowTracker.getTopWindow({ private: false });
    if (existing) return { win: existing, created: false };
    const pending = openNormalWindow();
    BrowserWindowTracker[OPENING_WINDOW] = pending;
    try {
      return { win: await pending, created: true };
    } finally {
      delete BrowserWindowTracker[OPENING_WINDOW];
    }
  }

  async function rescue() {
    const tabs = await collectTabs();
    // The extension does the same rescue; running both would open every tab
    // twice. It only sees private windows if it is allowed to run in them.
    // Checked after the wait, since at startup it may not be running yet.
    if (WebExtensionPolicy.getByID(EXTENSION_ID)?.privateBrowsingAllowed) return;
    const { win: target, created } = await findOrOpenNormalWindow();
    // A new window starts with a home page tab, which a rescued tab replaces.
    const placeholder = created ? target.gBrowser.selectedTab : null;

    let failed = 0;
    const copied = [];
    for (const { tab, url, pending } of tabs) {
      // Still loading after MAX_WAIT_MS, so its real URL is unknown.
      if (pending) {
        failed += 1;
        continue;
      }
      if (!isRescuable(url)) continue;
      let reopened;
      try {
        reopened = target.gBrowser.addTrustedTab(url);
      } catch (error) {
        failed += 1;
        console.warn("No Incognito: could not reopen", url, error);
        continue;
      }
      copied.push(tab);
      if (copied.length === 1) {
        try {
          target.gBrowser.selectedTab = reopened;
        } catch {
          // Selecting is cosmetic; the tab is already reopened.
        }
      }
    }

    // Zen keeps a hidden empty tab in every window for its new-tab UI.
    if (placeholder && copied.length > 0 && !placeholder.hasAttribute("zen-empty-tab")) {
      target.gBrowser.removeTab(placeholder);
    }
    target.focus();
    if (failed > 0) {
      // Losing a tab is worse than leaving the private window open.
      for (const tab of copied) gBrowser.removeTab(tab);
      return;
    }
    window.close();
  }

  blockPrivateOpen();
  if (PrivateBrowsingUtils.isWindowPrivate(window)) {
    rescue().catch((error) => console.error("No Incognito: rescue failed", error));
  }
})();
