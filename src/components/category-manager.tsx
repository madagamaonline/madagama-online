"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  createCategory,
  createSubcategory,
  updateCategory,
  deleteCategory,
  updateSubcategory,
  deleteSubcategory,
  type ActionState,
} from "@/app/(app)/products/categories/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Sub = { id: string; name: string; code: string; _count: { products: number } };
type Category = { id: string; name: string; code: string; subcategories: Sub[] };

const initial: ActionState = {};

/** Derive a short uppercase code from a name, e.g. "Spare Parts" -> "SPAR". */
function genCode(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4);
}

/**
 * Controlled name + code inputs. The code auto-fills from the name until the
 * user edits the code manually (or when editing an existing record).
 */
function NameCode({
  initialName = "",
  initialCode = "",
  namePlaceholder,
  codePlaceholder,
  nameClass = "flex-1 min-w-[140px]",
  codeClass = "w-28",
}: {
  initialName?: string;
  initialCode?: string;
  namePlaceholder?: string;
  codePlaceholder?: string;
  nameClass?: string;
  codeClass?: string;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(initialCode);
  const [locked, setLocked] = useState(!!initialCode);

  return (
    <>
      <div className={nameClass}>
        <Input
          name="name"
          value={name}
          placeholder={namePlaceholder}
          required
          onChange={(e) => {
            const v = e.target.value;
            setName(v);
            if (!locked) setCode(genCode(v));
          }}
        />
      </div>
      <div className={codeClass}>
        <Input
          name="code"
          value={code}
          placeholder={codePlaceholder}
          required
          className="uppercase"
          onChange={(e) => {
            setLocked(true);
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
          }}
        />
      </div>
    </>
  );
}

function DeleteButton({
  onDelete,
  confirmText,
}: {
  onDelete: () => Promise<ActionState>;
  confirmText: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      {err && <span className="text-xs text-danger">{err}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(confirmText)) return;
          setErr("");
          start(async () => {
            const r = await onDelete();
            if (r?.error) setErr(r.error);
          });
        }}
        className="rounded-md p-1.5 text-danger hover:bg-red-50 disabled:opacity-50"
        aria-label="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </span>
  );
}

function AddCategoryForm() {
  const [state, action, pending] = useActionState(createCategory, initial);
  const [k, setK] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.ok) setK((x) => x + 1);
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <NameCode key={k} namePlaceholder="e.g. Agricultural" codePlaceholder="AGR" nameClass="flex-1 min-w-[160px]" codeClass="w-32" />
      <Button type="submit" disabled={pending}>
        <Plus className="h-4 w-4" /> Add
      </Button>
      {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}

function EditCategoryForm({ category, onDone }: { category: Category; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateCategory.bind(null, category.id), initial);
  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <NameCode initialName={category.name} initialCode={category.code} />
      <Button type="submit" size="sm" disabled={pending}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}

function AddSubForm({ categoryId }: { categoryId: string }) {
  const [state, action, pending] = useActionState(createSubcategory, initial);
  const [k, setK] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.ok) setK((x) => x + 1);
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="categoryId" value={categoryId} />
      <NameCode key={k} namePlaceholder="Subcategory name (e.g. Tools)" codePlaceholder="TOOL" />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <Plus className="h-4 w-4" /> Add
      </Button>
      {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}

function EditSubForm({ sub, onDone }: { sub: Sub; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateSubcategory.bind(null, sub.id), initial);
  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <NameCode initialName={sub.name} initialCode={sub.code} />
      <Button type="submit" size="sm" disabled={pending}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      {state.error && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editingSub, setEditingSub] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add Category</CardTitle>
        </CardHeader>
        <CardContent>
          <AddCategoryForm />
          <p className="mt-2 text-xs text-muted">
            Type the name and the code fills in automatically (you can edit it). The code becomes the
            first part of every product code, e.g. <b>AGR</b>-TOOL-0001. Editing a code only affects
            new products.
          </p>
        </CardContent>
      </Card>

      {categories.length === 0 ? (
        <p className="text-sm text-muted">No categories yet. Add one above to get started.</p>
      ) : (
        categories.map((cat) => (
          <Card key={cat.id}>
            <CardHeader>
              {editingCat === cat.id ? (
                <EditCategoryForm category={cat} onDone={() => setEditingCat(null)} />
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>
                    {cat.name} <Badge tone="blue">{cat.code}</Badge>
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingCat(cat.id)}
                      className="rounded-md p-1.5 text-muted hover:bg-slate-100"
                      aria-label="Edit category"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <DeleteButton
                      onDelete={() => deleteCategory(cat.id)}
                      confirmText={`Delete category "${cat.name}"?`}
                    />
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {cat.subcategories.length === 0 ? (
                <p className="text-sm text-muted">No subcategories yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {cat.subcategories.map((s) => (
                    <div key={s.id} className="py-2">
                      {editingSub === s.id ? (
                        <EditSubForm sub={s} onDone={() => setEditingSub(null)} />
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex flex-wrap items-center gap-2">
                            <b>{s.name}</b>
                            <Badge>
                              {cat.code}-{s.code}
                            </Badge>
                            <span className="text-xs text-muted">{s._count.products} item(s)</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingSub(s.id)}
                              className="rounded-md p-1.5 text-muted hover:bg-slate-100"
                              aria-label="Edit subcategory"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <DeleteButton
                              onDelete={() => deleteSubcategory(s.id)}
                              confirmText={`Delete subcategory "${s.name}"?`}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <AddSubForm categoryId={cat.id} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
