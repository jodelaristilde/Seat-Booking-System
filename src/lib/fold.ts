// Name matching that ignores accents, capitals, hyphens and apostrophes:
// "nadege" finds "Nadège", "fils aime" finds "Fils-Aimé", "stephanie" finds "Stéphanie".
export function fold(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-'’.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Every word typed must appear somewhere in the text
export function matches(text: string | null | undefined, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  const t = fold(text);
  return q.split(" ").every((w) => t.includes(w));
}
