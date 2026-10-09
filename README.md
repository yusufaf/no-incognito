# No Incognito

Turns off private browsing in Firefox and [Zen Browser](https://zen-browser.app). It has two parts that work together:

- **The extension** closes any private window the moment it opens and reopens its links in a normal window. It covers the cases menus can't: `Ctrl+Shift+P`, the taskbar jump list, `-private-window` on the command line, and windows that were already open when the browser started.
- **The Zen mod** (also usable in Firefox as a `userChrome.css`) hides the "open in private window" menu entries so you rarely trigger the extension at all.

It is built for self-control, not for locking down someone else's browser. Anyone with access to `about:addons` can switch it off. For managed machines use Firefox's [`DisablePrivateBrowsing` policy](https://mozilla.github.io/policy-templates/#disableprivatebrowsing) instead; it applies to the whole install and can't be set per profile.

## How the extension behaves

When a private window appears it waits for the window's real URL (up to 20 seconds, for slow pages), then:

1. makes sure a normal window exists, creating one first if not, because closing the last window quits the browser;
2. opens the private window's URLs there (only `http`, `https` and `ftp`);
3. closes the private window.

You will see the private window for a moment: Firefox gives extensions no way to stop a window from opening, only to react to it.

If Firefox is set to always use private browsing (`browser.privatebrowsing.autostart`) there is no normal window to move to. The extension detects this, stops, and opens a page explaining it, rather than closing windows in a loop.

## Install the extension

1. Install it from addons.mozilla.org (listing pending) or load `extension/` from this repo via `about:debugging`.
2. Open `about:addons`, choose No Incognito, and set **Run in Private Windows** to **Allow**. Firefox cannot let an extension see private windows without this, and the extension opens a setup page if it's missing.

Permissions: `tabs` (to read the URLs of the private window's tabs) and `storage` (to remember the always-private case for the session). It collects no data.

## Install the Zen mod

Zen Mods are CSS plus a `preferences.json`. Until the mod is in the Zen Mods registry, install it from `zen-mod/`; see [zen-mod/readme.md](zen-mod/readme.md). Every entry is hidden by default, and each group has a `show-*` checkbox to bring it back.

In Firefox, copy `zen-mod/chrome.css` to `<profile>/chrome/userChrome.css` and set `toolkit.legacyUserProfileCustomizations.stylesheets` to `true`.

What CSS cannot do: block the `Ctrl+Shift+P` shortcut, the Windows jump list entry (disable it with `browser.taskbar.lists.tasks.enabled = false` if you like), or the `-private` and `-private-window` command-line flags. The extension handles all of those.

## Development

```
pnpm install
pnpm test     # vitest
pnpm lint     # web-ext lint
pnpm start    # run in a temporary Firefox profile
pnpm build    # zip into dist/
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org); releases are cut by release-please.

## Tested against

Zen 1.23.1b (Firefox 157). The Zen mod hides elements by their IDs from Firefox 157 and may need updating when Zen or Firefox renames them.

## License

MIT
