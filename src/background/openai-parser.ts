import type { Confidence, EvaluationData } from "../shared/types";

type ParsedEval = Omit<EvaluationData, "listingId" | "snapshotHash" | "evaluatedAt">;
type FactorSet = {
  marketValueFit: number;
 sizeValueFit: number;
  costStability: number;
  locationValue: number;
};
type QualityFactorSet = {
  conditionAmenities: number;
  layoutLightNoise: number;
  buildingOperations: number;
  livabilityRisk: number;
};

function isConfidence(value: unknown): value is Confidence {
  return value === "low" || value === "medium" || value === "high";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeRiskFlag(item))
    .filter(Boolean)
    .slice(0, 10);
}

function normalizeRiskFlag(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asEvidence(value: unknown): ParsedEval["evidence"] {
  if (!value || typeof value !== "object") {
    return { price: "", quality: "", risks: "" };
  }
  const obj = value as Record<string, unknown>;
  return {
    price: asString(obj.price),
    quality: asString(obj.quality),
    risks: asString(obj.risks)
  };
}

function average(values: number[]): number {
  if (!values.length) return 50;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((v) => (v - mean) ** 2));
  return Math.sqrt(variance);
}

function asFactorSet(value: unknown): FactorSet | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  return {
    marketValueFit: asScore(obj.marketValueFit),
    sizeValueFit: asScore(obj.sizeValueFit),
    costStability: asScore(obj.costStability),
    locationValue: asScore(obj.locationValue)
  };
}

function asQualityFactorSet(value: unknown): QualityFactorSet | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  return {
    conditionAmenities: asScore(obj.conditionAmenities),
    layoutLightNoise: asScore(obj.layoutLightNoise),
    buildingOperations: asScore(obj.buildingOperations),
    livabilityRisk: asScore(obj.livabilityRisk)
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function centerSpread(score: number, confidence: Confidence, variability: number): number {
  const confidenceBoost = confidence === "high" ? 0.34 : confidence === "medium" ? 0.22 : 0.12;
  const variabilityBoost = Math.min(0.28, variability / 24);
  const spreadMultiplier = 1 + confidenceBoost + variabilityBoost;
  return 50 + (score - 50) * spreadMultiplier;
}

function deterministicNudge(score: number, seed: string): number {
  if (score % 5 !== 0) return score;
  let sum = 0;
  for (let i = 0; i < seed.length; i += 1) {
    sum += seed.charCodeAt(i);
  }
  const offsets = [-2, -1, 1, 2];
  const offset = offsets[sum % offsets.length];
  return clampScore(score + offset);
}

function finalScoreFromModel(
  reported: number,
  factors: number[],
  confidence: Confidence,
  riskFlags: string[],
  seed: string
): number {
  const factorAvg = average(factors);
  const blended = reported * 0.45 + factorAvg * 0.55;
  const variability = stddev([...factors, reported]);
  let score = centerSpread(blended, confidence, variability);
  if (riskFlags.length >= 3) score -= 2;
  if (riskFlags.length >= 5) score -= 2;
  return deterministicNudge(clampScore(score), seed);
}

export function extractResponseJsonText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid OpenAI response payload.");
  }

  const obj = payload as Record<string, unknown>;

  if (typeof obj.output_text === "string" && obj.output_text.trim()) {
    return obj.output_text;
  }

  const output = obj.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const rec = block as Record<string, unknown>;
        if (typeof rec.text === "string" && rec.text.trim()) {
          return rec.text;
        }
        if (rec.type === "output_text" && typeof rec.text === "string" && rec.text.trim()) {
          return rec.text;
        }
      }
    }
  }

  throw new Error("OpenAI response did not include output text.");
}

export function parseEvaluationFromUnknown(parsed: unknown): ParsedEval {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI output JSON is not an object.");
  }

  const obj = parsed as Record<string, unknown>;
  const confidence = isConfidence(obj.confidence) ? obj.confidence : "low";
  const riskFlags = asStringArray(obj.riskFlags);
  const summary = asString(obj.summary);
  const priceFactors = asFactorSet(obj.priceFactors);
  const qualityFactors = asQualityFactorSet(obj.qualityFactors);
  const reportedPrice = asScore(obj.priceScore);
  const reportedQuality = asScore(obj.qualityScore);

  const finalPriceScore = priceFactors
    ? finalScoreFromModel(
        reportedPrice,
        [
          priceFactors.marketValueFit,
          priceFactors.sizeValueFit,
          priceFactors.costStability,
          priceFactors.locationValue
        ],
        confidence,
        riskFlags,
        `${summary}:price`
      )
    : reportedPrice;

  const finalQualityScore = qualityFactors
    ? finalScoreFromModel(
        reportedQuality,
        [
          qualityFactors.conditionAmenities,
          qualityFactors.layoutLightNoise,
          qualityFactors.buildingOperations,
          qualityFactors.livabilityRisk
        ],
        confidence,
        riskFlags,
        `${summary}:quality`
      )
    : reportedQuality;

  return {
    priceScore: finalPriceScore,
    qualityScore: finalQualityScore,
    riskFlags,
    summary,
    confidence,
    evidence: asEvidence(obj.evidence)
  };
}
