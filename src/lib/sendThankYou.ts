// Admin: one click sends the thank-you note with the report PDF attached.
// Phone (iPhone, Android) and most computers: the device's Share menu opens
// with the note and the PDF already in it; pick Mail or Messages, then the
// person. Where the Share menu can't take a file: the PDF downloads and the
// email app opens with the note written in, so you only attach the PDF.
import { toast } from "sonner";
import { afterEventPdf, type PdfTable } from "@/lib/afterEventPdf";

export function thankYouNote(_eventName: string, link: string) {
  // Jodel's own wording
  return [
    "Thank you for the opportunity to be part of your event. It was a pleasure working with you and welcoming your guests to their seats.",
    "",
    "Attached is your after-event report. It shows how many guests came, when they arrived, and a list of the guests who did not come, with their table numbers.",
    ...(link ? ["", "You can also open the live version here:", link] : []),
    "",
    "We would love to help with your next event.",
    "",
    "With gratitude,",
    "Jodel Aristilde",
    "Seating4U — We've Got Your Seats",
    "www.seating4u.com · 417-893-0047",
  ].join("\n");
}

export async function sendThankYou(o: { eventName: string; date?: string | null; tables: PdfTable[] }) {
  const subject = `Thank you from Seating4U - ${o.eventName || "your event"}`;
  // the PDF and the report link, together (keeps the click's "permission" for the Share menu short)
  const [pdf, j] = await Promise.all([
    afterEventPdf({ ...o, mode: "blob" }),
    fetch("/api/live-link")
      .then((r) => r.json())
      .catch(() => null),
  ]);
  if (!pdf) throw new Error("no pdf");
  const link = j?.success && j.link ? String(j.link).replace("/live?", "/report?") : "";
  const text = thankYouNote(o.eventName, link);
  const file = new File([pdf.blob], pdf.name, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ title: subject, text, files: [file] });
      toast.success("Thank-you sent", { description: "Sent from your Mail or Messages." });
      return;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // closed the Share menu
      // the click took too long for the Share menu: fall through
    }
  }
  // no Share menu with files here: download the PDF, open the email with the note
  const a = document.createElement("a");
  a.href = URL.createObjectURL(pdf.blob);
  a.download = pdf.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  toast.message("Your email is open with the note", {
    description: `The report "${pdf.name}" is in your Downloads: attach it, pick the person, Send.`,
    duration: 20000,
  });
}

// Computer: open Gmail (the account signed in in this browser) with the note
// written in, and download the PDF to attach (Gmail links can't attach files).
export async function sendThankYouGmail(o: { eventName: string; date?: string | null; tables: PdfTable[] }) {
  const w = window.open("about:blank", "_blank"); // now, or the browser blocks it
  try {
    const subject = `Thank you from Seating4U - ${o.eventName || "your event"}`;
    const [pdf, j] = await Promise.all([
      afterEventPdf({ ...o, mode: "blob" }),
      fetch("/api/live-link")
        .then((r) => r.json())
        .catch(() => null),
    ]);
    if (!pdf) throw new Error("no pdf");
    const link = j?.success && j.link ? String(j.link).replace("/live?", "/report?") : "";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(pdf.blob);
    a.download = pdf.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    const url = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(thankYouNote(o.eventName, link))}`;
    if (w) w.location.href = url;
    else window.location.href = url;
    toast.message("Gmail is open with your note", {
      description: `Click the paperclip, pick "${pdf.name}" from Downloads, add the person's email, Send.`,
      duration: 30000,
    });
  } catch (e) {
    w?.close();
    throw e;
  }
}
