export const dynamic = "force-dynamic";

import ExcelJS from "exceljs";
import { authOptions } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

// GET -> an Excel backup of every event (admin only): one sheet with the events,
// one with every guest (event, table, seat, name, VIP, meal, arrived).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== "admin") return new NextResponse("Only the admin can download everything", { status: 403 });

  const [events, guests, users, owners] = await Promise.all([
    db.event.findMany({ orderBy: { createdAt: "asc" } }),
    db.users.findMany({ include: { seat: { include: { table: true } } } }),
    db.user.findMany({ select: { id: true, email: true, name: true } }),
    db.setting.findMany({ where: { key: { startsWith: "evowner:" } } }),
  ]);
  type Ev = { id: string; name: string; date: string | null; createdAt: Date };
  type G = { firstname: string; lastname: string; eventId: string | null; vip: boolean; meal: string | null; seat: { seat: number; isReceived: boolean; table: { name: string } }[] };
  const userName = new Map((users as { id: string; email: string; name: string | null }[]).map((u) => [u.id, u.name || u.email]));
  const ownerOf = new Map((owners as { key: string; value: string }[]).map((o) => [o.key.slice("evowner:".length), userName.get(o.value) ?? "?"]));
  const evName = new Map((events as Ev[]).map((e) => [e.id, e.name]));

  const wb = new ExcelJS.Workbook();
  const s1 = wb.addWorksheet("Events");
  s1.columns = [
    { header: "Event", key: "name", width: 34 },
    { header: "Date", key: "date", width: 14 },
    { header: "Owner", key: "owner", width: 22 },
    { header: "Guests", key: "guests", width: 10 },
    { header: "Arrived", key: "arrived", width: 10 },
    { header: "Created", key: "created", width: 20 },
  ];
  for (const e of events as Ev[]) {
    const mine = (guests as G[]).filter((g) => g.eventId === e.id);
    s1.addRow({
      name: e.name, date: e.date ?? "", owner: ownerOf.get(e.id) ?? "admin", guests: mine.length,
      arrived: mine.filter((g) => g.seat.some((x) => x.isReceived)).length, created: e.createdAt.toISOString().slice(0, 16).replace("T", " "),
    });
  }
  const s2 = wb.addWorksheet("Guests");
  s2.columns = [
    { header: "Event", key: "event", width: 30 },
    { header: "Table", key: "table", width: 14 },
    { header: "Seat", key: "seat", width: 7 },
    { header: "First Name", key: "first", width: 18 },
    { header: "Last Name", key: "last", width: 18 },
    { header: "VIP", key: "vip", width: 6 },
    { header: "Meal", key: "meal", width: 14 },
    { header: "Arrived", key: "arrived", width: 9 },
  ];
  for (const g of guests as G[]) {
    const st = g.seat[0];
    s2.addRow({
      event: evName.get(g.eventId ?? "") ?? "", table: st?.table.name ?? "", seat: st?.seat ?? "", first: g.firstname, last: g.lastname,
      vip: g.vip ? "yes" : "", meal: g.meal ?? "", arrived: st?.isReceived ? "yes" : "",
    });
  }
  for (const s of [s1, s2]) {
    s.getRow(1).font = { bold: true };
    s.views = [{ state: "frozen", ySplit: 1 }];
  }
  const buf = await wb.xlsx.writeBuffer();
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Seating4U-backup-${day}.xlsx"`,
    },
  });
}
