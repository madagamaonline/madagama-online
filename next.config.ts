import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDFKit loads its built-in font metrics from the filesystem at runtime.
  // Keep it as a native Node dependency instead of bundling it into Route Handlers.
  serverExternalPackages: ["pdfkit"],
  async headers() {
    return [
      {
        // The service worker must be served fresh (never cached) and with the
        // correct JS content type so updates roll out immediately.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
