import "./globals.css";
import type { Metadata } from "next";
import { Newsreader, Plus_Jakarta_Sans } from "next/font/google";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Cueforth",
  description: "Cueforth helps students turn course chaos into a plan. PanicButton turns syllabi into reviewable deadlines.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${plusJakartaSans.variable} ${newsreader.variable} h-full bg-background text-foreground antialiased`}
        style={{ minHeight: "100%" }}
      >
        {children}
      </body>
    </html>
  );
}
