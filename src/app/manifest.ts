import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Safety Car Stock",
    short_name: "Safety Car",
    description: "Inventario de repuestos con IA",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#080A0C",
    theme_color: "#080A0C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Cargar repuesto", url: "/cargar" }],
  };
}
