import test from "node:test";
import assert from "node:assert/strict";

import {
  fallbackListingKeyFromUrl,
  isLikelyListingPath,
  parseListingIdFromPath,
  parseListingIdFromUrl,
  parseNumber
} from "../src/shared/listing";

test("isLikelyListingPath detects listing routes", () => {
  assert.equal(isLikelyListingPath("/rental/12345"), true);
  assert.equal(isLikelyListingPath("/rentals/23456"), true);
  assert.equal(isLikelyListingPath("/building/98765"), true);
  assert.equal(isLikelyListingPath("/blog/market-trends"), false);
});

test("parseListingIdFromPath extracts ids robustly", () => {
  assert.equal(parseListingIdFromPath("/rental/12345"), "12345");
  assert.equal(parseListingIdFromPath("/some/path/999999"), "999999");
  assert.equal(parseListingIdFromPath("/rental/no-id"), null);
});

test("parseListingIdFromUrl checks path and query candidates", () => {
  assert.equal(parseListingIdFromUrl("https://streeteasy.com/rental/7654321"), "7654321");
  assert.equal(parseListingIdFromUrl("https://streeteasy.com/foo?listingId=888888"), "888888");
  assert.equal(parseListingIdFromUrl("https://streeteasy.com/foo?x=1"), null);
});

test("fallbackListingKeyFromUrl creates stable key for non-numeric listing paths", () => {
  assert.equal(
    fallbackListingKeyFromUrl("https://streeteasy.com/building/rego-park/unit-5c"),
    "url:/building/rego-park/unit-5c"
  );
  assert.equal(
    fallbackListingKeyFromUrl("https://streeteasy.com/rentals/manhattan?utm_source=x&page=2"),
    "url:/rentals/manhattan"
  );
  assert.equal(
    fallbackListingKeyFromUrl("https://streeteasy.com/rentals/manhattan?page=3"),
    "url:/rentals/manhattan"
  );
  assert.equal(
    fallbackListingKeyFromUrl("https://streeteasy.com/rentals/manhattan?unitId=12j&utm_source=x"),
    "url:/rentals/manhattan?unitId=12j"
  );
  assert.equal(fallbackListingKeyFromUrl("https://streeteasy.com/blog/market-trends"), null);
});

test("parseNumber handles currency and decimals", () => {
  assert.equal(parseNumber("$4,350"), 4350);
  assert.equal(parseNumber("1.5"), 1.5);
  assert.equal(parseNumber(undefined), undefined);
});
