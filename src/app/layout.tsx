import type { Metadata, Viewport } from "next";
import { Titillium_Web } from "next/font/google";
import { RegistrarSW } from "@/components/RegistrarSW";
import "./globals.css";

const titillium = Titillium_Web({
  variable: "--font-titillium",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "Safety Car Stock",
  description: "Inventario de repuestos con IA",
  appleWebApp: { capable: true, title: "Safety Car", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#080A0C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={`${titillium.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
