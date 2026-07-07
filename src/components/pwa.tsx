"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share, X } from "lucide-react";

const DISMISS_KEY = "madagama:pwa-install-dismissed";

// Chrome's beforeinstallprompt isn't in the TS DOM lib.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Registers the service worker and shows an install hint on mobile:
 * - Android/Chromium: captures `beforeinstallprompt` and offers an Install button.
 * - iOS Safari: shows the manual "Share → Add to Home Screen" instruction
 *   (Apple blocks programmatic install prompts).
 * Hidden when already installed (standalone) or previously dismissed. The whole
 * thing is mobile-only — desktop users install from their browser UI.
 */
export function Pwa() {
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIos, setShowIos] = useState(false);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios =
      /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) &&
      !(window as Window & { MSStream?: unknown }).MSStream;

    // Defer the initial setState out of the effect body (project lint forbids
    // synchronous set-state in an effect).
    const t = setTimeout(() => {
      if (!dismissed && !standalone && ios) setShowIos(true);
    }, 0);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      if (!dismissed && !standalone) setShowAndroid(true);
    };
    const onInstalled = () => {
      setShowAndroid(false);
      setShowIos(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShowAndroid(false);
    setShowIos(false);
  }

  async function install() {
    const evt = deferred.current;
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    deferred.current = null;
    setShowAndroid(false);
  }

  if (!showAndroid && !showIos) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(68px+env(safe-area-inset-bottom))] z-40 lg:hidden">
      <div className="flex items-start gap-3 rounded-2xl border border-input-border bg-surface p-3 shadow-lg shadow-black/10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-foreground">Install Madagama</p>
          {showIos ? (
            <p className="mt-0.5 text-[12px] leading-snug text-muted">
              Tap{" "}
              <Share className="inline h-3.5 w-3.5 -translate-y-px" aria-label="the Share button" />{" "}
              then <span className="font-medium text-foreground">Add to Home Screen</span>.
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] leading-snug text-muted">
              Add it to your home screen for quick, app-like access.
            </p>
          )}
          {showAndroid && (
            <button
              onClick={install}
              className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Install
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          className="rounded-lg p-1 text-faint transition-colors hover:bg-border-subtle hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
