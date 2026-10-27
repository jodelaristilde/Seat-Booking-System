"use client";

// Public homepage: what Seating4U does, a few real screens, reviews (only
// approved real ones), and "Request access". Logged-in people go straight to
// their dashboard (middleware).
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, LogIn, MapPinned, QrCode, Radio, ScanSearch, Sparkles, Star, Users, Utensils } from "lucide-react";
import { RequestForm } from "@/components/RequestForm";

type Review = { id: string; name: string; role: string; stars: number; text: string };

const FEATURES = [
  { icon: ScanSearch, title: "Reads your floor plan", text: "Upload the venue's plan. Tables and their numbers are found for you." },
  { icon: Sparkles, title: "Seats everyone in one click", text: "Families and parties stay together. Missing tables are added." },
  { icon: QrCode, title: "Guests find their own seat", text: "They scan a QR code, type their name, and follow a green line to their table." },
  { icon: CheckCircle2, title: "Check-in in seconds", text: "Search, tick, done. The name pops up and the table lights up." },
  { icon: Radio, title: "Live view for the family", text: "A private link to watch arrivals live, and a thank-you report after." },
  { icon: Utensils, title: "Kitchen and staff ready", text: "Meals and allergies for the caterer, door logins for your helpers." },
];

export default function Home() {
  const [reviews, setReviews] = useState<Review[]>([]);
  useEffect(() => {
    fetch("/api/reviews")
      .then((r) => r.json())
      .then((j) => j?.success && setReviews(j.reviews))
      .catch(() => undefined);
  }, []);
  return (
    <div className="page-bg text-zinc-900">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Image src="/seating4u-logo.png" alt="Seating4U" width={200} height={61} className="h-14 w-auto" priority />
          <nav className="ml-auto flex items-center gap-1 text-sm font-semibold sm:gap-3">
            <a href="#how" className="hidden rounded px-2 py-1 hover:bg-zinc-100 sm:block">How it works</a>
            <Link href="/venues" className="hidden rounded px-2 py-1 hover:bg-zinc-100 sm:block">For venues</Link>
            <Link href="/login" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 hover:bg-zinc-50">
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
            <a href="#request" className="rounded-lg bg-lime-600 px-3 py-1.5 text-white hover:bg-lime-700">Request access</a>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section>
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-2 md:py-20">
          <div>
            <p className="mb-2 font-semibold uppercase tracking-widest text-lime-700">For weddings, galas and VIP nights</p>
            <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">Every guest in the right seat. Checked in in seconds.</h1>
            <p className="mt-4 text-lg text-zinc-600">
              Seating4U plans your seating from the venue&apos;s floor plan, lets guests find their own table on their phone, and makes the
              check-in desk calm, even with 300 guests at the door.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#request" className="rounded-xl bg-lime-600 px-6 py-3 text-lg font-bold text-white hover:bg-lime-700">Request access</a>
              <a href="#how" className="rounded-xl border px-6 py-3 text-lg font-semibold hover:bg-zinc-50">See how it works</a>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border shadow-2xl">
            <Image src="/home/checkin.jpg" alt="Check-in: the guest's name pops up and their table lights up" width={1224} height={584} className="h-auto w-full" priority />
          </div>
        </div>
      </section>

      {/* the 1-minute video */}
      <section className="mx-auto max-w-4xl px-4 pt-10">
        <h2 className="mb-4 text-center text-3xl font-extrabold">See it in one minute</h2>
        <div className="overflow-hidden rounded-2xl border bg-black shadow-xl">
          <video
            className="block aspect-video w-full"
            src="/videos/seating4u-promo-2026-10-27.mp4"
            poster="/videos/seating4u-promo-2026-10-27.jpg"
            controls
            preload="metadata"
            playsInline
          />
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="mb-8 text-center text-3xl font-extrabold">Everything for the event, in one place</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((x) => (
            <div key={x.title} className="rounded-2xl border bg-white p-5">
              <x.icon className="mb-3 h-8 w-8 text-lime-600" />
              <h3 className="text-lg font-bold">{x.title}</h3>
              <p className="mt-1 text-zinc-600">{x.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="bg-white/40">
        <div className="mx-auto max-w-6xl space-y-14 px-4 py-14">
          <h2 className="text-center text-3xl font-extrabold">How it works</h2>
          {[
            { n: 1, t: "Upload the floor plan and your guest list", d: "Drop the venue's plan and your Excel list. The tables and numbers are read for you, then Seat everyone fills the tables.", img: "/home/floorplan-2026-10-27.jpg", w: 1224, h: 584 },
            { n: 2, t: "Guests find their seat on their phone", d: "Put the QR code at the entrance. Guests type their name, see their table, and follow the green line from the door.", img: "/home/phone-2026-10-27.jpg", w: 1160, h: 560 },
            { n: 3, t: "Check in at the door, calmly", d: "Your helpers search a name and tick. Walk-in guest? Add them to an empty seat in two clicks. VIPs get a gold welcome.", img: "/home/walkin-2026-10-27.jpg", w: 1224, h: 584 },
            { n: 4, t: "Share it live, and say thank you", d: "The family follows arrivals on a private link. After the event they get a report: who came, when, and the meals served.", img: "/home/report-2026-10-27.jpg", w: 920, h: 800 },
          ].map((s, i) => (
            <div key={s.n} className={`grid items-center gap-8 md:grid-cols-2 ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}>
              <div>
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-lime-500 text-lg font-extrabold">{s.n}</span>
                <h3 className="text-2xl font-bold">{s.t}</h3>
                <p className="mt-2 text-lg text-zinc-600">{s.d}</p>
              </div>
              <div className="overflow-hidden rounded-2xl border bg-white shadow-lg">
                <Image src={s.img} alt={s.t} width={s.w} height={s.h} className="h-auto w-full" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* reviews: only real, approved ones */}
      {reviews.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="mb-8 text-center text-3xl font-extrabold">What planners and hosts say</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {reviews.map((r) => (
              <figure key={r.id} className="rounded-2xl border bg-white p-5">
                <div className="mb-2 flex gap-0.5 text-amber-500">
                  {Array.from({ length: r.stars }, (_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <blockquote className="text-zinc-700">&ldquo;{r.text}&rdquo;</blockquote>
                <figcaption className="mt-3 text-sm font-semibold">
                  {r.name} <span className="font-normal text-zinc-500">· {r.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* who it is for */}
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-14 md:grid-cols-3">
        <div className="rounded-2xl bg-zinc-900 p-6 text-white">
          <Users className="mb-2 h-7 w-7 text-lime-400" />
          <h3 className="text-xl font-bold">Event planners</h3>
          <p className="mt-1 text-zinc-300">Your own events, your own door staff, your clients&apos; guest lists kept private.</p>
        </div>
        <div className="rounded-2xl bg-zinc-900 p-6 text-white">
          <MapPinned className="mb-2 h-7 w-7 text-lime-400" />
          <h3 className="text-xl font-bold">Venues</h3>
          <p className="mt-1 text-zinc-300">
            Offer it to every planner who books your room. <Link href="/venues" className="underline">Become a partner venue</Link>.
          </p>
        </div>
        <div className="rounded-2xl bg-zinc-900 p-6 text-white">
          <Sparkles className="mb-2 h-7 w-7 text-amber-400" />
          <h3 className="text-xl font-bold">Nightclubs</h3>
          <p className="mt-1 text-zinc-300">VIP tables, bottle orders, minimum spend and a bar screen, in a dark VIP look.</p>
        </div>
      </section>

      {/* request access */}
      <section id="request" className="bg-gradient-to-br from-lime-600 to-emerald-700">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 text-white md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-extrabold">Ready for your next event?</h2>
            <p className="mt-3 text-lg text-lime-50">
              Tell us a little about you and your next event. We&apos;ll set up your account and help you with your first event.
            </p>
            <p className="mt-4 text-lime-50">
              Already have an account?{" "}
              <Link href="/login" className="font-bold underline">
                Sign in
              </Link>
            </p>
          </div>
          <RequestForm />
        </div>
      </section>
    </div>
  );
}
