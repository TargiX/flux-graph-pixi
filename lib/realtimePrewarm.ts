const realtimeEndpoint = process.env.NEXT_PUBLIC_ROOMBOARD_REALTIME_URL?.trim() ?? "";

let prewarmed = false;

/** Test seam: lets a test drive the guard without a live endpoint. */
export function resetRealtimePrewarmForTests() {
  prewarmed = false;
}

export function buildRealtimePrewarmUrl(endpoint = realtimeEndpoint) {
  const trimmed = endpoint.trim();

  if (!trimmed) {
    return "";
  }

  try {
    return new URL("/health", trimmed).toString();
  } catch {
    return "";
  }
}

/**
 * The Phoenix sidecar sleeps when idle and takes over a minute to wake. A
 * visitor spends that long reading a landing page before they ever click into a
 * room, so spending the cold start here means the room itself opens warm.
 *
 * Deliberately fire-and-forget and `no-cors`: nothing reads the response, the
 * request only has to reach the instance. Failures are ignored, since a missed
 * prewarm just restores the old behaviour rather than breaking the page.
 */
export function prewarmRealtimeEndpoint() {
  if (prewarmed || typeof window === "undefined") {
    return false;
  }

  const url = buildRealtimePrewarmUrl();

  if (!url) {
    return false;
  }

  prewarmed = true;

  try {
    void fetch(url, { cache: "no-store", mode: "no-cors", priority: "low" } as RequestInit).catch(() => {});
  } catch {
    // A blocked or failed prewarm is not worth surfacing to the visitor.
  }

  return true;
}
