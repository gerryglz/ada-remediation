import type { Finding, FindingComponentCategory, FindingGroup, FindingOccurrence } from "./types.js";
import { buildGroupRemediationPrompt, findingRemediationTheme } from "./guidance.js";

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

  if ((/<header\b|\b(?:site-header|masthead|banner)\b/.test(context)) && (/<nav\b|\b(?:navigation|navbar|menubar|menuitem|menu|js-top-level)\b/.test(context))) return "Header menu";
  if (/<nav\b|\b(?:navigation|navbar|menubar|menuitem|menu|js-top-level)\b/.test(context)) return "Navigation menu";
  if (/<header\b|\b(?:site-header|masthead|banner)\b/.test(context)) return "Header";
  if (/<footer\b|\b(?:site-footer|contentinfo)\b/.test(context)) return "Footer";
  if (/<(?:form|input|select|textarea|label|fieldset)\b|\bform\b/.test(context)) return "Form";
  if (/<(?:table|thead|tbody|tr|th|td)\b|\btable\b/.test(context)) return "Table";
  if (/<(?:img|picture|video|audio|object|svg)\b|\b(?:image|media|video|audio)\b/.test(context)) return "Image or media";
  if (/<(?:button|a)\b|\b(?:button|link|control)\b/.test(context)) return "Interactive control";
  return "Page content";
}

function findingPages(finding: Finding): string[] {
  return (finding.occurrences ?? [occurrence(finding)])
    .map((item) => item.location.url)
    .filter((url): url is string => Boolean(url));
}

function groupCorrections(findings: Finding[]): FindingGroup["sharedCorrections"] {
  const corrections = new Map<string, { text: string; fingerprints: Set<string> }>();
  for (const finding of findings) {
    const guidance = finding.remediationGuidance?.change.length
      ? finding.remediationGuidance.change
      : [finding.remediation];
    for (const text of new Set(guidance.map((item) => normalized(item)).filter(Boolean))) {
      const key = text.toLowerCase();
      const entry = corrections.get(key) ?? { text, fingerprints: new Set<string>() };
      entry.fingerprints.add(finding.fingerprint);
      corrections.set(key, entry);
    }
  }
  return [...corrections.values()]
    .filter((entry) => entry.fingerprints.size > 1)
    .map((entry) => ({
      text: entry.text,
      appliesTo: entry.fingerprints.size,
      findingFingerprints: [...entry.fingerprints],
    }))
    .sort((a, b) => b.appliesTo - a.appliesTo || a.text.localeCompare(b.text));
}

export function buildFindingGroups(findings: Finding[]): FindingGroup[] {
  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) {
    if (!finding.component) continue;
    const group = grouped.get(finding.component.key) ?? [];
    group.push(finding);
    grouped.set(finding.component.key, group);
  }

  const componentGroups = [...grouped.entries()].flatMap(([key, members], index) => {
    if (members.length < 2) return [];
    const component = members[0].component!;
    const group: FindingGroup = {
      id: `component-${index + 1}-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)}`,
      kind: "component",
      name: component.name,
      category: component.category,
      ...(component.selector ? { selector: component.selector } : {}),
      findingFingerprints: members.map((finding) => finding.fingerprint),
      pages: [...new Set(members.flatMap(findingPages))],
      sharedCorrections: groupCorrections(members),
    };
    group.remediationPrompt = buildGroupRemediationPrompt(group, members);
    return [group];
  });

  const componentFingerprints = new Set(componentGroups.flatMap((group) => group.findingFingerprints));
  const patterns = new Map<string, { name: string; category: ReturnType<typeof findingRemediationTheme>["category"]; members: Finding[] }>();
  for (const finding of findings) {
    if (componentFingerprints.has(finding.fingerprint)) continue;
    const theme = findingRemediationTheme(finding);
    const pattern = patterns.get(theme.key) ?? { name: theme.name, category: theme.category, members: [] };
    pattern.members.push(finding);
    patterns.set(theme.key, pattern);
  }
  const patternGroups = [...patterns.entries()].flatMap(([key, pattern], index) => {
    if (pattern.members.length < 2) return [];
    const group: FindingGroup = {
      id: `pattern-${index + 1}-${key}`,
      kind: "pattern",
      name: pattern.name,
      category: pattern.category,
      findingFingerprints: pattern.members.map((finding) => finding.fingerprint),
      pages: [...new Set(pattern.members.flatMap(findingPages))],
      sharedCorrections: groupCorrections(pattern.members),
    };
    group.remediationPrompt = buildGroupRemediationPrompt(group, pattern.members);
    return [group];
  });

  return [...componentGroups, ...patternGroups];
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
      componentCategory: first.component?.category ?? first.componentCategory ?? findingComponentCategory(first),
      occurrences: group.map(occurrence),
    }];
  });
}
