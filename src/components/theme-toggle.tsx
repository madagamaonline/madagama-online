"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "madagama:theme";
type ViewTransitionHandle = {
  finished: Promise<void>;
  skipTransition?: () => void;
};

function clearTransitionState() {
  document.documentElement.classList.remove("theme-transitioning");
}

/**
 * Dark-mode toggle. The initial class is applied by the no-flash script in the
 * root layout before paint; this button only flips it and persists the choice.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const desiredDarkRef = useRef(false);
  const transitionRef = useRef<ViewTransitionHandle | null>(null);
  const transitionGeneration = useRef(0);

  useEffect(() => {
    const initialDark = document.documentElement.classList.contains("dark");
    desiredDarkRef.current = initialDark;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(initialDark);
    return () => {
      transitionGeneration.current += 1;
      try { transitionRef.current?.skipTransition?.(); } catch { /* already settled */ }
      transitionRef.current = null;
      clearTransitionState();
    };
  }, []);

  function applyTheme(next: boolean) {
    desiredDarkRef.current = next;
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  function toggle() {
    const next = !desiredDarkRef.current;
    desiredDarkRef.current = next;
    const generation = ++transitionGeneration.current;
    try { transitionRef.current?.skipTransition?.(); } catch { /* already settled */ }
    transitionRef.current = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startViewTransition = (document as Document & {
      startViewTransition?: (callback: () => void) => ViewTransitionHandle;
    }).startViewTransition;
    if (reduced || !startViewTransition) {
      clearTransitionState();
      applyTheme(next);
      return;
    }

    document.documentElement.classList.add("theme-transitioning");
    const cleanUp = (transition: ViewTransitionHandle | null) => {
      if (transitionGeneration.current !== generation) return;
      if (transitionRef.current === transition) transitionRef.current = null;
      clearTransitionState();
    };
    try {
      const transition = startViewTransition.call(document, () => applyTheme(next));
      transitionRef.current = transition;
      // Both fulfillment and rejection are consumed; aborted transitions are expected
      // when the user toggles rapidly.
      void transition.finished.then(
        () => cleanUp(transition),
        () => cleanUp(transition),
      );
    } catch {
      cleanUp(null);
      applyTheme(next);
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="motion-interactive relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-input-border bg-surface text-muted hover:bg-input hover:text-foreground"
    >
      <Sun className={`absolute h-[18px] w-[18px] transition-[opacity,transform] duration-300 ${dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-75 opacity-0"}`} />
      <Moon className={`absolute h-[18px] w-[18px] transition-[opacity,transform] duration-300 ${dark ? "rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100"}`} />
    </button>
  );
}
