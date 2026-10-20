import { db } from "@/lib/db";

// Nightclub VIP: everything kept in the Setting table (no database changes).
//  vipt:<ev>:<tableId>        one table: booking, minimum, arrivals, server, promoter, celebration
//  viporder:<ev>:<iso>:<rnd>  one bottle order
//  vipcall:<ev>:<iso>:<rnd>   a guest pressed "Call server" / "Order another bottle"
//  vipmenu:<ev>               the bottle menu [{ name, price }]
//  vipstaff:<ev>              { servers: [], promoters: [] }

export type VipTable = {
  status?: "open" | "booked";
  host?: string;
  phone?: string;
  partySize?: number;
  arrived?: number;
  minimum?: number;
  server?: string;
  promoter?: string;
  celebration?: { type: string; at: string; note?: string; done?: boolean } | null;
  hostGuestId?: string;
};
export type OrderItem = { name: string; qty: number; price: number };
export type VipOrder = { key: string; tableId: string; items: OrderItem[]; total: number; by: string; at: string; status: "new" | "served" | "void" };
export type VipCall = { key: string; tableId: string; kind: "server" | "bottle"; at: string; done?: boolean; guest?: string };

const parse = <T,>(v: string | undefined | null, d: T): T => {
  try {
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const rnd = () => Math.random().toString(36).slice(2, 8);
const upsert = (key: string, value: unknown) =>
  db.setting.upsert({ where: { key }, update: { value: JSON.stringify(value) }, create: { key, value: JSON.stringify(value) } });

export async function vipTables(ev: string): Promise<Record<string, VipTable>> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: `vipt:${ev}:` } } });
  const out: Record<string, VipTable> = {};
  for (const r of rows as { key: string; value: string }[]) out[r.key.slice(`vipt:${ev}:`.length)] = parse(r.value, {});
  return out;
}
export async function vipTable(ev: string, tableId: string): Promise<VipTable> {
  const r = await db.setting.findUnique({ where: { key: `vipt:${ev}:${tableId}` } });
  return parse(r?.value, {});
}
export async function saveVipTable(ev: string, tableId: string, t: VipTable) {
  await upsert(`vipt:${ev}:${tableId}`, t);
}

export async function vipOrders(ev: string): Promise<VipOrder[]> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: `viporder:${ev}:` } } });
  return (rows as { key: string; value: string }[])
    .map((r) => ({ ...parse<Omit<VipOrder, "key">>(r.value, {} as Omit<VipOrder, "key">), key: r.key }))
    .sort((a, b) => b.at.localeCompare(a.at));
}
export async function addVipOrder(ev: string, o: Omit<VipOrder, "key" | "at" | "status">) {
  const at = new Date().toISOString();
  const key = `viporder:${ev}:${at}:${rnd()}`;
  await upsert(key, { ...o, at, status: "new" });
  return key;
}
export async function setVipOrderStatus(ev: string, key: string, status: VipOrder["status"]) {
  if (!key.startsWith(`viporder:${ev}:`)) return false;
  const r = await db.setting.findUnique({ where: { key } });
  if (!r) return false;
  await upsert(key, { ...parse(r.value, {}), status });
  return true;
}

export async function vipCalls(ev: string): Promise<VipCall[]> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: `vipcall:${ev}:` } } });
  return (rows as { key: string; value: string }[])
    .map((r) => ({ ...parse<Omit<VipCall, "key">>(r.value, {} as Omit<VipCall, "key">), key: r.key }))
    .sort((a, b) => b.at.localeCompare(a.at));
}
export async function addVipCall(ev: string, c: Omit<VipCall, "key" | "at">) {
  const at = new Date().toISOString();
  await upsert(`vipcall:${ev}:${at}:${rnd()}`, { ...c, at });
}
export async function closeVipCall(ev: string, key: string) {
  if (!key.startsWith(`vipcall:${ev}:`)) return false;
  const r = await db.setting.findUnique({ where: { key } });
  if (!r) return false;
  await upsert(key, { ...parse(r.value, {}), done: true });
  return true;
}

export const DEFAULT_MENU: OrderItem[] = [];
export async function vipMenu(ev: string): Promise<{ name: string; price: number }[]> {
  const r = await db.setting.findUnique({ where: { key: `vipmenu:${ev}` } });
  return parse(r?.value, []);
}
export async function vipStaff(ev: string): Promise<{ servers: string[]; promoters: string[] }> {
  const r = await db.setting.findUnique({ where: { key: `vipstaff:${ev}` } });
  return { servers: [], promoters: [], ...parse(r?.value, {}) };
}
export async function saveVipSettings(ev: string, s: { menu?: { name: string; price: number }[]; servers?: string[]; promoters?: string[] }) {
  if (s.menu) await upsert(`vipmenu:${ev}`, s.menu);
  if (s.servers || s.promoters) {
    const now = await vipStaff(ev);
    await upsert(`vipstaff:${ev}`, { servers: s.servers ?? now.servers, promoters: s.promoters ?? now.promoters });
  }
}

export const money = (n: unknown) => {
  const v = Math.round(Number(n) * 100) / 100;
  return Number.isFinite(v) && v >= 0 ? Math.min(v, 1_000_000) : 0;
};
export const text = (v: unknown, max = 60) => (typeof v === "string" ? v.trim().slice(0, max) : "");
