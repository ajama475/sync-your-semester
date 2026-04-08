import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cueforth",
  description: "Cueforth helps students turn course chaos into a plan. PanicButton turns syllabi into reviewable deadlines.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-background text-foreground antialiased" style={{ minHeight: "100%" }}>
        {children}
      </body>
    </html>
  );
}
