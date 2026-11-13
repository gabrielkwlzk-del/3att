import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AgroIA — assistente para o produtor rural",
    short_name: "AgroIA",
    description: "Assistente de IA para agricultura e pecuária brasileira.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b130e",
    theme_color: "#0b130e",
    lang: "pt-BR",
    icons: [
      { src: "/logo.png", sizes: "1254x1254", type: "image/png", purpose: "any" },
    ],
  };
}
