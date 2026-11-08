// the planner's note and the check-in desk's note together, for the reports
export function reportNote(note?: string, desk?: { text?: string } | null) {
  const a = (note ?? "").trim();
  const b = (desk?.text ?? "").trim();
  return [a, b ? `Desk: ${b}` : ""].filter(Boolean).join(" · ");
}
