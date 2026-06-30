/**
 * Highlights the first case-insensitive occurrence of `query` within `text`.
 * Server-safe (pure render). Used to confirm search matches at a glance.
 */
export function Highlight({ text, query }: { text: string; query?: string }) {
  const q = (query ?? "").trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-[3px] bg-clay-soft px-0.5 text-clay-ink">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
