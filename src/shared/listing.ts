import type { ListingData } from "./types";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function textFromSelectors(doc: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = doc.querySelector(selector)?.textContent;
    if (value && normalizeWhitespace(value)) {
      return normalizeWhitespace(value);
    }
  }
  return undefined;
}

export function parseNumber(text?: string | null): number | undefined {
  if (!text) return undefined;
  const digits = text.replace(/[^0-9.]/g, "");
  if (!digits) return undefined;
  const value = Number(digits);
  return Number.isFinite(value) ? value : undefined;
}

export function isLikelyListingPath(pathname: string): boolean {
  return /\/(rental|rentals|sale|sales|building)\//i.test(pathname);
}

export function parseListingIdFromPath(pathname: string): string | null {
  const explicit = pathname.match(/\/(?:rental|rentals|sale|sales|building)\/(\d+)/i);
  if (explicit?.[1]) {
    return explicit[1];
  }

  const fallback = pathname.match(/(\d{5,})/);
  return fallback?.[1] || null;
}

export function parseListingIdFromUrl(urlValue: string): string | null {
  try {
    const parsedUrl = new URL(urlValue, "https://streeteasy.com");
    const fromPath = parseListingIdFromPath(parsedUrl.pathname);
    if (fromPath) return fromPath;

    const queryCandidates = ["listing", "listingId", "id", "rental", "sale"];
    for (const key of queryCandidates) {
      const value = parsedUrl.searchParams.get(key);
      if (value && /^\d{5,}$/.test(value)) {
        return value;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function fallbackListingKeyFromUrl(urlValue: string): string | null {
  try {
    const parsedUrl = new URL(urlValue, "https://streeteasy.com");
    if (!isLikelyListingPath(parsedUrl.pathname)) {
      return null;
    }

    const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");
    const normalizedSearch = parsedUrl.searchParams.toString();
    return `url:${normalizedPath}${normalizedSearch ? `?${normalizedSearch}` : ""}`;
  } catch {
    return null;
  }
}

export function parseListingIdFromDocument(doc: Document, url: string): string | null {
  const byCurrentUrl = parseListingIdFromUrl(url);
  if (byCurrentUrl) return byCurrentUrl;

  const canonical = doc.querySelector("link[rel='canonical']")?.getAttribute("href");
  if (canonical) {
    const byCanonical = parseListingIdFromUrl(canonical);
    if (byCanonical) return byCanonical;
  }

  const ogUrl = doc.querySelector("meta[property='og:url']")?.getAttribute("content");
  if (ogUrl) {
    const byOgUrl = parseListingIdFromUrl(ogUrl);
    if (byOgUrl) return byOgUrl;
  }

  const datasetId = doc.querySelector("[data-listing-id]")?.getAttribute("data-listing-id");
  if (datasetId && /^\d{5,}$/.test(datasetId)) {
    return datasetId;
  }

  const bodyText = doc.body?.innerText || "";
  const inlineId = bodyText.match(/\b(?:listing|property)\s*id[:#]?\s*(\d{5,})\b/i)?.[1];
  if (inlineId) return inlineId;

  const fallbackCurrent = fallbackListingKeyFromUrl(url);
  if (fallbackCurrent) return fallbackCurrent;

  if (canonical) {
    const fallbackCanonical = fallbackListingKeyFromUrl(canonical);
    if (fallbackCanonical) return fallbackCanonical;
  }

  if (ogUrl) {
    const fallbackOg = fallbackListingKeyFromUrl(ogUrl);
    if (fallbackOg) return fallbackOg;
  }

  return null;
}

export function extractListingFromDocument(doc: Document, url: string): ListingData | null {
  const listingId = parseListingIdFromDocument(doc, url);
  if (!listingId) {
    return null;
  }

  const address =
    textFromSelectors(doc, [
      "[data-testid='listing-title']",
      "[data-testid='listing-address']",
      "h1"
    ]) || "Unknown Address";

  const bodyText = doc.body?.innerText || "";

  const priceText =
    textFromSelectors(doc, [
      "[data-testid='price']",
      "[data-testid='price-title']",
      "[class*='price']"
    ]) || bodyText.match(/\$[\d,]+/)?.[0] || "";

  const bedsText = bodyText.match(/(\d+(?:\.\d+)?)\s*bed/i)?.[1];
  const bathsText = bodyText.match(/(\d+(?:\.\d+)?)\s*bath/i)?.[1];
  const sqftText = bodyText.match(/([\d,]+)\s*(?:sq\.?\s*ft|square\s*feet)/i)?.[1];

  return {
    listingId,
    url,
    address,
    price: parseNumber(priceText),
    beds: parseNumber(bedsText),
    baths: parseNumber(bathsText),
    sqft: parseNumber(sqftText),
    building: textFromSelectors(doc, ["[data-testid='building-name']", "[class*='building']"]),
    lastSeenAt: new Date().toISOString()
  };
}

export function readPageContext(doc: Document): string {
  const main = doc.querySelector("main")?.textContent || doc.body?.innerText || "";
  return normalizeWhitespace(main).slice(0, 12000);
}
