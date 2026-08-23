import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const isConfigured = Boolean(projectToken && apiHost);

if (!isConfigured && process.env.NODE_ENV === "development") {
  const missingVariable = projectToken ? "NEXT_PUBLIC_POSTHOG_HOST" : "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN";

  throw new Error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

if (projectToken && apiHost) {
  posthog.init(projectToken, {
    api_host: apiHost,
    autocapture: false,
    capture_pageleave: false,
    capture_pageview: false,
    defaults: "2026-01-30",
    disable_session_recording: true,
    person_profiles: "identified_only",
  });
}
