import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Atlas",
    short_name: "Atlas",
    description: "个人化 AI 学习副驾驶",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#8b5cf6",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
