// The guest page (opened from the QR code) is built fresh for every visit,
// so a phone can never be shown an old version of it.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SeatScanningLayout({ children }: { children: React.ReactNode }) {
  return children;
}
