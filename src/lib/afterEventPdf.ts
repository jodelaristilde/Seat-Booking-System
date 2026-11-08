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
    // made smaller (700 px wide is plenty for print) so the PDF stays light
    const bmp = await createImageBitmap(b);
    const c = document.createElement("canvas");
    c.width = 700;
    c.height = Math.round((700 * bmp.height) / bmp.width);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function afterEventPdf(o: {
  eventName: string;
  date?: string | null;
  tables: PdfTable[];
  // "blob": give the file back (to share it) instead of downloading it
  mode?: "save" | "blob";
}): Promise<{ blob: Blob; name: string } | void> {
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = M;
  const RED: [number, number, number] = [200, 20, 20];
  const BLACK: [number, number, number] = [20, 20, 20];
  const GREY: [number, number, number] = [110, 110, 110];
  const text = (s: string, x: number, size = 10, bold = false, color = BLACK, align: "left" | "right" | "center" = "left") => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(s, x, y, { align });
  };

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
      doc.addImage(img, "PNG", (W - lw) / 2, cy, lw, (lw * 491) / 1600, "logo");
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
      "Your guest list is on the next pages. Names in red did not come.",
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

  // the report pages: same light green background and border as the card
  const L = M + 22; // inside the border
  const R = W - M - 22;
  const TOP = M + 30;
  const BOTTOM = H - M - 28;
  const frame = () => {
    doc.setFillColor(247, 254, 231);
    doc.rect(0, 0, W, H, "F");
    doc.setDrawColor(132, 204, 22);
    doc.setLineWidth(6);
    doc.roundedRect(M - 10, M - 10, W - 2 * M + 20, H - 2 * M + 20, 14, 14);
    doc.setLineWidth(1);
    doc.roundedRect(M, M, W - 2 * M, H - 2 * M, 10, 10);
    doc.setLineWidth(1);
  };
  frame();
  y = TOP;
  // logo, top right (1600 x 491)
  if (img) {
    const lw = 130;
    doc.addImage(img, "PNG", R - lw, TOP - 16, lw, (lw * 491) / 1600, "logo");
  }
  text(o.eventName || "Event", L, 20, true);
  y += 18;
  text(o.date ? new Date(o.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Guest list", L, 10, false, GREY);
  y += 22;
  // headline numbers
  const boxes: [string, string, [number, number, number]][] = [
    ["Invited", String(all.length), BLACK],
    ["Came", `${came.length} (${all.length ? Math.round((came.length * 100) / all.length) : 0}%)`, BLACK],
    ["Did not come", String(noShow.length), noShow.length ? RED : BLACK],
  ];
  const bw = (R - L - 20) / 3;
  boxes.forEach(([k, v, c], i) => {
    const x = L + i * (bw + 10);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(200);
    doc.roundedRect(x, y, bw, 46, 6, 6, "FD");
    const yy = y;
    y = yy + 16;
    text(k.toUpperCase(), x + 10, 8, true, GREY);
    y = yy + 37;
    text(v, x + 10, 17, true, c);
    y = yy;
  });
  y += 70;

  // all guests, A to Z, two columns, names only: red = did not come
  const abc = [...all].sort((p, q) => p.name.localeCompare(q.name, undefined, { sensitivity: "base", numeric: true }));
  const legend = () => {
    text(`Guests (${all.length})`, L, 13, true);
    text("Red means did not come", R, 11, true, RED, "right");
    y += 7;
    doc.setDrawColor(132, 204, 22);
    doc.setLineWidth(1);
    doc.line(L, y, R, y);
    y += 16;
  };
  legend();
  const ROW = 13;
  const colW = (R - L - 24) / 2;
  let i = 0;
  while (i < abc.length) {
    // fill this page: first column top to bottom, then the second
    const rows = Math.max(1, Math.floor((BOTTOM - y) / ROW));
    const chunk = abc.slice(i, i + rows * 2);
    const perCol = Math.ceil(chunk.length / 2);
    const y0 = y;
    chunk.forEach((g, k) => {
      const col = k < perCol ? 0 : 1;
      y = y0 + (k % perCol) * ROW;
      text(`${g.name}${g.vip ? " (VIP)" : ""}`, L + col * (colW + 24), 10.5, !g.came, g.came ? BLACK : RED);
    });
    y = y0 + perCol * ROW;
    i += chunk.length;
    if (i < abc.length) {
      doc.addPage();
      frame();
      y = TOP;
      legend();
    }
  }

  // thank-you and contact at the bottom of the last page
  y = BOTTOM + 10;
  text("Thank you for choosing Seating4U  ·  www.seating4u.com  ·  417-893-0047", W / 2, 9, true, GREY, "center");
  const safe = (o.eventName || "event").replace(/[^\w\- ]+/g, "").trim() || "event";
  const name = `${safe} - Seating4U report.pdf`;
  if (o.mode === "blob") return { blob: doc.output("blob"), name };
  doc.save(name);
}
