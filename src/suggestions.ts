import type { CodeSuggestion } from "./types.js";

function removeAttribute(markup: string, name: string): string {
  return markup.replace(new RegExp(`\\s+${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "gi"), "");
}

function addAttribute(markup: string, tag: string, attribute: string): string {
  return markup.replace(new RegExp(`<${tag}\\b`, "i"), `<${tag} ${attribute}`);
}

function normalizedMarkup(markup: string): string {
  return markup.replace(/\r/g, "").trim();
}

function suggestion(
  title: string,
  before: string,
  after: string,
  rationale: string,
  alternatives?: string[],
): CodeSuggestion {
  return { title, before: normalizedMarkup(before), after: normalizedMarkup(after), rationale, reviewRequired: true, alternatives };
}

export function buildCodeSuggestion(ruleId: string, evidence: string): CodeSuggestion | undefined {
  const before = normalizedMarkup(evidence);

  switch (ruleId) {
    case "aria-required-parent": {
      let after = removeAttribute(before, "role");
      after = removeAttribute(after, "aria-setsize");
      after = removeAttribute(after, "aria-posinset");
      return suggestion(
        "Prefer native navigation semantics",
        before,
        after,
        "For ordinary website navigation, native buttons and links are usually more robust than ARIA menuitem semantics. This example removes the menu-only attributes that require a menu or menubar parent.",
        [
          "If this is intentionally an application-style menu, keep role=\"menuitem\" and implement the required menu or menubar parent plus the complete keyboard interaction pattern instead.",
        ],
      );
    }
    case "image-alt": {
      const after = addAttribute(before, "img", 'alt="[Describe the image purpose]"');
      return suggestion(
        "Add an author-approved image alternative",
        before,
        after,
        "Informative images need concise equivalent text. Replace the bracketed placeholder with wording based on the image's purpose in this page.",
        ["If the image is genuinely decorative and conveys no information, use alt=\"\" instead."],
      );
    }
    case "object-alt": {
      let after = addAttribute(before, "object", 'aria-label="[Describe the embedded content]"');
      after = after.replace(/><\/object>\s*$/i, `>\n  <a href="[Equivalent content URL]">View an accessible alternative</a>\n</object>`);
      return suggestion(
        "Name the embedded object and provide a fallback",
        before,
        after,
        "Embedded maps, SVGs, and documents need an accessible name and an equivalent fallback when their content is not otherwise available to assistive technology.",
        ["If the object is decorative, hide it from assistive technology instead of supplying a misleading name."],
      );
    }
    case "html-has-lang": {
      return suggestion(
        "Declare the page language",
        before,
        addAttribute(before, "html", 'lang="[Page language code]"'),
        "The language code controls pronunciation rules in screen readers. Replace the placeholder with the actual primary language, such as en or es.",
      );
    }
    case "button-name": {
      const after = before.replace(/>\s*<\/button>\s*$/i, ">[Describe the action]</button>");
      return suggestion(
        "Give the button a visible name",
        before,
        after === before ? addAttribute(before, "button", 'aria-label="[Describe the action]"') : after,
        "A visible action label benefits more users. Use aria-label only when a visible label is not practical.",
      );
    }
    case "link-name": {
      const after = before.replace(/>\s*<\/a>\s*$/i, ">[Describe the destination]</a>");
      return suggestion(
        "Add meaningful link text",
        before,
        after === before ? addAttribute(before, "a", 'aria-label="[Describe the destination]"') : after,
        "Link text should identify its purpose or destination without relying only on surrounding visual context.",
      );
    }
    case "form-label":
    case "label": {
      const id = before.match(/\sid=["']([^"']+)["']/i)?.[1] ?? "field-name";
      const control = /\sid=/i.test(before) ? before : addAttribute(before, before.match(/^<([a-z0-9-]+)/i)?.[1] ?? "input", `id="${id}"`);
      return suggestion(
        "Associate a visible label with the field",
        before,
        `<label for="${id}">[Field label]</label>\n${control}`,
        "The label's for value must exactly match the form control's unique id. Replace the placeholder with the field's visible purpose.",
      );
    }
    case "positive-tabindex": {
      return suggestion(
        "Restore the natural keyboard order",
        before,
        removeAttribute(before, "tabindex"),
        "Removing a positive tabindex lets keyboard focus follow DOM order. Reorder the markup if the DOM and visual sequence do not match.",
        ["Use tabindex=\"0\" only for a custom interactive element that must participate in the normal tab sequence."],
      );
    }
    case "empty-aria-labelledby": {
      return suggestion(
        "Remove the ineffective empty relationship",
        before,
        removeAttribute(before, "aria-labelledby"),
        "An empty aria-labelledby has no effect. Remove it unless valid labeling element IDs should be supplied.",
      );
    }
    case "empty-aria-describedby": {
      return suggestion(
        "Remove the ineffective empty relationship",
        before,
        removeAttribute(before, "aria-describedby"),
        "An empty aria-describedby has no effect. Remove it unless valid description element IDs should be supplied.",
      );
    }
    case "redundant-role": {
      return suggestion(
        "Use the native HTML semantics",
        before,
        removeAttribute(before, "role"),
        "The explicit role duplicates the element's native role and can be removed without changing its intended semantics.",
      );
    }
    case "duplicate-id": {
      const currentId = before.match(/\sid=["']([^"']+)["']/i)?.[1];
      const after = currentId ? before.replace(new RegExp(`(\\sid=["'])${currentId}(["'])`, "i"), `$1${currentId}-unique$2`) : before;
      return suggestion(
        "Assign a unique ID and update its references",
        before,
        after,
        "Every id must be unique. After renaming it, update matching for, href, aria-labelledby, aria-describedby, and other references.",
      );
    }
    case "color-contrast": {
      return suggestion(
        "Increase foreground/background contrast",
        before,
        `/* Example only — use colors from your design system */\n.affected-element {\n  color: #1c1c1c;\n  background-color: #f7f4ed;\n}`,
        "Adjust the actual CSS colors and verify the final computed contrast in every state. Normal text generally needs 4.5:1; large text generally needs 3:1.",
      );
    }
    case "document-title": {
      return suggestion(
        "Add a descriptive document title",
        before,
        `<head>\n  <title>[Unique page purpose] | [Site name]</title>\n</head>`,
        "Each page needs a concise, unique title that identifies both the page and its context within the site.",
      );
    }
    default:
      return undefined;
  }
}
