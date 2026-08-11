"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Debounced remote search for every type-ahead picker in the app.
 *
 * Replaces the hand-rolled `useEffect` + `setTimeout` + `fetch` blocks that
 * each picker used to carry, and fixes two bugs they all shared:
 *
 *   - The debounce cleared the *timer*, never the in-flight request, so a slow
 *     response for "bra" could land after "brake" and overwrite good results.
 *     Requests are now aborted, and a generation counter drops any reply that
 *     arrives out of order anyway.
 *   - `catch { setHits([]) }` rendered a network failure as "no results found".
 *     Failures now surface as `status: "error"` so the caller can say so.
 */

export type RemoteSearchStatus = "idle" | "loading" | "ready" | "error";

export type UseRemoteSearchOptions<T> = {
  /** Builds the request URL for an already-trimmed query. */
  url: (query: string) => string;
  /** Pulls the result array out of the parsed JSON response. */
  select: (data: unknown) => T[];
  /** Shortest query worth a round trip. */
  minLength?: number;
  /** Debounce window in ms. */
  delay?: number;
  /** Pause searching without unmounting (e.g. while the menu is closed). */
  enabled?: boolean;
};

export type RemoteSearch<T> = {
  query: string;
  setQuery: (query: string) => void;
  results: T[];
  status: RemoteSearchStatus;
  isLoading: boolean;
  /** True once a search has run and come back with nothing. */
  isEmpty: boolean;
  error: string | null;
  /** Clears the query and results, and abandons any in-flight request. */
  reset: () => void;
};

export function useRemoteSearch<T>({
  url,
  select,
  minLength = 1,
  delay = 200,
  enabled = true,
}: UseRemoteSearchOptions<T>): RemoteSearch<T> {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [status, setStatus] = useState<RemoteSearchStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  // Kept in refs so changing an inline `url`/`select` arrow on every render
  // doesn't retrigger the search effect.
  const urlRef = useRef(url);
  const selectRef = useRef(select);
  // Declared before the search effect so the refs are current by the time it runs.
  useEffect(() => {
    urlRef.current = url;
    selectRef.current = select;
  });

  const reset = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setQuery("");
    setResults([]);
    setStatus("idle");
    setError(null);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const shouldSearch = enabled && trimmed.length >= minLength;

    // State changes live inside the timer, never the effect body, so this
    // satisfies the set-state-in-effect rule the rest of the app follows.
    const timer = setTimeout(async () => {
      const generation = ++generationRef.current;
      abortRef.current?.abort();

      if (!shouldSearch) {
        abortRef.current = null;
        setResults([]);
        setStatus("idle");
        setError(null);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("loading");
      setError(null);

      try {
        const res = await fetch(urlRef.current(trimmed), { signal: controller.signal });
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const data: unknown = await res.json();
        // A newer keystroke already started; its answer is the correct one.
        if (generation !== generationRef.current) return;
        setResults(selectRef.current(data));
        setStatus("ready");
      } catch (err) {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        setResults([]);
        setError(err instanceof Error ? err.message : "Search failed");
        setStatus("error");
      }
    }, shouldSearch ? delay : 0);

    return () => clearTimeout(timer);
  }, [query, enabled, minLength, delay]);

  // Drop any request still in flight when the picker unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    query,
    setQuery,
    results,
    status,
    isLoading: status === "loading",
    isEmpty: status === "ready" && results.length === 0,
    error,
    reset,
  };
}
