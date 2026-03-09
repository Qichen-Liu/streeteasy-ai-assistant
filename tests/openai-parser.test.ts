import test from "node:test";
import assert from "node:assert/strict";

import { extractResponseJsonText, parseEvaluationFromUnknown } from "../src/background/openai-parser";

test("extractResponseJsonText prefers output_text when present", () => {
  const text = extractResponseJsonText({ output_text: '{"priceScore":90}' });
  assert.equal(text, '{"priceScore":90}');
});

test("extractResponseJsonText supports nested output content", () => {
  const payload = {
    output: [
      {
        content: [{ type: "output_text", text: '{"priceScore":70}' }]
      }
    ]
  };
  const text = extractResponseJsonText(payload);
  assert.equal(text, '{"priceScore":70}');
});

test("parseEvaluationFromUnknown coerces defaults safely", () => {
  const parsed = parseEvaluationFromUnknown({
    priceScore: "88",
    qualityScore: 105,
    riskFlags: ["price_above_typical_for_area", 123, "partial-doorman-service", "  noisy_street  "],
    summary: "Solid listing",
    confidence: "medium",
    evidence: { price: "below median", quality: "new kitchen", risks: "ask fee" }
  });

  assert.equal(parsed.priceScore, 88);
  assert.equal(parsed.qualityScore, 100);
  assert.deepEqual(parsed.riskFlags, [
    "price above typical for area",
    "partial doorman service",
    "noisy street"
  ]);
  assert.equal(parsed.confidence, "medium");
});
