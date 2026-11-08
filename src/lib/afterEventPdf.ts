// The after-event report as a real PDF file (downloads straight away, works on
// phones and computers, no print window). Guests who did not come are in RED,
// with their table, in their own list.
import { jsPDF } from "jspdf";

export type PdfTable = { name: string; guests: { name: string; came: boolean; at?: string | null; vip?: boolean }[] };

// the logo as a picture the PDF can hold (null if it can't be loaded)
async function logo(): Promise<string | null> {
  try {
    const b = await fetch("/seating4u-logo.png").then((r) => (r.ok ? r.blob() : null));
    if (!b) return null;
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => res(null);
      fr.readAsDataURL(b);
    });
  } catch {
    return null;
  }
}

export async function afterEventPdf(o: {
  eventName: string;
  date?: string | null;
  tables: PdfTable[];
  meals: [string, number][];
}) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = M;
  const RED: [number, number, number] = [200, 20, 20];
  const BLACK: [number, number, number] = [20, 20, 20];
  const GREY: [number, number, number] = [110, 110, 110];
  const need = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };
  const text = (s: string, x: number, size = 10, bold = false, color = BLACK, align: "left" | "right" | "center" = "left") => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(s, x, y, { align });
  };
  const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

  const all = o.tables.flatMap((t) => t.guests.map((g) => ({ ...g, table: t.name })));
  const came = all.filter((g) => g.came);
  const noShow = all.filter((g) => !g.came);

  const img = await logo();

  // page 1: a thank-you card
  {
    const LIME: [number, number, number] = [132, 204, 22];
    const GREEN: [number, number, number] = [21, 128, 61];
    doc.setFillColor(247, 254, 231);
    doc.rect(0, 0, W, H, "F");
    doc.setDrawColor(...LIME);
    doc.setLineWidth(6);
    doc.roundedRect(M - 10, M - 10, W - 2 * M + 20, H - 2 * M + 20, 14, 14);
    doc.setLineWidth(1);
    doc.roundedRect(M, M, W - 2 * M, H - 2 * M, 10, 10);
    let cy = M + 60;
    if (img) {
      const lw = 300;
      doc.addImage(img, "PNG", (W - lw) / 2, cy, lw, (lw * 491) / 1600);
      cy += (lw * 491) / 1600 + 70;
    }
    doc.setFont("times", "bolditalic");
    doc.setFontSize(60);
    doc.setTextColor(...GREEN);
    doc.text("Thank You", W / 2, cy, { align: "center" });
    cy += 30;
    doc.setDrawColor(...LIME);
    doc.setLineWidth(2);
    doc.line(W / 2 - 60, cy, W / 2 + 60, cy);
    cy += 40;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.setTextColor(...BLACK);
    const note = [
      `Thank you for the opportunity to be part of ${o.eventName || "your event"}${o.date ? ` on ${new Date(o.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}.`,
      "",
      "It was a pleasure welcoming your guests and helping every one of them find their seat.",
      "",
      "Your event report is on the next pages: who came, when they arrived, the meals served, and the guests who did not come, with their table numbers.",
      "",
      "We look forward to celebrating with you again.",
    ];
    for (const line of note) {
      if (!line) {
        cy += 8;
        continue;
      }
      for (const l of doc.splitTextToSize(line, W - 2 * M - 120)) {
        doc.text(l, W / 2, cy, { align: "center" });
        cy += 19;
      }
    }
    cy += 34;
    doc.setFont("times", "italic");
    doc.setFontSize(20);
    doc.setTextColor(...GREEN);
    doc.text("With gratitude,", W / 2, cy, { align: "center" });
    cy += 26;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BLACK);
    doc.text("Jodel Aristilde · Seating4U", W / 2, cy, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...GREY);
    doc.text("www.seating4u.com  ·  417-893-0047", W / 2, H - M - 30, { align: "center" });
    doc.addPage();
    doc.setLineWidth(1);
  }

  // the Seating4U logo, top right (1600 x 491)
  if (img) {
    const lw = 150;
    doc.addImage(img, "PNG", W - M - lw, M - 14, lw, (lw * 491) / 1600);
  }
  // title
  text(o.eventName || "Event", M, 20, true);
  y += 18;
  text(`${o.date ? o.date + " · " : ""}After-event report · Seating4U`, M, 10, false, GREY);
  y += 24;
  // headline numbers
  const boxes: [string, string, [number, number, number]][] = [
    ["Invited (seated)", String(all.length), BLACK],
    ["Came", `${came.length} (${all.length ? Math.round((came.length * 100) / all.length) : 0}%)`, BLACK],
    ["Did not come", String(noShow.length), noShow.length ? RED : BLACK],
  ];
  const bw = (W - 2 * M - 20) / 3;
  boxes.forEach(([k, v, c], i) => {
    const x = M + i * (bw + 10);
    doc.setDrawColor(200);
    doc.roundedRect(x, y, bw, 50, 6, 6);
    const yy = y;
    y = yy + 18;
    text(k.toUpperCase(), x + 10, 8, true, GREY);
    y = yy + 40;
    text(v, x + 10, 18, true, c);
    y = yy;
  });
  y += 72;

  // did not come, in red, with the table
  text(`Did not come (${noShow.length})`, M, 14, true, noShow.length ? RED : BLACK);
  y += 6;
  doc.setDrawColor(...RED);
  doc.line(M, y, W - M, y);
  y += 14;
  if (!noShow.length) {
    text("Everyone came.", M, 10);
    y += 16;
  } else {
    // two columns: name · table
    const colW = (W - 2 * M - 20) / 2;
    const rows = Math.ceil(noShow.length / 2);
    for (let r = 0; r < rows; r++) {
      need(14);
      for (let c = 0; c < 2; c++) {
        const g = noShow[c * rows + r];
        if (!g) continue;
        const x = M + c * (colW + 20);
        text(`${g.name}${g.vip ? " (VIP)" : ""}`, x, 10, false, RED);
        text(g.table, x + colW, 10, true, RED, "right");
      }
      y += 14;
    }
  }
  y += 14;

  // meals actually served
  if (o.meals.length) {
    need(40);
    text("Meals served (guests who came)", M, 14, true);
    y += 16;
    text(o.meals.map(([m, n]) => `${n} ${m}`).join("  ·  "), M, 10);
    y += 22;
  }

  // table by table: who came (black, with the time) and who did not (red)
  need(30);
  text("Table by table", M, 14, true);
  y += 6;
  doc.setDrawColor(180);
  doc.line(M, y, W - M, y);
  y += 16;
  for (const t of o.tables) {
    const here = t.guests.filter((g) => g.came).length;
    need(30);
    text(t.name, M, 11, true);
    text(`${here}/${t.guests.length} came`, W - M, 9, false, GREY, "right");
    y += 13;
    for (const g of t.guests) {
      need(13);
      if (g.came) {
        text(`${g.name}${g.vip ? " (VIP)" : ""}`, M + 10, 9.5);
        text(time(g.at), W - M, 9, false, GREY, "right");
      } else {
        text(`${g.name}${g.vip ? " (VIP)" : ""}`, M + 10, 9.5, true, RED);
        text("did not come", W - M, 9, true, RED, "right");
      }
      y += 12;
    }
    y += 8;
  }

  // thank-you and contact at the bottom of the last page
  need(40);
  y += 10;
  text("Thank you for choosing Seating4U  ·  www.seating4u.com  ·  417-893-0047", W / 2, 10, true, GREY, "center");
  doc.setFontSize(10);
  const safe = (o.eventName || "event").replace(/[^\w\- ]+/g, "").trim() || "event";
  doc.save(`${safe} - after-event report.pdf`);
}
