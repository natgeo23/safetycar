import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // La dirección vieja de Vercel manda las pantallas al dominio propio. /api queda afuera:
  // el webhook del bot de WhatsApp y los avisos programados pueden seguir apuntando ahí.
  async redirects() {
    return [
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "safetycar-red.vercel.app" }],
        destination: "https://stock.safetycar.com.ar/:path",
        permanent: true,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
