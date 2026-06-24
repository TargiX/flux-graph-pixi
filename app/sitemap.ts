import type { MetadataRoute } from "next";

const baseUrl = "https://www.roomboard.online";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      changeFrequency: "weekly",
      lastModified: new Date(),
      priority: 1,
      url: baseUrl,
    },
    {
      changeFrequency: "monthly",
      lastModified: new Date(),
      priority: 0.4,
      url: `${baseUrl}/privacy`,
    },
  ];
}
