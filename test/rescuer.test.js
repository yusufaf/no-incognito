import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRescuer } from "../extension/rescuer.js";

const tab = (url, extra = {}) => ({
  url,
  active: true,
  status: "complete",
  ...extra,
});

function makeApi({
  windows = [],
  tabs = {},
  permanentMode = false,
  accessAllowed = true,
  onCreateStart,
} = {}) {
  const state = { windows: structuredClone(windows), tabs: structuredClone(tabs) };
  const store = {};
  const order = [];
  let nextId = 100;
  const api = {
    windows: {
      getAll: vi.fn(async () => structuredClone(state.windows)),
      create: vi.fn(async (options) => {
        order.push("create");
        const win = {
          id: nextId++,
          type: "normal",
          focused: true,
          incognito: permanentMode,
        };
        state.windows.push(win);
        state.tabs[win.id] = [tab(options.url ?? "about:home")];
        onCreateStart?.(win);
        await Promise.resolve();
        return structuredClone(win);
      }),
      update: vi.fn(async (id) => {
        order.push(`update:${id}`);
      }),
      remove: vi.fn(async (id) => {
        order.push(`remove:${id}`);
        state.windows = state.windows.filter((w) => w.id !== id);
      }),
    },
    tabs: {
      query: vi.fn(async ({ windowId }) => structuredClone(state.tabs[windowId] ?? [])),
      create: vi.fn(async (options) => {
        order.push(`tab:${options.url}`);
      }),
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    storage: {
      session: {
        get: vi.fn(async (key) => ({ [key]: store[key] })),
        set: vi.fn(async (values) => Object.assign(store, values)),
      },
    },
    runtime: { getURL: (path) => `moz-extension://test/${path}` },
    extension: { isAllowedIncognitoAccess: vi.fn(async () => accessAllowed) },
  };
  return { api, state, store, order };
}

const privateWin = (id) => ({ id, type: "normal", incognito: true, focused: true });
const normalWin = (id, extra = {}) => ({
  id,
  type: "normal",
  incognito: false,
  focused: false,
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rescueWindow", () => {
  it("creates the normal window before removing the only window", async () => {
    const { api, order } = makeApi({
      windows: [privateWin(1)],
      tabs: { 1: [tab("https://a.example/")] },
    });
    const rescuer = createRescuer(api);

    const done = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(api.windows.create).toHaveBeenCalledWith({
      incognito: false,
      url: "https://a.example/",
    });
    expect(order.indexOf("create")).toBeLessThan(order.indexOf("remove:1"));
    expect(order.at(-1)).toBe("remove:1");
  });

  it("moves URLs into an existing normal window instead of creating one", async () => {
    const { api, order } = makeApi({
      windows: [normalWin(2, { focused: true }), privateWin(1)],
      tabs: { 1: [tab("https://a.example/"), tab("https://b.example/", { active: false })] },
    });
    const rescuer = createRescuer(api);

    const done = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(api.windows.create).not.toHaveBeenCalled();
    expect(api.tabs.create).toHaveBeenCalledWith({
      windowId: 2,
      url: "https://a.example/",
      active: true,
    });
    expect(api.tabs.create).toHaveBeenCalledWith({
      windowId: 2,
      url: "https://b.example/",
      active: false,
    });
    expect(order.at(-1)).toBe("remove:1");
  });

  it("still creates a normal window for an empty private window that is the only window", async () => {
    const { api, order } = makeApi({
      windows: [privateWin(1)],
      tabs: { 1: [tab("about:privatebrowsing")] },
    });
    const rescuer = createRescuer(api);

    const done = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(api.windows.create).toHaveBeenCalledWith({ incognito: false });
    expect(order.indexOf("create")).toBeLessThan(order.indexOf("remove:1"));
  });

  it("handles the same window id once", async () => {
    const { api } = makeApi({
      windows: [normalWin(2), privateWin(1)],
      tabs: { 1: [tab("https://a.example/")] },
    });
    const rescuer = createRescuer(api);

    const first = rescuer.rescueWindow(1);
    const second = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([first, second]);

    expect(api.windows.remove).toHaveBeenCalledTimes(1);
  });

  it("is not held up by Zen's inactive empty about:blank tab", async () => {
    const { api } = makeApi({
      windows: [normalWin(2), privateWin(1)],
      tabs: {
        1: [
          tab("https://a.example/"),
          tab("about:blank", { active: false, status: "complete" }),
        ],
      },
    });
    const rescuer = createRescuer(api);

    const done = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(0);
    await done;

    expect(api.windows.remove).toHaveBeenCalledWith(1);
    expect(api.tabs.create).toHaveBeenCalledTimes(1);
  });

  it("waits for a slow URL to commit instead of dropping it", async () => {
    const { api, state } = makeApi({
      windows: [normalWin(2), privateWin(1)],
      tabs: { 1: [tab("about:blank", { status: "loading" })] },
    });
    const rescuer = createRescuer(api);

    const done = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(8000);
    expect(api.windows.remove).not.toHaveBeenCalled();

    state.tabs[1] = [tab("https://slow.example/")];
    await vi.advanceTimersByTimeAsync(500);
    await done;

    expect(api.tabs.create).toHaveBeenCalledWith({
      windowId: 2,
      url: "https://slow.example/",
      active: true,
    });
    expect(api.windows.remove).toHaveBeenCalledWith(1);
  });

  it("gives up after the cap and still closes the window", async () => {
    const { api } = makeApi({
      windows: [normalWin(2), privateWin(1)],
      tabs: { 1: [tab("about:blank", { status: "loading" })] },
    });
    const rescuer = createRescuer(api);

    const done = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(21_000);
    await done;

    expect(api.tabs.create).not.toHaveBeenCalled();
    expect(api.windows.remove).toHaveBeenCalledWith(1);
  });

  it("removes the update listener when done", async () => {
    const { api } = makeApi({
      windows: [normalWin(2), privateWin(1)],
      tabs: { 1: [tab("https://a.example/")] },
    });
    const rescuer = createRescuer(api);

    const done = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    const [added] = api.tabs.onUpdated.addListener.mock.calls[0];
    expect(api.tabs.onUpdated.removeListener).toHaveBeenCalledWith(added);
  });
});

describe("reopening", () => {
  it("only activates the first URL when it creates the new window", async () => {
    const { api } = makeApi({
      windows: [privateWin(1)],
      tabs: {
        1: [
          tab("https://a.example/"),
          tab("https://b.example/", { active: false }),
          tab("https://c.example/", { active: false }),
        ],
      },
    });
    const rescuer = createRescuer(api);

    const done = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(api.windows.create).toHaveBeenCalledWith({
      incognito: false,
      url: "https://a.example/",
    });
    const opened = api.tabs.create.mock.calls.map(([options]) => options);
    expect(opened).toEqual([
      { windowId: 100, url: "https://b.example/", active: false },
      { windowId: 100, url: "https://c.example/", active: false },
    ]);
  });

  it("keeps the private window open when a URL could not be reopened", async () => {
    const { api } = makeApi({
      windows: [normalWin(2, { focused: true }), privateWin(1)],
      tabs: { 1: [tab("https://a.example/"), tab("https://b.example/", { active: false })] },
    });
    api.tabs.create.mockRejectedValueOnce(new Error("Illegal URL"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const rescuer = createRescuer(api);

    const done = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(api.windows.remove).not.toHaveBeenCalled();
  });
});

describe("sweep", () => {
  it("also rescues private popup windows", async () => {
    const { api } = makeApi({
      windows: [normalWin(2, { focused: true }), { ...privateWin(1), type: "popup" }],
      tabs: { 1: [tab("https://a.example/")] },
    });
    const rescuer = createRescuer(api);

    const done = rescuer.sweep();
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(api.windows.remove).toHaveBeenCalledWith(1);
  });

  it("rescues existing private windows and leaves normal ones alone", async () => {
    const { api } = makeApi({
      windows: [normalWin(2, { focused: true }), privateWin(1)],
      tabs: { 1: [tab("https://a.example/")], 2: [tab("https://keep.example/")] },
    });
    const rescuer = createRescuer(api);

    const done = rescuer.sweep();
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(api.windows.remove).toHaveBeenCalledTimes(1);
    expect(api.windows.remove).toHaveBeenCalledWith(1);
  });

  it("creates exactly one normal window for two private windows and no normal one", async () => {
    const { api } = makeApi({
      windows: [privateWin(1), privateWin(3)],
      tabs: { 1: [tab("https://a.example/")], 3: [tab("https://b.example/")] },
    });
    const rescuer = createRescuer(api);

    const done = rescuer.sweep();
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(api.windows.create).toHaveBeenCalledTimes(1);
    expect(api.windows.remove).toHaveBeenCalledWith(1);
    expect(api.windows.remove).toHaveBeenCalledWith(3);
  });
});

describe("permanent private browsing", () => {
  it("stops after one create, keeps the windows, and shows onboarding once", async () => {
    let rescuer;
    const { api, store } = makeApi({
      windows: [privateWin(1)],
      tabs: { 1: [tab("https://a.example/")] },
      permanentMode: true,
      // onCreated for the window we just made fires before create() resolves.
      onCreateStart: (win) => void rescuer.rescueWindow(win.id),
    });
    rescuer = createRescuer(api);

    const done = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(2000);
    await done;

    expect(api.windows.create).toHaveBeenCalledTimes(1);
    expect(api.windows.remove).not.toHaveBeenCalled();
    expect(store.permanentPB).toBe(true);
    expect(api.tabs.create).toHaveBeenCalledTimes(1);
    expect(api.tabs.create).toHaveBeenCalledWith({
      url: "moz-extension://test/onboarding.html#permanent",
    });
  });

  it("does nothing when the stored flag is already set", async () => {
    const { api, store } = makeApi({
      windows: [privateWin(1)],
      tabs: { 1: [tab("https://a.example/")] },
    });
    store.permanentPB = true;
    const rescuer = createRescuer(api);

    const done = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(api.windows.create).not.toHaveBeenCalled();
    expect(api.windows.remove).not.toHaveBeenCalled();
  });

  it("leaves the flag alone and skips the rescue when create throws", async () => {
    const { api, store } = makeApi({
      windows: [privateWin(1)],
      tabs: { 1: [tab("https://a.example/")] },
    });
    api.windows.create.mockRejectedValueOnce(new Error("boom"));
    const rescuer = createRescuer(api);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const done = rescuer.rescueWindow(1);
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(store.permanentPB).toBeUndefined();
    expect(api.windows.remove).not.toHaveBeenCalled();
  });
});

describe("ensureAccess", () => {
  it("opens onboarding when private window access is missing", async () => {
    const { api } = makeApi({ accessAllowed: false });
    await createRescuer(api).ensureAccess();
    expect(api.tabs.create).toHaveBeenCalledWith({
      url: "moz-extension://test/onboarding.html",
    });
  });

  it("stays quiet when access is granted", async () => {
    const { api } = makeApi({ accessAllowed: true });
    await createRescuer(api).ensureAccess();
    expect(api.tabs.create).not.toHaveBeenCalled();
  });
});
