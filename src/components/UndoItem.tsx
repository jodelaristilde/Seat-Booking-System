"use client";

// Menu item: "Undo: Seat everyone (2:14 PM)". Puts back the copy saved just
// before the last big change (Delete all tables, Import guests, Seat everyone).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export async function undoLastChange() {
  const r = await fetch("/api/snapshot", { method: "PUT" }).then((x) => x.json()).catch(() => null);
  if (r?.success) {
    toast.success(`Undone: ${r.label}`);
    setTimeout(() => window.location.reload(), 600);
  } else toast.error(r?.message ?? "Could not undo");
}

export function UndoItem() {
  const [snap, setSnap] = useState<{ label: string; at: string } | null>(null);
  useEffect(() => {
    fetch("/api/snapshot")
      .then((r) => r.json())
      .then((j) => j?.success && setSnap(j.snapshot))
      .catch(() => undefined);
  }, []);
  if (!snap) return null;
  const when = new Date(snap.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={() => {
        if (window.confirm(`Undo "${snap.label}" (${when})? Tables, seats and guests go back to how they were just before it.`))
          undoLastChange();
      }}
    >
      <Undo2 className="mr-2 w-4 h-4" /> Undo: {snap.label}
    </DropdownMenuItem>
  );
}
