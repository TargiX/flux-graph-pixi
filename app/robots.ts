import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: ["/", "/privacy"],
      disallow: ["/api/", "/billing/", "/rooms/"],
      userAgent: "*",
    },
    sitemap: "https://www.roomboard.online/sitemap.xml",
  };
}
