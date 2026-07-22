export default function LolcReceiptLoading() {
  return <div className="mx-auto max-w-7xl animate-pulse space-y-5" aria-label="Loading LOLC receipts">
    <div className="h-8 w-52 rounded-lg bg-border-subtle" />
    <div className="h-12 rounded-xl bg-border-subtle" />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-xl bg-border-subtle" />)}</div>
    <div className="h-80 rounded-xl bg-border-subtle" />
  </div>;
}
