"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";

export type FilterCategory = {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
};

/**
 * Dropdown that narrows the products list to one category or subcategory.
 * The option value encodes which param to set ("cat:<id>" or "sub:<id>") so a
 * category and its subcategories can share a single control.
 */
export function ProductCategoryFilter({
  categories,
  current,
}: {
  categories: FilterCategory[];
  /** Current selection, already encoded as "cat:<id>" / "sub:<id>" or "". */
  current: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sp = new URLSearchParams(params.toString());
    sp.delete("cat");
    sp.delete("sub");
    // A different slice of the catalogue starts from the top.
    sp.delete("page");
    const [kind, id] = e.target.value.split(":");
    if (id) sp.set(kind, id);
    const qs = sp.toString();
    router.push(qs ? `/products?${qs}` : "/products");
  }

  return (
    <Select
      value={current}
      onChange={onChange}
      className="h-11 w-full text-sm sm:w-64"
      aria-label="Filter by category"
    >
      <option value="">All categories</option>
      {categories.map((c) => (
        <optgroup key={c.id} label={c.name}>
          <option value={`cat:${c.id}`}>All of {c.name}</option>
          {c.subcategories.map((s) => (
            <option key={s.id} value={`sub:${s.id}`}>
              {"  "}
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
