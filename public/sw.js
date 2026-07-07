// Minimal service worker for Madagama PWA.
//
// It deliberately does NOT cache responses: this is a POS/back-office app that
// must always show live data (stock, credit balances, payments). Its only job
// is to exist with a fetch handler so browsers treat the app as installable and
// fire the install prompt. Requests pass straight through to the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // Pass-through: no response is provided, so the browser handles the request
  // normally (network). No offline caching by design.
});
