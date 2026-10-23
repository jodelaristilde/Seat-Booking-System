"use client";

// Plain-language trouble messages: a red bar when the internet drops, and a
// clear message (with what to do) when something fails without saying why.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";
import { openReportProblem } from "@/components/ReportProblem";

export function NetworkWatch() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const on = () => {
      setOffline(false);
      toast.success("Back online. You can keep going.");
    };
    const off = () => setOffline(true);
    if (!navigator.onLine) setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    let last = 0;
    const failed = () => {
      if (Date.now() - last < 15000) return;
      last = Date.now();
      toast.error("Something didn't work", {
        description: navigator.onLine
          ? "Try again in a moment. If it keeps happening, tell us with Report a problem."
          : "You're not connected to the internet. Check the Wi-Fi, then try again.",
        action: navigator.onLine ? { label: "Report a problem", onClick: openReportProblem } : undefined,
        duration: 10000,
      });
    };
    window.addEventListener("unhandledrejection", failed);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("unhandledrejection", failed);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="keep-ink sticky top-0 z-[110] flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-sm font-semibold text-white">
      <WifiOff className="h-4 w-4" /> No internet. Changes won&apos;t save until you&apos;re back online. Check the Wi-Fi.
    </div>
  );
}
