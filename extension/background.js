import { createRescuer } from "./rescuer.js";

const rescuer = createRescuer(browser);

function guard(promise) {
  promise.catch((error) => console.error("No Incognito:", error));
}

browser.windows.onCreated.addListener((win) => {
  if (win.incognito) guard(rescuer.rescueWindow(win.id));
});

// The top-level sweep below already runs when the page loads for either event.
function onStartupOrInstall() {
  guard(rescuer.ensureAccess());
}

browser.runtime.onStartup.addListener(onStartupOrInstall);
browser.runtime.onInstalled.addListener(onStartupOrInstall);

// Also runs each time the event page wakes, and covers enabling the add-on
// mid-session, which fires neither onStartup nor onInstalled.
guard(rescuer.sweep());
