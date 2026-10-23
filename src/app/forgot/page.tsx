"use client";

// "I forgot my password": get a reset link by email.
import { useState } from "react";
import Link from "next/link";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const j = await fetch("/api/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!j) setMsg({ ok: false, text: "No internet? Check your connection and try again." });
    else if (j.success) setMsg({ ok: true, text: "If this email has an account, a reset link is on its way. Check your inbox (and spam)." });
    else setMsg({ ok: false, text: j.message });
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 text-zinc-900">
      <form onSubmit={send} className="w-full max-w-sm space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Forgot your password?</h1>
        <p className="text-sm text-zinc-600">Type the email you log in with. We&apos;ll send you a link to choose a new password.</p>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="block w-full border border-zinc-300 px-4 py-3"
        />
        <button disabled={busy} className="w-full bg-lime-500 py-3 font-medium text-white hover:bg-lime-600 disabled:opacity-50">
          {busy ? "Sending…" : "Send me a reset link"}
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
        <Link href="/login" className="block text-center text-sm text-zinc-500 underline">
          Back to sign in
        </Link>
      </form>
    </div>
  );
}
