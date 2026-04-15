import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: {
    default: "Sync Your Semester",
    template: "%s | Sync Your Semester",
  },
  description:
    "A calm, local-first academic planning app that helps students set up their semester before deadlines sneak up on them.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
