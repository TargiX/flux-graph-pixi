import type { NextConfig } from "next";

// The browser gets NEXT_PUBLIC_POSTHOG_* inlined at build time, while a server
// route reading process.env resolves at request time. Those two can disagree —
// adding the vars in Vercel without redeploying would make /api/health report
// healthy analytics against a client bundle that still ships no token. Stamping
// the build-time answer here keeps the launch check honest about what actually
// shipped to the browser.
const analyticsConfiguredAtBuild = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

const nextConfig: NextConfig = {
  env: {
    ROOMBOARD_ANALYTICS_CONFIGURED_AT_BUILD: String(analyticsConfiguredAtBuild),
  },
};

export default nextConfig;
