export type Confidence = "low" | "medium" | "high";
export type RetentionDays = 30 | 90 | 120 | 180;

export interface ListingData {
  listingId: string;
  url: string;
  address: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  building?: string;
  lastSeenAt: string;
}

export interface ActivityData {
  listingId: string;
  viewedAt: string[];
  contactedAt: string[];
  status: "viewed" | "contacted";
  notes?: string;
}

export interface EvaluationData {
  listingId: string;
  snapshotHash: string;
  priceScore: number;
  qualityScore: number;
  riskFlags: string[];
  summary: string;
  confidence: Confidence;
  evidence: {
    price: string;
    quality: string;
    risks: string;
  };
  evaluatedAt: string;
}

export interface UserSettings {
  openaiApiKey: string;
  model: string;
  reportMode: "fast" | "detailed";
  riskPriorities: string[];
  retentionDays: RetentionDays;
}

export interface PublicSettings {
  hasApiKey: boolean;
  model: string;
  reportMode: "fast" | "detailed";
  riskPriorities: string[];
  retentionDays: RetentionDays;
}

export interface StoreState {
  schemaVersion: number;
  listingsById: Record<string, ListingData>;
  activityById: Record<string, ActivityData>;
  evaluationsBySnapshotKey: Record<string, EvaluationData>;
  settings: UserSettings;
  lastRetentionCleanupAt: string | null;
}
