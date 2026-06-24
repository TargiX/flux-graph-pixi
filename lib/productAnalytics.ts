import { track } from "@vercel/analytics";

type AnalyticsValue = string | number | boolean | null | undefined;

type ProductEventProperties = Record<string, AnalyticsValue>;

export function trackProductEvent(name: string, properties: ProductEventProperties = {}) {
  try {
    track(name, properties);
  } catch {
    // Analytics must never block the room workflow.
  }
}
