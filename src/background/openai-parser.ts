import type { Confidence, EvaluationData } from "../shared/types";

type ParsedEval = Omit<EvaluationData, "listingId" | "snapshotHash" | "evaluatedAt">;

function isConfidence(value: unknown): value is Confidence {
  return value === "low" || value === "medium" || value === "high";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 10);
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

  return {
    priceScore: asScore(obj.priceScore),
    qualityScore: asScore(obj.qualityScore),
    riskFlags: asStringArray(obj.riskFlags),
    summary: asString(obj.summary),
    confidence,
    evidence: asEvidence(obj.evidence)
  };
}
