"use client";

// The very first time someone logs in: three easy ways to start.
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { GraduationCap, ListOrdered, PlayCircle, X } from "lucide-react";
import { startPractice } from "@/components/PracticeBanner";

export function WelcomeDialog() {
  const { data } = useSession();
  const id = (data?.user as { id?: string } | undefined)?.id;
  const [open, setOpen] = useState(false);
  const key = `seating4u-welcomed:${id}`;
  useEffect(() => {
    if (!id) return;
    try {
      if (!localStorage.getItem(key)) setOpen(true);
    } catch {
      /* private window: don't show */
    }
  }, [id, key]);
  if (!open) return null;
  const done = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };
  const choice = "flex w-full items-start gap-3 rounded-xl border-2 p-3 text-left hover:border-lime-500 hover:bg-lime-50";
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-zinc-900 shadow-2xl">
        <div className="mb-1 flex items-center">
          <h2 className="mr-auto text-2xl font-bold">Welcome to Seating4U!</h2>
          <button onClick={done} className="rounded p-1 text-zinc-500 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-zinc-600">How would you like to start? You can come back to these anytime from the menu (☰).</p>
        <div className="space-y-2">
          <a href="/user-guide" onClick={done} className={choice}>
            <PlayCircle className="mt-0.5 h-6 w-6 shrink-0 text-blue-600" />
            <span>
              <b className="block">Watch the 3-minute video</b>
              <span className="text-sm text-zinc-600">See every step first, with voice.</span>
            </span>
          </a>
          <button
            onClick={() => {
              done();
              startPractice();
            }}
            className={choice}
          >
            <GraduationCap className="mt-0.5 h-6 w-6 shrink-0 text-sky-700" />
            <span>
              <b className="block">Practice with sample guests</b>
              <span className="text-sm text-zinc-600">A pretend event to try everything. Nothing is real.</span>
            </span>
          </button>
          <button
            onClick={() => {
              done();
              window.dispatchEvent(new Event("seating4u:show-setup"));
            }}
            className={choice}
          >
            <ListOrdered className="mt-0.5 h-6 w-6 shrink-0 text-lime-700" />
            <span>
              <b className="block">Set up my event, step by step</b>
              <span className="text-sm text-zinc-600">A bar at the top shows what to do next.</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
