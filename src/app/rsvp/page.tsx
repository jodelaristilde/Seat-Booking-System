"use client";

// A guest's own RSVP page (from their personal link): coming yes / no,
// meal and allergy. /rsvp?t=<personal code>   (no login)
import { applyBrand } from "@/lib/useBrand";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

type Data = {
  open: boolean;
  guest: { firstname: string; lastname: string; meal: string; allergy: string; coming: "yes" | "no" | null };
  event: { name: string; date: string | null };
  meals: string[];
};

function RsvpForm() {
  const t = useSearchParams().get("t") ?? "";
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [coming, setComing] = useState<"yes" | "no" | null>(null);
  const [meal, setMeal] = useState("");
  const [allergy, setAllergy] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/rsvp?t=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) return setErr(j.message || "This link is not valid.");
        setData(j);
        applyBrand(j.event?.brand); // nightclub VIP events: dark, black and gold
        setComing(j.guest.coming);
        setMeal(j.guest.meal);
        setAllergy(j.guest.allergy);
      })
      .catch(() => setErr("Could not load. Please check your connection."));
  }, [t]);

  const save = async () => {
    if (!coming) return;
    setSaving(true);
    setErr("");
    try {
      const j = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t, coming, meal, allergy }),
      }).then((r) => r.json());
      if (!j.success) throw new Error(j.message);
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const card = "w-full max-w-md rounded-2xl border-[3px] border-lime-400 bg-gradient-to-br from-lime-50 via-white to-emerald-50 p-5 shadow-2xl shadow-lime-500/25";

  if (err && !data)
    return (
      <div className="w-full max-w-md rounded-2xl border-4 border-amber-400 bg-amber-50 p-6 text-center text-lg font-bold text-amber-950 shadow-2xl">
        {err}
      </div>
    );
  if (!data) return <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />;

  if (saved)
    return (
      <div className={`${card} text-center`}>
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-white">
          <Check className="h-9 w-9" />
        </div>
        <p className="text-2xl font-extrabold text-emerald-950">Thank you, {data.guest.firstname}!</p>
        <p className="mt-1 text-lg font-semibold text-emerald-900">
          {coming === "yes" ? "We can't wait to see you." : "We'll miss you. Thank you for letting us know."}
        </p>
        <button onClick={() => setSaved(false)} className="mt-4 text-sm font-semibold text-emerald-700 underline">
          Change my answer
        </button>
      </div>
    );

  return (
    <div className={card}>
      <p className="text-sm font-bold uppercase tracking-wide text-emerald-700">
        {data.event.name}
        {data.event.date ? ` · ${data.event.date}` : ""}
      </p>
      <h1 className="mt-1 text-3xl font-extrabold leading-tight text-emerald-950">
        {data.guest.firstname} {data.guest.lastname}
      </h1>
      {!data.open ? (
        <p className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-lg font-bold text-amber-950">
          Replies for this event are closed.
        </p>
      ) : (
        <>
          <p className="mt-4 text-lg font-bold text-zinc-900">Will you attend?</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(["yes", "no"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setComing(v)}
                className={`h-14 rounded-xl border-2 text-xl font-bold ${
                  coming === v
                    ? v === "yes"
                      ? "border-green-700 bg-green-600 text-white"
                      : "border-zinc-800 bg-zinc-800 text-white"
                    : "border-zinc-300 bg-white text-zinc-900"
                }`}
              >
                {v === "yes" ? "Yes, I'll be there" : "No, sorry"}
              </button>
            ))}
          </div>

          {coming === "yes" && (
            <>
              <p className="mt-5 text-lg font-bold text-zinc-900">
                Your meal <span className="text-sm font-medium text-zinc-500">(optional)</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.meals.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMeal(meal === m ? "" : m)}
                    className={`rounded-full border-2 px-4 py-2 text-base font-semibold ${
                      meal === m ? "border-emerald-700 bg-emerald-600 text-white" : "border-zinc-300 bg-white"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <input
                value={data.meals.includes(meal) ? "" : meal}
                onChange={(e) => setMeal(e.target.value)}
                maxLength={40}
                placeholder="Or type another meal"
                className="mt-2 h-12 w-full rounded-xl border-2 border-lime-300 bg-white px-3 text-base"
              />
              <p className="mt-4 text-lg font-bold text-zinc-900">
                Any allergy? <span className="text-sm font-medium text-zinc-500">(optional)</span>
              </p>
              <input
                value={allergy}
                onChange={(e) => setAllergy(e.target.value)}
                maxLength={60}
                placeholder="e.g. Nuts, shellfish, gluten"
                className="mt-2 h-12 w-full rounded-xl border-2 border-lime-300 bg-white px-3 text-base"
              />
            </>
          )}
          {err && <p className="mt-3 text-base font-semibold text-red-700">{err}</p>}
          <button
            onClick={save}
            disabled={!coming || saving}
            className="mt-5 h-14 w-full rounded-xl bg-emerald-700 text-xl font-bold text-white shadow hover:bg-emerald-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Send my answer"}
          </button>
        </>
      )}
    </div>
  );
}

export default function RsvpPage() {
  return (
    <div className="guest-page flex min-h-[100dvh] items-center justify-center bg-[#fafafa] px-3 py-4">
      <Suspense fallback={<Loader2 className="h-10 w-10 animate-spin text-emerald-600" />}>
        <RsvpForm />
      </Suspense>
    </div>
  );
}
