// layout.tsx
import Footer from "@/components/Footer";
import ToasterProvider from "@/providers/toaster-provider";
import AuthProvider from "@/providers/auth-provider";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "@/providers/auth-guard";
import { BrandSync } from "@/components/BrandSync";
import { ViewAsBar } from "@/components/ViewAsBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.seating4u.com"),
  title: "Seating4U · We've Got Your Seats",
  description: "Seating plans from the venue's floor plan, guests find their own table on their phone, and a calm check-in desk.",
  openGraph: { siteName: "Seating4U", title: "Seating4U · We've Got Your Seats", type: "website" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <AuthGuard>
            <ToasterProvider />
            <BrandSync />
            <ViewAsBar />
            {children}
            <Footer />
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}