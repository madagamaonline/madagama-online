"use client";

import { useActionState } from "react";
import { updateSettings, type SettingsState } from "@/app/(app)/settings/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type SettingsInitial = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  interestRatePct: number;
  interestFreeMonths: number;
  smsSenderId: string;
  smsEnabled: boolean;
  textlkApiToken: string;
  reminderDayOfMonth: number;
  nonTaxableEnabled: boolean;
};

export function SettingsForm({ initial, isAdmin = false }: { initial: SettingsInitial; isAdmin?: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateSettings, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</div>}
      {state.ok && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Settings saved.</div>}

      <Card>
        <CardHeader>
          <CardTitle>Business details (shown on invoices)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="businessName">Business name</Label>
            <Input id="businessName" name="businessName" defaultValue={initial.businessName} required />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={initial.phone} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" defaultValue={initial.email} />
            </div>
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" name="address" defaultValue={initial.address} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="interestRatePct">Interest rate (% / month)</Label>
              <Input id="interestRatePct" name="interestRatePct" type="number" step="0.01" min="0" max="100" defaultValue={initial.interestRatePct} />
            </div>
            <div>
              <Label htmlFor="interestFreeMonths">Interest-free months</Label>
              <Input id="interestFreeMonths" name="interestFreeMonths" type="number" min="0" max="60" defaultValue={initial.interestFreeMonths} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SMS reminders (text.lk)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="smsSenderId">Sender ID</Label>
              <Input id="smsSenderId" name="smsSenderId" defaultValue={initial.smsSenderId} />
            </div>
            <div>
              <Label htmlFor="reminderDayOfMonth">Monthly reminder day (1–28)</Label>
              <Input id="reminderDayOfMonth" name="reminderDayOfMonth" type="number" min="1" max="28" defaultValue={initial.reminderDayOfMonth} />
            </div>
          </div>
          <div>
            <Label htmlFor="textlkApiToken">text.lk API token</Label>
            <Input
              id="textlkApiToken"
              name="textlkApiToken"
              type="password"
              autoComplete="off"
              defaultValue={initial.textlkApiToken}
              placeholder="Paste your text.lk API token"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="smsEnabled" defaultChecked={initial.smsEnabled} className="h-4 w-4 rounded border-border" />
            Enable sending SMS
          </label>
          <p className="text-xs text-muted">
            When SMS is off (or no API token is set here or in the environment), reminders are logged
            but not sent — useful for testing.
          </p>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Tax mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="nonTaxableEnabled"
                defaultChecked={initial.nonTaxableEnabled}
                className="h-4 w-4 rounded border-border"
              />
              Enable non-taxable products &amp; invoices
            </label>
            <p className="text-xs text-muted">
              When this is <b>off</b>, the entire system hides every non-taxable product, invoice,
              report figure and filter — it behaves as if only taxable stock exists, and new
              non-taxable items can&apos;t be created. Nothing is deleted: turning it back on makes
              everything reappear exactly as before. Admins only.
            </p>
          </CardContent>
        </Card>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save Settings"}
      </Button>
    </form>
  );
}
