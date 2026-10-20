export const dynamic = "force-dynamic";

import { activeEventId } from "@/lib/event";
import { money, saveVipSettings, text } from "@/lib/vip";
import { NextResponse } from "next/server";

// PUT { menu?: [{ name, price }], servers?: [], promoters?: [] }  (full access only)
export async function PUT(req: Request) {
  const b = await req.json().catch(() => null);
  const list = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.map((x) => text(x, 40)).filter(Boolean))].slice(0, 100) : undefined;
  await saveVipSettings(await activeEventId(), {
    menu: Array.isArray(b?.menu)
      ? b.menu
          .map((m: { name?: unknown; price?: unknown }) => ({ name: text(m?.name, 60), price: money(m?.price) }))
          .filter((m: { name: string }) => m.name)
          .slice(0, 200)
      : undefined,
    servers: list(b?.servers),
    promoters: list(b?.promoters),
  });
  return NextResponse.json({ success: true });
}
