import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Brand-mandated typeface, served locally (same files as beyondbmi.ie).
const poppins = localFont({
  variable: "--font-poppins",
  display: "swap",
  src: [
    { path: "../../public/fonts/poppins-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/poppins-500.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/poppins-700.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/poppins-800.woff2", weight: "800", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: {
    default: "Beyond BMI",
    template: "%s · Beyond BMI",
  },
  description: "Your Beyond BMI care portal — appointments, medication, progress and your care team in one place.",
  icons: { icon: "/brand/bb-icon.webp" },
};

export const viewport: Viewport = {
  themeColor: "#053F5C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IE" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
