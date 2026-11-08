// Opens the client's after-event report (the thank-you report with the PDF
// button) in a new tab. Same private key as the client live view link.
import { toast } from "sonner";

export async function openClientReport() {
  // open the tab now (a tab opened after waiting gets blocked), fill it in after
  const w = window.open("about:blank", "_blank");
  const j = await fetch("/api/live-link")
    .then((r) => r.json())
    .catch(() => null);
  if (!j?.success || !j.link) {
    w?.close();
    toast.error(j?.message ?? "Could not open the client report");
    return;
  }
  const url = String(j.link).replace("/live?", "/report?");
  if (w) w.location.href = url;
  else window.location.href = url;
}
