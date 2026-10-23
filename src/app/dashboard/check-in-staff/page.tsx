"use client";

// Check-in staff: the organizer makes logins for their desk helpers.
// A check-in account can only check guests in (and add a last-minute guest);
// it cannot delete anything or change tables. Each user only sees the
// helpers they made. /dashboard/check-in-staff (login required)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { HelpTip } from "@/components/HelpTip";
import { ArrowLeft, KeyRound, Trash2, UserPlus } from "lucide-react";

type Account = { id: string; email: string; name: string | null; staff?: boolean };

export default function CheckInStaff() {
  const [list, setList] = useState<Account[] | null>(null);
  const [name, setName] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/users");
    if (!r.ok) return setList([]);
    const all: Account[] = await r.json();
    setList(all.filter((a) => a.staff));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.trim() || pass.length < 6) return toast.error("Type a username and a password of at least 6 characters");
    setBusy(true);
    const r = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.trim(), password: pass, name: name.trim() || user.trim(), staff: true }),
    });
    setBusy(false);
    if (!r.ok) return toast.error(r.status === 409 ? "That username is taken. Try another one." : "Could not create the login");
    toast.success(`Login made for ${name.trim() || user.trim()}. Give them the username and password.`);
    setName("");
    setUser("");
    setPass("");
    load();
  };
  const reset = async (a: Account) => {
    const p = window.prompt(`New password for ${a.name || a.email} (at least 6 characters):`);
    if (!p) return;
    if (p.length < 6) return toast.error("At least 6 characters");
    const r = await fetch(`/api/users/delete?id=${encodeURIComponent(a.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: p }),
    });
    if (r.ok) toast.success("Password changed");
    else toast.error("Could not change the password");
  };
  const remove = async (a: Account) => {
    if (!window.confirm(`Delete the login of ${a.name || a.email}? They will no longer be able to log in.`)) return;
    const r = await fetch(`/api/users/delete?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
    if (r.ok) {
      toast.success("Login deleted");
      load();
    } else toast.error("Could not delete it");
  };

  const input = "h-10 w-full rounded-md border px-3 text-sm";
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-white px-4 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm hover:bg-zinc-50">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-bold">
          Check-in staff
          <HelpTip side="right">
            Make one login per helper. Give them the <b>username</b> and <b>password</b>. They log in at www.seating4u.com and can
            only check guests in. After the event, delete the login with the bin.
          </HelpTip>
        </h1>
      </div>
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <p className="text-sm text-zinc-600">
          Make a login for each helper at the door. With it they can <b>check guests in</b> and add a last-minute guest, but they
          <b> can&apos;t delete anything</b> or change your tables.
        </p>

        <form onSubmit={add} className="space-y-3 rounded-xl border bg-white p-4">
          <p className="flex items-center gap-2 font-semibold">
            <UserPlus className="h-4 w-4" /> Add a helper
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Marie)" className={input} />
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Username" autoComplete="off" className={input} />
            <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Password (6+)" autoComplete="new-password" className={input} />
          </div>
          <button disabled={busy} className="rounded-md bg-lime-600 px-4 py-2 text-sm font-semibold text-white hover:bg-lime-700 disabled:opacity-50">
            {busy ? "Saving…" : "Create login"}
          </button>
        </form>

        <div className="rounded-xl border bg-white">
          <p className="border-b px-4 py-2 font-semibold">Your helpers {list ? `(${list.length})` : ""}</p>
          {!list && <p className="p-4 text-sm text-zinc-500">Loading…</p>}
          {list && !list.length && <p className="p-4 text-sm text-zinc-500">No helpers yet.</p>}
          <ul>
            {list?.map((a) => (
              <li key={a.id} className="flex items-center gap-2 border-b px-4 py-2 last:border-b-0">
                <div className="flex-1">
                  <p className="font-medium">{a.name || a.email}</p>
                  <p className="text-xs text-zinc-500">Username: {a.email} · check-in only</p>
                </div>
                <button onClick={() => reset(a)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-sm hover:bg-zinc-50">
                  <KeyRound className="h-4 w-4" /> New password
                </button>
                <button onClick={() => remove(a)} className="rounded p-1.5 text-red-600 hover:bg-red-50" aria-label="Delete this login">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-zinc-500">Your helpers log in at www.seating4u.com with their username and password.</p>
      </div>
    </div>
  );
}
