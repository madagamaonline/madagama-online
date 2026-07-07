import type { MetadataRoute } from "next";

// Web app manifest — makes the site installable to a phone home screen and
// launch chromeless (no browser bar) like a native app. Served at
// `/manifest.webmanifest`; whitelisted in `proxy.ts` so it loads pre-login too.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Madagama Pvt Ltd",
    short_name: "Madagama",
    description: "Retail & credit management system",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#eef1f6",
    theme_color: "#eef1f6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
