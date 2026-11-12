import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AgroIA — assistente para o produtor rural",
    short_name: "AgroIA",
    description: "Assistente de IA para agricultura e pecuária brasileira.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f3ec",
    theme_color: "#14532d",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
