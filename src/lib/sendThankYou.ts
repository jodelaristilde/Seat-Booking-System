// Admin: one click sends the thank-you note with the report PDF attached.
// Phone (iPhone, Android) and most computers: the device's Share menu opens
// with the note and the PDF already in it; pick Mail or Messages, then the
// person. Where the Share menu can't take a file: the PDF downloads and the
// email app opens with the note written in, so you only attach the PDF.
import { toast } from "sonner";
import { afterEventPdf, type PdfTable } from "@/lib/afterEventPdf";

export function thankYouNote(eventName: string, link: string) {
  return [
    "Hi,",
    "",
    `Thank you for the opportunity to be part of ${eventName || "your event"}. It was a pleasure working with you and welcoming your guests to their seats.`,
    "",
    "Attached is your event report: who came, when they arrived, the meals served, and the guests who did not come, with their table numbers.",
    ...(link ? ["", `You can also open it online here: ${link}`] : []),
    "",
    "We would love to help with your next event.",
    "",
    "With gratitude,",
    "Jodel Aristilde",
    "Seating4U - We've Got Your Seats",
    "www.seating4u.com · 417-893-0047",
  ].join("\n");
}

export async function sendThankYou(o: { eventName: string; date?: string | null; tables: PdfTable[]; meals: [string, number][] }) {
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
