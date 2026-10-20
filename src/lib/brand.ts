import { db } from "@/lib/db";

// Each event shows as Seating4U (galas, weddings) or VIPService4U (nightclub
// VIP nights): logo and colours. Kept in the Setting table ("brand:<eventId>").
export type Brand = "seating4u" | "vip";

export async function brandOf(eventId: string | null | undefined): Promise<Brand> {
  if (!eventId) return "seating4u";
  const row = await db.setting.findUnique({ where: { key: `brand:${eventId}` } });
  return row?.value === "vip" ? "vip" : "seating4u";
}

export async function brandsFor(): Promise<Record<string, Brand>> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "brand:" } } });
  const out: Record<string, Brand> = {};
  for (const r of rows as { key: string; value: string }[]) if (r.value === "vip") out[r.key.slice(6)] = "vip";
  return out;
}

export async function setBrand(eventId: string, brand: Brand) {
  const key = `brand:${eventId}`;
  if (brand === "vip") await db.setting.upsert({ where: { key }, update: { value: "vip" }, create: { key, value: "vip" } });
  else await db.setting.deleteMany({ where: { key } });
}
