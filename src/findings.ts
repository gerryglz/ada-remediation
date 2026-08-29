import type { Finding, FindingOccurrence } from "./types.js";

function normalized(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function recurringKey(finding: Finding): string | undefined {
  if (!finding.location.url) return undefined;
  return [finding.ruleId, normalized(finding.location.selector), normalized(finding.evidence)].join("|");
}

function occurrence(finding: Finding): FindingOccurrence {
  return { fingerprint: finding.fingerprint, location: finding.location };
}

export function findingOccurrenceCount(finding: Finding): number {
  return finding.occurrences?.length ?? 1;
}

export function affectedPageCount(finding: Finding): number {
  const urls = (finding.occurrences ?? [occurrence(finding)]).map((item) => item.location.url).filter(Boolean);
  return new Set(urls).size;
}

export function consolidateCommonFindings(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>();
  const order: string[] = [];

  findings.forEach((finding, index) => {
    const key = recurringKey(finding) ?? `single:${index}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(finding);
  });

  return order.flatMap((key) => {
    const group = groups.get(key)!;
    const distinctPages = new Set(group.map((finding) => finding.location.url).filter(Boolean));
    if (distinctPages.size < 2) return group;
    const first = group[0];
    return [{ ...first, scope: "common" as const, occurrences: group.map(occurrence) }];
  });
}
