import { planRescue } from "./rescue.js";

const MAX_WAIT_MS = 20_000;
const POLL_MS = 150;
// An active about:blank tab can briefly report "complete" before the real load
// starts, so give it a moment before treating it as a genuinely empty tab.
const SETTLE_MS = 250;

const isBlank = (url) => !url || url === "about:blank";

function isPending(tab, elapsedMs) {
  if (!isBlank(tab.url)) return false;
  return tab.status === "loading" || (tab.active && elapsedMs < SETTLE_MS);
}

export function createRescuer(api) {
  const handling = new Set();
  let createInFlight = null;
  let permanent = false;
  let onboardingShown = false;

  async function openOnboarding(hash = "") {
    await api.tabs.create({ url: api.runtime.getURL(`onboarding.html${hash}`) });
  }

  async function collectTabs(windowId) {
    let wake = null;
    const onChange = () => wake?.();
    api.tabs.onUpdated.addListener(onChange, {
      windowId,
      properties: ["url", "status"],
    });
    const started = Date.now();
    try {
      for (;;) {
        const tabs = await api.tabs.query({ windowId });
        const elapsed = Date.now() - started;
        if (elapsed >= MAX_WAIT_MS || !tabs.some((t) => isPending(t, elapsed))) {
          return tabs;
        }
        await new Promise((resolve) => {
          wake = resolve;
          setTimeout(resolve, POLL_MS);
        });
      }
    } finally {
      api.tabs.onUpdated.removeListener(onChange);
    }
  }

  async function readPermanentFlag() {
    if (permanent) return true;
    const stored = await api.storage.session.get("permanentPB");
    permanent = stored.permanentPB === true;
    return permanent;
  }

  // Must be called with no await between the createInFlight check and this call.
  function startCreate(url) {
    const pending = (async () => {
      try {
        const win = await api.windows.create({
          incognito: false,
          ...(url ? { url } : {}),
        });
        if (win.incognito) {
          permanent = true;
          await api.storage.session.set({ permanentPB: true });
        }
        return win;
      } finally {
        createInFlight = null;
      }
    })();
    createInFlight = pending;
    return pending;
  }

  async function openUrls(windowId, urls) {
    for (const [index, url] of urls.entries()) {
      try {
        await api.tabs.create({ windowId, url, active: index === 0 });
      } catch (error) {
        console.warn("No Incognito: could not reopen", url, error);
      }
    }
  }

  async function rescue(privateWindowId, tabs) {
    const urls = tabs.map((t) => t.url);
    for (;;) {
      while (createInFlight) await createInFlight.catch(() => {});
      if (await readPermanentFlag()) return;

      const windows = await api.windows.getAll();
      // Another rescue may have started a create while we awaited getAll.
      if (createInFlight) continue;

      const normal = windows.filter((w) => w.type === "normal" && !w.incognito);
      const plan = planRescue(urls, normal.length > 0);

      let target;
      if (plan.createWindow) {
        try {
          target = await startCreate(plan.open[0]);
        } catch (error) {
          console.warn("No Incognito: could not create a normal window", error);
          return;
        }
        if (target.incognito) {
          if (!onboardingShown) {
            onboardingShown = true;
            await openOnboarding("#permanent");
          }
          return;
        }
        await openUrls(target.id, plan.open.slice(1));
      } else {
        target = normal.find((w) => w.focused) ?? normal[normal.length - 1];
        await openUrls(target.id, plan.open);
      }

      await api.windows.update(target.id, { focused: true });
      try {
        await api.windows.remove(privateWindowId);
      } catch {
        // The window is already gone.
      }
      return;
    }
  }

  async function rescueWindow(windowId) {
    if (handling.has(windowId)) return;
    handling.add(windowId);
    try {
      const tabs = await collectTabs(windowId);
      await rescue(windowId, tabs);
    } catch (error) {
      console.error("No Incognito: rescue failed", error);
    } finally {
      handling.delete(windowId);
    }
  }

  async function sweep() {
    const windows = await api.windows.getAll({ windowTypes: ["normal"] });
    await Promise.all(windows.filter((w) => w.incognito).map((w) => rescueWindow(w.id)));
  }

  async function ensureAccess() {
    if (await api.extension.isAllowedIncognitoAccess()) return;
    await openOnboarding();
  }

  return { rescueWindow, sweep, ensureAccess };
}
