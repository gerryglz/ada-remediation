import type { Finding, FindingComponentCategory, FindingOccurrence } from "./types.js";

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

export function findingComponentCategory(finding: Finding): FindingComponentCategory {
  const context = normalized([
    finding.ruleId,
    finding.title,
    finding.location.selector,
    finding.evidence,
  ].join(" ")).toLowerCase();

  if (/<nav\b|\b(?:navigation|navbar|menubar|menuitem|menu|js-top-level)\b/.test(context)) return "Navigation menu";
  if (/<header\b|\b(?:site-header|masthead|banner)\b/.test(context)) return "Header";
  if (/<footer\b|\b(?:site-footer|contentinfo)\b/.test(context)) return "Footer";
  if (/<(?:form|input|select|textarea|label|fieldset)\b|\bform\b/.test(context)) return "Form";
  if (/<(?:table|thead|tbody|tr|th|td)\b|\btable\b/.test(context)) return "Table";
  if (/<(?:img|picture|video|audio|object|svg)\b|\b(?:image|media|video|audio)\b/.test(context)) return "Image or media";
  if (/<(?:button|a)\b|\b(?:button|link|control)\b/.test(context)) return "Interactive control";
  return "Page content";
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
    return [{
      ...first,
      scope: "common" as const,
      componentCategory: findingComponentCategory(first),
      occurrences: group.map(occurrence),
    }];
  });
}
