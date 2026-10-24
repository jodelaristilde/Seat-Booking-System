"use client";

// While the admin is viewing the app as someone else: an orange bar on top
// with "Back to admin".
import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

export async function viewAs(id: string) {
  const r = await fetch("/api/view-as", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  }).then((x) => x.json()).catch(() => null);
  if (r?.success) window.location.href = "/dashboard";
  else alert(r?.message ?? "Could not switch");
}

export function ViewAsBar() {
  const [v, setV] = useState<{ name: string; role: string } | null>(null);
  useEffect(() => {
    // the name is in a small cookie set by "View as" (no request for everyone else)
    const m = document.cookie.match(/(?:^|; )seating4u_viewing=([^;]*)/);
    if (!m || !m[1]) return;
    try {
      setV(JSON.parse(decodeURIComponent(m[1])));
    } catch {
      setV({ name: "someone else", role: "" });
    }
  }, []);
  if (!v) return null;
  const back = async () => {
    await fetch("/api/view-as", { method: "DELETE" }).catch(() => undefined);
    window.location.href = "/dashboard/planners";
  };
  return (
    <div className="keep-ink sticky top-0 z-[115] flex flex-wrap items-center justify-center gap-3 bg-orange-500 px-4 py-2 text-sm font-semibold text-white">
      <Eye className="h-4 w-4" />
      You are viewing the app as {v.name} ({v.role}). Anything you do here is done as them.
      <button onClick={back} className="rounded-md bg-white px-3 py-1 font-bold text-orange-700 hover:bg-orange-50">
        Back to admin
      </button>
    </div>
  );
}
