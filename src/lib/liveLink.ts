import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

// Read-only live view for the client (bride, family, host): /live?t=<token>.
// The token is signed with the site's secret and holds a per-event key
// ("livekey:<eventId>"); making a new key stops the old links.
const secret = () => process.env.NEXTAUTH_SECRET || process.env.RSVP_SECRET || "seating4u";
const sign = (s: string) => createHmac("sha256", secret()).update(`live:${s}`).digest("base64url").slice(0, 18);

async function key(eventId: string, fresh = false): Promise<string> {
  const k = `livekey:${eventId}`;
  if (!fresh) {
    const row = await db.setting.findUnique({ where: { key: k } });
    if (row?.value) return row.value;
  }
  const v = randomBytes(6).toString("base64url");
  await db.setting.upsert({ where: { key: k }, update: { value: v }, create: { key: k, value: v } });
  return v;
}

export async function liveToken(eventId: string, fresh = false) {
  const n = await key(eventId, fresh);
  return `${eventId}.${n}.${sign(`${eventId}.${n}`)}`;
}

export async function eventFromLiveToken(t: string | null): Promise<string | null> {
  const parts = (t ?? "").split(".");
  if (parts.length !== 3) return null;
  const [ev, n, sig] = parts;
  const want = sign(`${ev}.${n}`);
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const row = await db.setting.findUnique({ where: { key: `livekey:${ev}` } });
  return row?.value === n ? ev : null;
}
