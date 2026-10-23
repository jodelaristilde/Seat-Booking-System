"use client";

// Choose a new password, from the emailed link: /reset?t=...
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function Reset() {
  const t = useSearchParams().get("t") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) return setMsg({ ok: false, text: "Use at least 6 characters." });
    if (pw !== pw2) return setMsg({ ok: false, text: "The two passwords are not the same." });
    const j = await fetch("/api/password-reset", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t, password: pw }),
    }).then((r) => r.json()).catch(() => null);
    setMsg(j?.success ? { ok: true, text: "Done! Your new password is saved." } : { ok: false, text: j?.message ?? "Could not save. Try again." });
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4 text-zinc-900">
      <form onSubmit={save} className="w-full max-w-sm space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (6+ characters)" className="block w-full border border-zinc-300 px-4 py-3" />
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Type it again" className="block w-full border border-zinc-300 px-4 py-3" />
        <button className="w-full bg-lime-500 py-3 font-medium text-white hover:bg-lime-600">Save my new password</button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
        <Link href="/login" className="block text-center text-sm text-zinc-500 underline">
          {msg?.ok ? "Sign in now" : "Back to sign in"}
        </Link>
      </form>
    </div>
  );
}

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <Reset />
    </Suspense>
  );
}
