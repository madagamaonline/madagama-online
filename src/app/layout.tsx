import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Madagama Pvt Ltd",
  description: "Retail & credit management system",
  applicationName: "Madagama",
  appleWebApp: {
    capable: true,
    title: "Madagama",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

// `themeColor` / viewport settings live in the dedicated `viewport` export in
// this Next version (Next warns if they sit in `metadata`). `viewportFit:
// "cover"` lets content extend under the iOS notch/home-indicator so our
// safe-area padding on the mobile tab bar takes effect.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f6" },
    { media: "(prefers-color-scheme: dark)", color: "#12151b" },
  ],
};

// Applies the saved (or system) theme before first paint to avoid a flash of
// the wrong palette. Runs inline in <head> ahead of hydration.
const themeScript = `(function(){try{var t=localStorage.getItem('madagama:theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);var c=d?'#12151b':'#eef1f6';document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';var s=function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content',c);});};s();if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',s,{once:true});}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${hanken.variable} ${spaceMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
