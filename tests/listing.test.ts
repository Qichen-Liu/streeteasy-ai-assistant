import test from "node:test";
import assert from "node:assert/strict";

import { isLikelyListingPath, parseListingIdFromPath, parseNumber } from "../src/shared/listing";

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

test("parseNumber handles currency and decimals", () => {
  assert.equal(parseNumber("$4,350"), 4350);
  assert.equal(parseNumber("1.5"), 1.5);
  assert.equal(parseNumber(undefined), undefined);
});
