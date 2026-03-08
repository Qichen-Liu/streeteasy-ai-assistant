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

export function extractListingFromDocument(doc: Document, url: string): ListingData | null {
  const urlObj = new URL(url);
  const listingId = parseListingIdFromPath(urlObj.pathname);
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
