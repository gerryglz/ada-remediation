import { parseFragment, serializeOuter } from "parse5";

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  childNodes?: HtmlNode[];
}

const inlineElements = new Set([
  "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "del", "dfn", "em", "i", "img", "ins", "kbd", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr",
]);

const preserveContents = new Set(["pre", "script", "style", "textarea"]);

function openingTag(html: string): string {
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return html.slice(0, index + 1);
    }
  }
  return html;
}

function isInlineContent(node: HtmlNode): boolean {
  if (node.nodeName === "#text") return true;
  if (!node.tagName || !inlineElements.has(node.tagName)) return false;
  return (node.childNodes ?? []).every(isInlineContent);
}

function formatNode(node: HtmlNode, depth: number): string | undefined {
  const indentation = "  ".repeat(depth);
  const serialized = serializeOuter(node as never).trim();
  if (!serialized) return undefined;
  if (!node.tagName) return `${indentation}${serialized}`;

  const children = (node.childNodes ?? []).filter((child) => child.nodeName !== "#text" || serializeOuter(child as never).trim());
  if (!children.length || preserveContents.has(node.tagName) || children.every(isInlineContent)) {
    return `${indentation}${serialized}`;
  }

  const formattedChildren = children.map((child) => formatNode(child, depth + 1)).filter((child): child is string => Boolean(child));
  if (!formattedChildren.length) return `${indentation}${serialized}`;
  return [`${indentation}${openingTag(serialized)}`, ...formattedChildren, `${indentation}</${node.tagName}>`].join("\n");
}

export function formatHtmlSnippet(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return html;
  try {
    const fragment = parseFragment(trimmed) as unknown as { childNodes: HtmlNode[] };
    return fragment.childNodes.map((node) => formatNode(node, 0)).filter((node): node is string => Boolean(node)).join("\n");
  } catch {
    return trimmed;
  }
}
