export const dynamic = "force-dynamic";

import ExcelJS from "exceljs";
import { activeEventId } from "@/lib/event";
import { guestFields, type GuestField } from "@/lib/guestFields";
import { NextResponse } from "next/server";

// GET: the Excel guest list template with only the columns this event uses
// (First Name, Last Name and Table always). (login required)
type Col = { key: GuestField | "first" | "last" | "table"; name: string; width: number; req: boolean; tip: string; help: string };
const ALL: Col[] = [
  { key: "first", name: "First Name", width: 16, req: true, tip: "Required.", help: "Required." },
  { key: "last", name: "Last Name", width: 18, req: true, tip: "Leave empty for a business (put its name in First Name).", help: "Leave empty for a business: put its name in First Name." },
  { key: "table", name: "Table", width: 12, req: false, tip: "A number (5) or a name (Head Table). Leave empty to seat them later.", help: "5 or Head Table seats the guest right away; missing tables are created. Leave empty to seat them later." },
  { key: "meal", name: "Meal", width: 14, req: false, tip: "Pick from the list or type your own (e.g. Vegan).", help: "Pick from the list (Chicken, Fish, Beef, Veg, Kids) or type your own." },
  { key: "allergy", name: "Allergy", width: 18, req: false, tip: "e.g. Nuts, Gluten. Shown in red to the caterer.", help: "e.g. Nuts, Gluten (shown in red to the caterer)." },
  { key: "vip", name: "VIP", width: 8, req: false, tip: "Put yes for a VIP guest.", help: "yes = VIP (gold welcome and banner)." },
  { key: "note", name: "Note", width: 40, req: false, tip: "A note for the desk. With a note, the guest's phone won't show the seat; the desk reads it first.", help: "A note for the desk (e.g. $250 to pay before seating). The guest's phone won't show the seat until the desk says yes." },
  { key: "party", name: "Party Size", width: 11, req: false, tip: "Total people including this guest (3 = guest + 2). Seated together, checked in together. Empty = 1.", help: "Total people including the guest (3 = guest + 2). Seated together at the same table, checked in together." },
];
const EXAMPLE: Record<Col["key"], string[]> = {
  first: ["Jodel", "Marie", "Paul"],
  last: ["Aristilde", "Delva", "Murphy"],
  table: ["2", "5", ""],
  meal: ["Chicken", "Fish", ""],
  allergy: ["", "Nuts", ""],
  vip: ["", "yes", ""],
  note: ["$250 to pay before seating", "", ""],
  party: ["", "3", ""],
};

export async function GET() {
  const f = await guestFields(await activeEventId());
  const cols = ALL.filter((c) => c.key === "first" || c.key === "last" || c.key === "table" || f[c.key as GuestField]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Guests", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.name, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.height = 22;
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.font = { name: "Arial", bold: true, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.req ? "FFD9F99D" : "FFF4F4F5" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "medium", color: { argb: "FF3F3F46" } } };
    cell.note = (c.req ? "" : "Optional. ") + c.tip;
  });
  // everything else stays editable; drop-downs where useful
  for (let r = 2; r <= 501; r++) {
    const row = ws.getRow(r);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.font = { name: "Arial", size: 11 };
      if (c.key === "meal")
        cell.dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: ['"Chicken,Fish,Beef,Veg,Kids"'], showInputMessage: true, promptTitle: "Meal", prompt: "Pick a meal or type your own. Optional." };
      if (c.key === "vip")
        cell.dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: ['"yes"'], showInputMessage: true, promptTitle: "VIP", prompt: "yes = VIP. Leave empty otherwise." };
    });
  }
  // no sheet protection: the whole file can be changed freely
  // instructions
  const hs = wb.addWorksheet("How to fill it in");
  hs.getColumn(1).width = 18;
  cols.forEach((c, i) => (hs.getColumn(i + 1).width = Math.max(14, c.width)));
  const put = (r: number, text: string, size = 11, bold = false, color = "FF18181B") => {
    const cell = hs.getCell(r, 1);
    cell.value = text;
    cell.font = { name: "Arial", size, bold, color: { argb: color } };
  };
  put(1, "Seating4U guest list template", 16, true);
  put(2, "Fill in the Guests sheet (first tab), one guest per row, starting on row 2 under the column names. Then upload it: New → Import guests (Excel).");
  put(3, "Keep the column names in row 1 (First Name and Last Name are needed); everything else can be changed.", 11, false, "FF3F6212");
  put(4, "Columns", 12, true);
  let r = 5;
  for (const c of cols) {
    hs.getCell(r, 1).value = c.name;
    hs.getCell(r, 1).font = { name: "Arial", bold: true };
    hs.getCell(r, 2).value = (c.req ? "" : "Optional. ") + c.help;
    hs.getCell(r, 2).font = { name: "Arial" };
    r++;
  }
  r++;
  put(r, "Example (how rows look; don't copy them into the Guests sheet unless they are real guests)", 12, true);
  r++;
  cols.forEach((c, i) => {
    const cell = hs.getCell(r, i + 1);
    cell.value = c.name;
    cell.font = { name: "Arial", bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.req ? "FFD9F99D" : "FFF4F4F5" } };
  });
  for (let k = 0; k < 3; k++) {
    r++;
    cols.forEach((c, i) => {
      hs.getCell(r, i + 1).value = EXAMPLE[c.key][k];
      hs.getCell(r, i + 1).font = { name: "Arial", color: { argb: "FF52525B" } };
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Seating4U-guest-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
