"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#efeae0] px-4">
      {/* Background Ambient Glows */}
      <div className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute -right-40 -bottom-40 h-[480px] w-[480px] rounded-full bg-clay/10 blur-3xl pointer-events-none" />
      
      <div className="relative w-full max-w-[380px] transition-all duration-300">
        <div className="mb-8 text-center">
          <div className="group mx-auto mb-4 flex h-16 w-16 cursor-pointer items-center justify-center rounded-[18px] bg-gradient-to-tr from-primary to-[#6c8e65] text-2xl font-extrabold text-white shadow-lg shadow-primary/20 transition-all duration-300 hover:scale-105 hover:rotate-3 hover:shadow-xl hover:shadow-primary/30">
            M
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Madagama Pvt Ltd</h1>
          <p className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Retail & Credit System</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="relative overflow-hidden rounded-2xl border border-border/70 bg-surface/80 p-8 shadow-[0_8px_32px_0_rgba(66,116,217,0.06)] backdrop-blur-md"
        >
          {error && (
            <div className="mb-5 border border-danger/10 rounded-xl bg-danger-soft px-4 py-3 text-xs font-semibold text-danger-ink transition-all duration-300">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted">Email Address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 h-11 border-input-border/70 transition-all focus-visible:ring-primary/20"
                placeholder="name@madagama.lk"
              />
            </div>
            
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-muted">Password</Label>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 h-11 border-input-border/70 transition-all focus-visible:ring-primary/20"
                placeholder="••••••••"
              />
            </div>

            <Button 
              type="submit" 
              size="lg" 
              className="mt-2 w-full bg-gradient-to-r from-primary to-[#6c8e65] text-white font-bold hover:brightness-105 active:scale-[0.98] transition-all shadow-md shadow-primary/10" 
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
