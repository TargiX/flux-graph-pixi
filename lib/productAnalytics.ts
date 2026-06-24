import { track } from "@vercel/analytics";

type AnalyticsValue = string | number | boolean | null | undefined;

type ProductEventProperties = Record<string, AnalyticsValue>;

const campaignStorageKey = "roomboard-campaign-attribution";
const campaignSessionKey = "roomboard-campaign-attributed";
const campaignParamMap = {
  campaignContent: "utm_content",
  campaignMedium: "utm_medium",
  campaignName: "utm_campaign",
  campaignSource: "utm_source",
  campaignTerm: "utm_term",
  ref: "ref",
} as const;

function cleanAnalyticsValue(value: string | null) {
  return value?.trim().slice(0, 96) || "";
}

function readStoredCampaignAttribution(): ProductEventProperties {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(campaignStorageKey) ?? "{}") as ProductEventProperties;
  } catch {
    return {};
  }
}

function writeStoredCampaignAttribution(properties: ProductEventProperties) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(campaignStorageKey, JSON.stringify(properties));
  } catch {
    // Campaign attribution is helpful, not required for the app to work.
  }
}

export function captureCampaignAttribution(): ProductEventProperties {
  if (typeof window === "undefined") {
    return {};
  }

  const params = new URLSearchParams(window.location.search);
  const captured: ProductEventProperties = {};

  for (const [property, param] of Object.entries(campaignParamMap)) {
    const value = cleanAnalyticsValue(params.get(param));
    if (value) {
      captured[property] = value;
    }
  }

  if (!captured.campaignSource) {
    captured.campaignSource = cleanAnalyticsValue(params.get("source"));
  }

  if (!captured.campaignName) {
    captured.campaignName = cleanAnalyticsValue(params.get("campaign"));
  }

  if (Object.keys(captured).length === 0) {
    return readStoredCampaignAttribution();
  }

  const attribution: ProductEventProperties = {
    ...readStoredCampaignAttribution(),
    ...captured,
    landingPath: window.location.pathname,
  };

  writeStoredCampaignAttribution(attribution);

  try {
    const fingerprint = JSON.stringify(attribution);
    if (window.sessionStorage.getItem(campaignSessionKey) !== fingerprint) {
      window.sessionStorage.setItem(campaignSessionKey, fingerprint);
      track("Campaign Attributed", attribution);
    }
  } catch {
    // Session de-duping is optional.
  }

  return attribution;
}

export function trackProductEvent(name: string, properties: ProductEventProperties = {}) {
  try {
    track(name, {
      ...readStoredCampaignAttribution(),
      ...properties,
    });
  } catch {
    // Analytics must never block the room workflow.
  }
}
