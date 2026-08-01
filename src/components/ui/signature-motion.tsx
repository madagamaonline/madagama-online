"use client";

import { useEffect, useRef, useState } from "react";
import { formatLKR, round2 } from "@/lib/utils";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AnimatedMoney({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const safeValue = Number.isFinite(value) ? round2(value) : 0;
  const displayedValue = useRef(safeValue);
  const frame = useRef<number | null>(null);
  const [displayValue, setDisplayValue] = useState(safeValue);

  useEffect(() => {
    const from = displayedValue.current;
    const to = safeValue;
    if (frame.current !== null) cancelAnimationFrame(frame.current);

    if (prefersReducedMotion() || from === to) {
      displayedValue.current = to;
      setDisplayValue(to);
      return;
    }

    const startedAt = performance.now();
    const duration = 380;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = round2(from + (to - from) * eased);
      displayedValue.current = next;
      setDisplayValue(next);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else frame.current = null;
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [safeValue]);

  return (
    <span className={className}>
      <span aria-hidden="true">{formatLKR(displayValue)}</span>
      <span className="sr-only">{formatLKR(safeValue)}</span>
    </span>
  );
}

export function DrawnSuccessIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      className={`motion-drawn-check shrink-0 ${className}`}
      aria-hidden="true"
      fill="none"
    >
      <circle className="motion-drawn-check-ring" cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="2.2" />
      <path className="motion-drawn-check-mark" d="m8.7 14.2 3.4 3.4 7.4-8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type FlightProduct = { code: string; name: string; shortCode?: number };

/** Fire-and-forget visual feedback; cart state must be updated separately and immediately. */
export function flyProductToCart(
  product: FlightProduct,
  source: HTMLElement | null,
  destination: HTMLElement | null,
) {
  if (!source || !destination) return;
  if (prefersReducedMotion()) {
    destination.animate(
      [{ boxShadow: "0 0 0 0 color-mix(in srgb, var(--color-primary) 35%, transparent)" }, { boxShadow: "0 0 0 7px transparent" }],
      { duration: 180, easing: "ease-out" },
    );
    return;
  }

  const start = source.getBoundingClientRect();
  const end = destination.getBoundingClientRect();
  const chip = document.createElement("div");
  chip.className = "motion-product-flight";
  chip.setAttribute("aria-hidden", "true");
  chip.innerHTML = `<span class="motion-product-flight-icon"></span><span><strong>${escapeHtml(product.shortCode != null ? `#${product.shortCode} · ${product.code}` : product.code)}</strong><small>${escapeHtml(product.name)}</small></span>`;
  chip.style.left = `${start.left + Math.min(28, start.width * 0.08)}px`;
  chip.style.top = `${start.top + start.height / 2}px`;
  document.body.appendChild(chip);

  source.animate(
    [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-3px) scale(1.012)" }, { transform: "translateY(0) scale(1)" }],
    { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" },
  );

  const dx = end.left + Math.min(end.width / 2, 72) - (start.left + Math.min(28, start.width * 0.08));
  const dy = end.top + Math.min(end.height / 2, 48) - (start.top + start.height / 2);
  const arc = Math.min(72, Math.max(28, Math.abs(dx) * 0.12));
  const flight = chip.animate(
    [
      { transform: "translate3d(0, -50%, 0) scale(1)", opacity: 0 },
      { transform: "translate3d(0, -50%, 0) scale(1)", opacity: 1, offset: 0.08 },
      { transform: `translate3d(${dx * 0.48}px, ${dy * 0.42 - arc}px, 0) scale(.9)`, opacity: 1, offset: 0.55 },
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(.58)`, opacity: 0 },
    ],
    { duration: 520, easing: "cubic-bezier(.22,.7,.18,1)", fill: "forwards" },
  );
  flight.finished
    .then(() => {
      destination.classList.remove("motion-cart-arrival");
      void destination.offsetWidth;
      destination.classList.add("motion-cart-arrival");
    })
    .catch(() => undefined)
    .finally(() => chip.remove());
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
