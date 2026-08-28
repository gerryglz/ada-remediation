export type Severity = "critical" | "serious" | "moderate" | "minor";
export type Confidence = "high" | "medium" | "low";
export type FindingKind = "automatic" | "manual-review";
export type WcagLevel = "A" | "AA" | "AAA";

export interface SourceLocation {
  file?: string;
  url?: string;
  pageTitle?: string;
  line?: number;
  column?: number;
  selector?: string;
}

export interface VisualEvidence {
  dataUrl: string;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  highlightedSelector: string;
  description: string;
}

export interface CodeSuggestion {
  title: string;
  before: string;
  after: string;
  rationale: string;
  reviewRequired: boolean;
  alternatives?: string[];
}

export type FixKind =
  | "remove-empty-aria-labelledby"
  | "remove-empty-aria-describedby"
  | "remove-redundant-role";

export interface SafeFix {
  kind: FixKind;
  description: string;
  attribute: string;
  expectedValue: string;
}

export interface Finding {
  fingerprint: string;
  ruleId: string;
  helpUrl?: string;
  title: string;
  severity: Severity;
  wcag: string[];
  location: SourceLocation;
  evidence: string;
  explanation: string;
  impact: string;
  remediation: string;
  confidence: Confidence;
  kind: FindingKind;
  codeSuggestion?: CodeSuggestion;
  screenshot?: VisualEvidence;
  safeFix?: SafeFix;
}

export interface ScanMetadata {
  scanner: "repository" | "url" | "site";
  target: string;
  startedAt: string;
  completedAt: string;
  toolVersion: string;
  pagesOrFilesScanned: number;
  wcagLevel?: WcagLevel;
  incomplete?: Array<{ url: string; reason: string }>;
}

export interface ScanResult {
  schemaVersion: "1.0";
  metadata: ScanMetadata;
  findings: Finding[];
  notice: string;
}

export const LEGAL_NOTICE =
  "Automated results cannot certify ADA, WCAG, or Section 508 compliance and do not replace manual accessibility testing.";
