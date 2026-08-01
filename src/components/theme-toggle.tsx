"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "madagama:theme";

/**
 * Dark-mode toggle. The initial class is applied by the no-flash script in the
 * root layout before paint; this button only flips it and persists the choice.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* ignore */
    }
    setDark(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="motion-interactive relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-input-border bg-surface text-muted hover:bg-input hover:text-foreground"
    >
      <Sun className={`absolute h-[18px] w-[18px] transition-[opacity,transform] duration-200 ${dark ? "rotate-0 opacity-100" : "-rotate-45 opacity-0"}`} />
      <Moon className={`absolute h-[18px] w-[18px] transition-[opacity,transform] duration-200 ${dark ? "rotate-45 opacity-0" : "rotate-0 opacity-100"}`} />
    </button>
  );
}
