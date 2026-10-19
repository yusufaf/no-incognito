# No Incognito

Turns off private browsing in Firefox and [Zen Browser](https://zen-browser.app). It has two parts that work together:

- **The extension** closes any private window the moment it opens and reopens its links in a normal window. It covers the cases menus can't: `Ctrl+Shift+P`, the taskbar jump list, `-private-window` on the command line, and windows that were already open when the browser started.
- **The Zen mod** (also usable in Firefox as a `userChrome.css`) hides the "open in private window" menu entries so you rarely trigger the extension at all.

It is built for self-control, not for locking down someone else's browser. Anyone with access to `about:addons` can switch it off. For managed machines use Firefox's [`DisablePrivateBrowsing` policy](https://mozilla.github.io/policy-templates/#disableprivatebrowsing) instead; it applies to the whole install and can't be set per profile.

## How the extension behaves

When a private window appears it waits for the window's real URL (up to 20 seconds, for slow pages), then:

1. makes sure a normal window exists, creating one first if not, because closing the last window quits the browser;
2. opens the private window's URLs there (only `http` and `https` pages are reopened; anything else, such as `about:` or `file:` pages, is not, and is lost when the private window closes);
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

What CSS cannot do: block the `Ctrl+Shift+P` shortcut, the Windows jump list entry (disable it with `browser.taskbar.lists.tasks.enabled = false` if you like), or the `-private-window` command-line flag. The extension handles all of those, and so does the mod's script when it's installed through [Sine](https://github.com/CosmoCreeper/Sine). Neither can undo the `-private` flag, which makes every window private for that session, so there is no normal window to move tabs to.

### With Sine: the mod's script

Installed through Sine, the mod also runs `zen-mod/no-incognito.uc.js`, which does the extension's job from inside the browser:

- `Ctrl+Shift+P`, the menu entries and Zen's URL-bar "Open private window" action do nothing, because they all go through `OpenBrowserWindow({ private: true })`, which the script blocks. No window opens, not even for a moment.
- A private window that opens some other way (the jump list, `-private-window`, "Open Link in New Private Window") gets the same treatment as with the extension: its `http` and `https` tabs move to a normal window and the private window closes.

So with Sine you don't need the extension, which is useful on Zen since release builds only install signed add-ons. If the extension is installed and allowed to run in private windows, the script leaves private windows to it, so tabs aren't reopened twice. Like the extension, it does nothing when the browser is set to always use private browsing.

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

Zen 1.23.3b (Firefox 158) with Sine 2.3.0.3. The Zen mod hides elements by their IDs from Firefox 158 and may need updating when Zen or Firefox renames them.

## License

MIT
