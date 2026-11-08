// The thank-you email itself, styled like the PDF: the card, then the guest
// list in two columns (red = did not come). Plain HTML with inline styles so
// it survives being pasted into Gmail.
import type { PdfTable } from "@/lib/afterEventPdf";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function thankYouHtml(o: { eventName: string; date?: string | null; tables: PdfTable[]; link: string; origin: string }) {
  const name = esc(o.eventName || "your event");
  const when = o.date && /^\d{4}-\d{2}-\d{2}$/.test(o.date)
    ? new Date(o.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";
  const all = o.tables.flatMap((t) => t.guests).sort((p, q) => p.name.localeCompare(q.name, undefined, { sensitivity: "base", numeric: true }));
  const came = all.filter((g) => g.came).length;
  const half = Math.ceil(all.length / 2);
  const cell = (g?: (typeof all)[number]) =>
    g ? `<div style="font-size:13px;line-height:19px;${g.came ? "color:#141414" : "color:#c81414;font-weight:bold"}">${esc(g.name)}</div>` : "";
  const col = (list: typeof all) => list.map((g) => cell(g)).join("");
  // portrait, like a letter page (8.5 x 11): 520 wide, at least 672 tall
  const frame = (inner: string, middle = false) => `
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;margin:0 auto 18px;border-collapse:separate;background:#f7fee7;border:6px solid #84cc16;border-radius:14px">
  <tr><td style="padding:6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #84cc16;border-radius:10px"><tr><td height="640" valign="${middle ? "middle" : "top"}" style="height:640px;padding:22px 24px;font-family:Arial,Helvetica,sans-serif;color:#141414;vertical-align:${middle ? "middle" : "top"}">${inner}</td></tr></table></td></tr>
</table>`;
  const logo = `${o.origin}/seating4u-logo.png`;
  const box = (k: string, v: string, red = false) =>
    `<td width="33%" style="padding:0 4px"><div style="background:#fff;border:1px solid #d4d4d4;border-radius:6px;padding:8px 10px"><div style="font-size:10px;font-weight:bold;color:#6e6e6e;text-transform:uppercase">${k}</div><div style="font-size:20px;font-weight:bold;${red ? "color:#c81414" : ""}">${v}</div></div></td>`;

  const card = frame(`
    <div style="text-align:center">
      <img src="${logo}" alt="Seating4U" width="240" style="width:240px;max-width:80%;height:auto;margin:6px auto 18px;display:block">
      <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:bold;font-size:48px;line-height:56px;color:#15803d">Thank You</div>
      <div style="width:110px;height:2px;background:#84cc16;margin:12px auto 22px"></div>
      <p style="font-size:15px;line-height:22px;margin:0 0 12px">Thank you for the opportunity to be part of <b>${name}</b>${when ? ` on ${when}` : ""}.</p>
      <p style="font-size:15px;line-height:22px;margin:0 0 12px">It was a pleasure working with you and welcoming your guests to their seats.</p>
      <p style="font-size:15px;line-height:22px;margin:0 0 12px">Your guest list is below. Names in red did not come.</p>
      ${o.link ? `<p style="font-size:15px;line-height:22px;margin:0 0 12px">You can also open the live version here:<br><a href="${esc(o.link)}" style="color:#15803d;font-weight:bold">Open your event report</a></p>` : ""}
      <p style="font-size:15px;line-height:22px;margin:0 0 18px">We would love to help with your next event.</p>
      <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:20px;color:#15803d">With gratitude,</div>
      <div style="font-size:15px;font-weight:bold;margin-top:4px">Jodel Aristilde · Seating4U</div>
      <div style="font-size:12px;color:#6e6e6e;margin-top:14px"><a href="https://www.seating4u.com" style="color:#6e6e6e">www.seating4u.com</a> · 417-893-0047</div>
    </div>`, true);

  const list = frame(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:top"><div style="font-size:22px;font-weight:bold">${name}</div>${when ? `<div style="font-size:12px;color:#6e6e6e">${when}</div>` : ""}</td>
      <td align="right" style="vertical-align:top"><img src="${logo}" alt="Seating4U" width="120" style="width:120px;height:auto"></td>
    </tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 16px"><tr>
      ${box("Invited", String(all.length))}${box("Came", `${came} (${all.length ? Math.round((came * 100) / all.length) : 0}%)`)}${box("Did not come", String(all.length - came), all.length > came)}
    </tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #84cc16;margin-bottom:8px"><tr>
      <td style="font-size:15px;font-weight:bold;padding-bottom:4px">Guests (${all.length})</td>
      <td align="right" style="font-size:13px;font-weight:bold;color:#c81414;padding-bottom:4px">Red means did not come</td>
    </tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="50%" style="vertical-align:top;padding-right:10px">${col(all.slice(0, half))}</td>
      <td width="50%" style="vertical-align:top;padding-left:10px">${col(all.slice(half))}</td>
    </tr></table>
    <div style="text-align:center;font-size:11px;font-weight:bold;color:#6e6e6e;margin-top:16px">Thank you for choosing Seating4U · www.seating4u.com · 417-893-0047</div>`);

  return `<div style="background:#ffffff;padding:8px 0">${card}${list}</div>`;
}
