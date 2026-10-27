"use client";

// For venues: why to recommend Seating4U to every planner who books the room,
// and a form to become a partner venue. Prints as a one-page flyer.
import Link from "next/link";
import Image from "next/image";
import { Building2, CheckCircle2, ClipboardList, Printer, QrCode, Repeat, Users } from "lucide-react";
import { RequestForm } from "@/components/RequestForm";

const POINTS = [
  { icon: Repeat, title: "Your floor plan, ready every time", text: "We set up your room once: tables, numbers and entrance. Every planner who books you starts from it." },
  { icon: QrCode, title: "A smoother door for your staff", text: "Guests find their table on their phone. No crowd around the seating chart, no lost guests." },
  { icon: ClipboardList, title: "Kitchen and staff in the loop", text: "Meals and allergies for your kitchen, a printed chart for your floor staff, live arrivals." },
  { icon: Users, title: "Planners love it", text: "A modern tool you can offer with your room: a reason to choose your venue." },
];

export default function Venues() {
  return (
    <div className="page-bg text-zinc-900">
      <style>{`@media print { .no-print { display: none !important } @page { margin: 10mm } header, footer { display: none !important } }`}</style>
      <header className="no-print sticky top-0 z-30 border-b bg-white/95">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/">
            <Image src="/seating4u-logo.png" alt="Seating4U" width={200} height={61} className="h-14 w-auto" />
          </Link>
          <nav className="ml-auto flex items-center gap-2 text-sm font-semibold">
            <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 hover:bg-zinc-50">
              <Printer className="h-4 w-4" /> Print this page
            </button>
            <a href="#partner" className="rounded-lg bg-lime-600 px-3 py-1.5 text-white hover:bg-lime-700">Become a partner</a>
          </nav>
        </div>
      </header>

      <section>
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-2 print:grid-cols-2 print:py-4">
          <div>
            <Image src="/seating4u-logo.png" alt="Seating4U" width={200} height={61} className="mb-2 hidden h-12 w-auto print:block" />
            <p className="mb-2 flex items-center gap-2 font-semibold uppercase tracking-widest text-lime-700">
              <Building2 className="h-5 w-5" /> For venues
            </p>
            <h1 className="text-4xl font-extrabold leading-tight print:text-2xl">Offer Seating4U with your room.</h1>
            <p className="mt-4 text-lg text-zinc-600 print:mt-2 print:text-sm">
              Every wedding, gala and party in your venue runs smoother when guests find their own seat and the door checks them in
              in seconds. Become a partner venue and recommend Seating4U to the planners who book you.
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border shadow-xl print:shadow-none">
            <Image src="/home/floorplan-2026-10-27.jpg" alt="Your floor plan with every table" width={1224} height={584} className="h-auto w-full" />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:grid-cols-2 print:grid-cols-2 print:py-2">
        {POINTS.map((p) => (
          <div key={p.title} className="flex gap-3 rounded-2xl border bg-white p-5 print:p-3">
            <p.icon className="h-8 w-8 shrink-0 text-lime-600" />
            <div>
              <h3 className="text-lg font-bold">{p.title}</h3>
              <p className="text-zinc-600">{p.text}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10 print:pb-2">
        <h2 className="mb-4 text-2xl font-extrabold">How the partnership works</h2>
        <ol className="grid gap-3 sm:grid-cols-3 print:grid-cols-3">
          {[
            "We set up your room in Seating4U from your floor plan.",
            "You mention Seating4U to the planners who book you (we give you this page to share or print).",
            "Planners get their account, with your room already in it, and we help them with their first event.",
          ].map((t, i) => (
            <li key={i} className="flex gap-3 rounded-xl bg-white p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime-500 font-extrabold">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 hidden text-center text-lg font-semibold print:block">
          <CheckCircle2 className="mr-1 inline h-5 w-5 text-lime-600" /> www.seating4u.com/venues · seating4you@gmail.com · (417) 893-0047
        </p>
      </section>

      <section id="partner" className="no-print bg-gradient-to-br from-lime-600 to-emerald-700">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 text-white md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-extrabold">Become a partner venue</h2>
            <p className="mt-3 text-lg text-lime-50">Leave your details and we&apos;ll get in touch to set up your room.</p>
          </div>
          <RequestForm kind="venue" />
        </div>
      </section>
    </div>
  );
}
