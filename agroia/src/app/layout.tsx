import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AgroIA — assistente para o produtor rural", template: "%s · AgroIA" },
  description:
    "Assistente de inteligência artificial para agricultura e pecuária brasileira: dúvidas, análise de fotos de plantas, clima e manejo de animais.",
  applicationName: "AgroIA",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AgroIA", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0b130e" },
  ],
};

/** Aplica o tema antes da hidratação para evitar "piscar" de cores. */
const themeScript = `(function(){try{var t=localStorage.getItem('agroia-theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      data-theme="light"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
