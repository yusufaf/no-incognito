# No Incognito

Hides every "open in private window" entry in Zen Browser: the File and app menus, the link context menu, bookmark, history and sidebar menus, and synced tabs.

Each group has a checkbox in the mod's settings (all off, meaning hidden). Tick one to show that group again.

CSS alone cannot block `Ctrl+Shift+P` or the taskbar jump list. Installed through [Sine](https://github.com/CosmoCreeper/Sine), the mod also runs a script that does: the shortcut, the menus and the URL-bar "Open private window" action stop opening private windows, and any private window that still opens has its tabs moved to a normal window. Without Sine, pair the mod with the [No Incognito extension](https://github.com/yusufaf/no-incognito), which closes any private window that does open and moves its links to a normal window.

## Install with Sine

1. In Sine's settings, install a mod from a GitHub repo and enter `yusufaf/no-incognito/tree/main/zen-mod`.
2. For the script to run, Sine's "allow unsafe JS" setting (`sine.allow-unsafe-js` in `about:config`) must be on, because the mod isn't in the Sine store yet. That setting lets every mod you've installed from a repo run code with full access to the browser, so only turn it on if you trust those mods. Without it you still get the CSS.
3. Restart Zen so the script loads into every window.

Tested with Zen 1.23.3b and Sine 2.3.0.3.
