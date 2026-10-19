import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

// Personal RSVP links: /rsvp?t=<guestId>.<signature>. The signature is made
// with the site's secret, so nobody can guess another guest's link.
const secret = () => process.env.NEXTAUTH_SECRET || process.env.RSVP_SECRET || "seating4u";
const sign = (id: string) => createHmac("sha256", secret()).update(`rsvp:${id}`).digest("base64url").slice(0, 16);

export const rsvpToken = (guestId: string) => `${guestId}.${sign(guestId)}`;

export function guestFromToken(t: string | null | undefined): string | null {
  if (!t || !t.includes(".")) return null;
  const [id, sig] = t.split(".", 2);
  const want = sign(id);
  if (!sig || sig.length !== want.length) return null;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(want)) ? id : null;
}

export type Rsvp = { coming: "yes" | "no"; at: string };

export async function rsvpsFor(eventId: string): Promise<Record<string, Rsvp>> {
  const prefix = `rsvp:${eventId}:`;
  const rows = await db.setting.findMany({ where: { key: { startsWith: prefix } } });
  const out: Record<string, Rsvp> = {};
  for (const r of rows as { key: string; value: string }[]) {
    try {
      out[r.key.slice(prefix.length)] = JSON.parse(r.value);
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function setRsvp(eventId: string, guestId: string, coming: "yes" | "no") {
  const key = `rsvp:${eventId}:${guestId}`;
  const value = JSON.stringify({ coming, at: new Date().toISOString() });
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}
