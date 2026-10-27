"use client";

// "Client live view" link: a private, view-only page the organizer can send to
// the client (bride, family, host) to follow seating and arrivals live.
// Opened from the menu (☰) → Client live view.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, RefreshCw, Tv, X } from "lucide-react";

export function LiveLinkDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const get = async (fresh: boolean) => {
    const j = await fetch("/api/live-link", { method: fresh ? "POST" : "GET" })
      .then((r) => r.json())
      .catch(() => null);
    if (j?.success) {
      setUrl(j.link);
      if (fresh) toast.success("New link made. The old one no longer works.");
    } else toast.error(j?.message ?? "Could not make the link");
  };

  useEffect(() => {
    const show = () => {
      setOpen(true);
      setUrl("");
      get(false);
    };
    window.addEventListener("seating4u:live-link", show);
    return () => window.removeEventListener("seating4u:live-link", show);
  }, []);

  if (!open) return null;
  const btn = "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 text-zinc-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center">
          <h2 className="mr-auto text-lg font-bold">Client live view &amp; report</h2>
          <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-sm text-zinc-600">
          Send this link to your client. They see every table, who sits there and who has arrived, updating by itself. They
          can&apos;t change anything.
        </p>
        <input readOnly value={url || "Making the link…"} onFocus={(e) => e.target.select()} className="mb-3 h-10 w-full rounded-md border bg-zinc-50 px-2 text-sm" />
        <div className="flex flex-wrap gap-2">
          <button
            disabled={!url}
            onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success("Link copied"), () => toast.error("Select the link and copy it"))}
            className={`${btn} bg-lime-600 text-white hover:bg-lime-700 disabled:opacity-50`}
          >
            <Copy className="h-4 w-4" /> Copy link
          </button>
          <a href={url || undefined} target="_blank" rel="noreferrer" className={`${btn} border hover:bg-zinc-50`}>
            <ExternalLink className="h-4 w-4" /> Open
          </a>
          <button onClick={() => confirm("Make a new link? The old link will stop working.") && get(true)} className={`${btn} ml-auto text-zinc-600 hover:bg-zinc-100`}>
            <RefreshCw className="h-4 w-4" /> New link
          </button>
        </div>
        {/* on the night: the arrivals board for a TV at the entrance (same private key) */}
        <div className="mt-4 border-t pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Tv className="h-4 w-4" /> Arrivals board for a TV
          </p>
          <p className="mb-2 text-xs text-zinc-600">
            Open it on a TV or tablet at the entrance. Each guest you check in is welcomed by name with their table, VIPs in gold.
            Press the full-screen button on it.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={url ? url.replace("/live?", "/board?") : undefined} target="_blank" rel="noreferrer" className={`${btn} bg-zinc-900 text-white hover:bg-zinc-700`}>
              <Tv className="h-4 w-4" /> Open arrivals board
            </a>
            <button
              disabled={!url}
              onClick={() => navigator.clipboard?.writeText(url.replace("/live?", "/board?")).then(() => toast.success("Board link copied"), () => toast.error("Could not copy"))}
              className={`${btn} border hover:bg-zinc-50 disabled:opacity-50`}
            >
              <Copy className="h-4 w-4" /> Copy board link
            </button>
          </div>
        </div>
        {/* after the event: a thank-you report for the host (same private key) */}
        <div className="mt-4 border-t pt-3">
          <p className="mb-2 text-sm font-semibold">After the event: report for the host</p>
          <p className="mb-2 text-xs text-zinc-600">Who came, when they arrived and the meals served. They can print it or save it as a PDF.</p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!url}
              onClick={() => navigator.clipboard?.writeText(url.replace("/live?", "/report?")).then(() => toast.success("Report link copied"), () => toast.error("Could not copy"))}
              className={`${btn} border hover:bg-zinc-50 disabled:opacity-50`}
            >
              <Copy className="h-4 w-4" /> Copy report link
            </button>
            <a href={url ? url.replace("/live?", "/report?") : undefined} target="_blank" rel="noreferrer" className={`${btn} border hover:bg-zinc-50`}>
              <ExternalLink className="h-4 w-4" /> Open report
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
