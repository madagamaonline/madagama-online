"use client";

import { useEffect } from "react";

/**
 * A focused number input acts as a spinner, so scrolling the page silently
 * edits the value someone just typed. Blur it on wheel so the page scrolls
 * instead.
 *
 * This lives on the document rather than on the shared Input, because an
 * onWheel handler there makes Input impossible to render from a server
 * component. One capture-phase listener covers every number field on the page.
 */
export function NumberInputWheelGuard() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement &&
        active.type === "number" &&
        e.target instanceof Node &&
        active.contains(e.target)
      ) {
        active.blur();
      }
    };
    // Capture, so focus is dropped before the input applies its own default.
    document.addEventListener("wheel", onWheel, { passive: true, capture: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  return null;
}
