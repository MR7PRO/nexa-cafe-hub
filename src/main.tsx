import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Guard: prevent SW registration in iframe/preview contexts
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
} else {
  // Register SW asynchronously to avoid render-blocking
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  }).catch(() => {});
}

// Recover from stale lazy chunks after a new deploy: reload once.
const RELOAD_KEY = "chunk-reload-at";
const recoverFromStaleChunk = () => {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last > 10000) {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    window.location.reload();
  }
};
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  recoverFromStaleChunk();
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String((e.reason as Error)?.message || e.reason || "");
  if (/dynamically imported module|Importing a module script failed/i.test(msg)) {
    e.preventDefault();
    recoverFromStaleChunk();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
