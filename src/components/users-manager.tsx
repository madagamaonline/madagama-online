"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus, Loader2 } from "lucide-react";
import {
  createUser,
  updateUser,
  deleteUser,
  type UserFormState,
} from "@/app/(app)/settings/users-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/delete-button";
import type { Role } from "@/lib/session";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  hasPin: boolean;
};

const initial: UserFormState = {};

function AddUserForm() {
  const [state, action, pending] = useActionState(createUser, initial);
  const [k, setK] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.ok) setK((x) => x + 1);
  }, [state]);

  return (
    <form key={k} action={action} className="grid grid-cols-1 gap-3 rounded-lg bg-input/50 p-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="u-name">Name</Label>
        <Input id="u-name" name="name" placeholder="e.g. Kamal" required />
      </div>
      <div>
        <Label htmlFor="u-email">Email</Label>
        <Input id="u-email" name="email" type="email" placeholder="kamal@madagama.lk" required />
      </div>
      <div>
        <Label htmlFor="u-password">Password</Label>
        <Input id="u-password" name="password" type="password" autoComplete="new-password" placeholder="Min 6 characters" required />
      </div>
      <div>
        <Label htmlFor="u-role">Role</Label>
        <Select id="u-role" name="role" defaultValue="STAFF">
          <option value="STAFF">Cashier (Staff)</option>
          <option value="SALESPERSON">Salesperson</option>
          <option value="ADMIN">Admin</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="u-pin">Quick-switch PIN (optional)</Label>
        <Input id="u-pin" name="pin" inputMode="numeric" maxLength={4} placeholder="4 digits" />
      </div>
      {state.error && <p className="text-sm text-danger sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add user
        </Button>
      </div>
    </form>
  );
}

function EditUserForm({
  user,
  isSelf,
  onDone,
}: {
  user: UserRow;
  isSelf: boolean;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateUser.bind(null, user.id), initial);
  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="grid grid-cols-1 gap-3 py-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={`e-name-${user.id}`}>Name</Label>
        <Input id={`e-name-${user.id}`} name="name" defaultValue={user.name} required />
      </div>
      <div>
        <Label htmlFor={`e-email-${user.id}`}>Email</Label>
        <Input id={`e-email-${user.id}`} name="email" type="email" defaultValue={user.email} required />
      </div>
      <div>
        <Label htmlFor={`e-pass-${user.id}`}>New password (optional)</Label>
        <Input id={`e-pass-${user.id}`} name="password" type="password" autoComplete="new-password" placeholder="Leave blank to keep current" />
      </div>
      <div>
        <Label htmlFor={`e-role-${user.id}`}>Role</Label>
        <Select id={`e-role-${user.id}`} name="role" defaultValue={user.role} disabled={isSelf}>
          <option value="STAFF">Cashier (Staff)</option>
          <option value="SALESPERSON">Salesperson</option>
          <option value="ADMIN">Admin</option>
        </Select>
        {isSelf && <input type="hidden" name="role" value={user.role} />}
      </div>
      <div>
        <Label htmlFor={`e-pin-${user.id}`}>Quick-switch PIN</Label>
        <Input
          id={`e-pin-${user.id}`}
          name="pin"
          inputMode="numeric"
          maxLength={4}
          placeholder={user.hasPin ? "Set — leave blank to keep" : "4 digits (optional)"}
        />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="active"
          defaultChecked={user.active}
          disabled={isSelf}
          className="h-4 w-4 rounded border-border"
        />
        Active (can log in)
        {isSelf && <input type="hidden" name="active" value="on" />}
      </label>
      {state.error && <p className="text-sm text-danger sm:col-span-2">{state.error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function UserRowView({
  user,
  isSelf,
  onEdit,
}: {
  user: UserRow;
  isSelf: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{user.name}</span>
          {isSelf && <span className="text-xs text-muted">(you)</span>}
          <Badge tone={user.role === "ADMIN" ? "blue" : "gray"}>
            {user.role === "ADMIN" ? "Admin" : user.role === "SALESPERSON" ? "Salesperson" : "Cashier"}
          </Badge>
          {!user.active && <Badge tone="red">Disabled</Badge>}
        </div>
        <div className="truncate text-xs text-muted">{user.email}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4" /> Edit
        </Button>
        {!isSelf && (
          <DeleteButton
            onDelete={deleteUser.bind(null, user.id)}
            confirmText={`Delete user "${user.name}"? They will no longer be able to log in.`}
          />
        )}
      </div>
    </div>
  );
}

export function UsersManager({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users (logins)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted">
          These are the people who can log in (admins, cashiers, and salespeople) — separate from
          sales Employees. Only admins can manage users.
        </p>
        <AddUserForm />
        <div className="divide-y divide-border">
          {users.map((u) =>
            editingId === u.id ? (
              <EditUserForm
                key={u.id}
                user={u}
                isSelf={u.id === currentUserId}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <UserRowView
                key={u.id}
                user={u}
                isSelf={u.id === currentUserId}
                onEdit={() => setEditingId(u.id)}
              />
            ),
          )}
        </div>
      </CardContent>
    </Card>
  );
}
