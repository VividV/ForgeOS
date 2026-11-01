import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ForgeOS",
    short_name: "ForgeOS",
    description: "Manufacturing operations: production, materials and factory floor.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#1b1f24",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
