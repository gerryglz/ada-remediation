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
  interactionState?: string;
  interactionTrigger?: string;
}

export interface FindingOccurrence {
  fingerprint: string;
  location: SourceLocation;
}

export type FindingComponentCategory =
  | "Header menu"
  | "Navigation menu"
  | "Header"
  | "Footer"
  | "Form"
  | "Table"
  | "Image or media"
  | "Interactive control"
  | "Page content";

export interface FindingComponent {
  key: string;
  category: FindingComponentCategory;
  name: string;
  selector?: string;
}

export interface SharedCorrection {
  text: string;
  appliesTo: number;
  findingFingerprints: string[];
}

export interface FindingGroup {
  id: string;
  kind?: "component" | "pattern";
  name: string;
  category: FindingComponentCategory | FindingIssueCategory;
  selector?: string;
  findingFingerprints: string[];
  pages: string[];
  sharedCorrections: SharedCorrection[];
  remediationPrompt?: string;
}

export interface VisualEvidence {
  dataUrl: string;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  highlightedSelector: string;
  description: string;
}

export interface RenderedHtmlContext {
  html: string;
  scope: "parent" | "element";
  truncated: boolean;
}

export interface CodeSuggestion {
  title: string;
  before: string;
  after: string;
  rationale: string;
  reviewRequired: boolean;
  alternatives?: string[];
}

export interface ContrastEvidence {
  foreground: string;
  background: string;
  ratio?: number;
  requiredRatio?: number;
  fontSize?: string;
  fontWeight?: string;
}

export interface RemediationGuidance {
  inspect: string[];
  change: string[];
  verify: string[];
}

export interface ManualCheck {
  id: string;
  category: string;
  title: string;
  description: string;
  wcagLevel: WcagLevel;
  wcag: string[];
  steps: string[];
  status: "todo";
}

export type ManualReviewStatus = "not-tested" | "pass" | "needs-attention" | "not-applicable";

export interface ManualTaskReview {
  status: ManualReviewStatus;
  notes: string;
}

export type FindingReviewDisposition = "unreviewed" | "action-required" | "accepted-risk" | "false-positive";

export interface FindingReview {
  disposition: FindingReviewDisposition;
  notes: string;
}

export interface ScanReview {
  manualTasks: Record<string, ManualTaskReview>;
  findings: Record<string, FindingReview>;
  notes: string;
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
  wcagLevel?: WcagLevel;
  wcag: string[];
  location: SourceLocation;
  evidence: string;
  renderedHtmlContext?: RenderedHtmlContext;
  explanation: string;
  impact: string;
  remediation: string;
  remediationGuidance?: RemediationGuidance;
  confidence: Confidence;
  kind: FindingKind;
  scope?: "page" | "common";
  componentCategory?: FindingComponentCategory;
  component?: FindingComponent;
  occurrences?: FindingOccurrence[];
  contrast?: ContrastEvidence;
  codeSuggestion?: CodeSuggestion;
  screenshot?: VisualEvidence;
  safeFix?: SafeFix;
  issueCategory?: FindingIssueCategory;
  remediationPrompt?: string;
}

export type FindingIssueCategory =
  | "ARIA"
  | "Color"
  | "Content"
  | "Forms"
  | "Keyboard"
  | "Language"
  | "Media"
  | "Motion"
  | "Navigation"
  | "Structure";

export interface ScanMetadata {
  scanner: "repository" | "url" | "site";
  target: string;
  startedAt: string;
  completedAt: string;
  toolVersion: string;
  pagesOrFilesScanned: number;
  findingOccurrences?: number;
  commonFindings?: number;
  interactionStatesScanned?: number;
  interactionStatesRequested?: boolean;
  wcagLevel?: WcagLevel;
  profile?: ScanProfile;
  incomplete?: Array<{ url: string; reason: string; stage?: "navigation" | "audit"; attempts?: number }>;
}

export interface ScanProfile {
  target: string;
  wcagLevel: WcagLevel;
  crawl: boolean;
  maxPages: number;
  captureScreenshots: boolean;
  interactionStates: boolean;
}

export interface ScanResult {
  schemaVersion: "1.0";
  metadata: ScanMetadata;
  findings: Finding[];
  findingGroups?: FindingGroup[];
  manualChecks: ManualCheck[];
  review?: ScanReview;
  notice: string;
}

export const LEGAL_NOTICE =
  "Automated results cannot certify ADA, WCAG, or Section 508 compliance and do not replace manual accessibility testing.";
