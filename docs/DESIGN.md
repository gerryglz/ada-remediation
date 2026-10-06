# Design System Inspired by Lovable

## 1. Visual Theme & Atmosphere

Lovable's website radiates warmth through restraint. The entire page sits on a creamy, parchment-toned background (`#f7f4ed`) that immediately separates it from the cold-white conventions of most developer tool sites. This isn't minimalism for minimalism's sake — it's a deliberate choice to feel approachable, almost analog, like a well-crafted notebook. The near-black text (`#1c1c1c`) against this warm cream creates a contrast ratio that's easy on the eyes while maintaining sharp readability.

The custom Camera Plain Variable typeface is the system's secret weapon. Unlike geometric sans-serifs that signal "tech company," Camera Plain has a humanist warmth — slightly rounded terminals, organic curves, and a comfortable reading rhythm. At display sizes (48px–60px), weight 600 with aggressive negative letter-spacing (-0.9px to -1.5px) compresses headlines into confident, editorial statements. The font uses `ui-sans-serif, system-ui` as fallbacks, acknowledging that the custom typeface carries the brand personality.

What makes Lovable's visual system distinctive is its opacity-driven depth model. Rather than using a traditional gray scale, the system modulates `#1c1c1c` at varying opacities (0.03, 0.04, 0.4, 0.82–0.83) to create a unified tonal range. Every shade of gray on the page is technically the same hue — just more or less transparent. This creates a visual coherence that's nearly impossible to achieve with arbitrary hex values. The border system follows suit: `1px solid #eceae4` for light divisions and `1px solid rgba(28, 28, 28, 0.4)` for stronger interactive boundaries.

**Key Characteristics:**
- Warm parchment background (`#f7f4ed`) — not white, not beige, a deliberate cream that feels hand-selected
- Camera Plain Variable typeface with humanist warmth and editorial letter-spacing at display sizes
- Opacity-driven color system: all grays derived from `#1c1c1c` at varying transparency levels
- Inset shadow technique on buttons: `rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset`
- Warm neutral border palette: `#eceae4` for subtle, `rgba(28,28,28,0.4)` for interactive elements
- Full-pill radius (`9999px`) used extensively for action buttons and icon containers
- Focus state uses `rgba(0,0,0,0.1) 0px 4px 12px` shadow for soft, warm emphasis
- shadcn/ui + Radix UI component primitives with Tailwind CSS utility styling

## 2. Color Palette & Roles

### Primary
- **Cream** (`#f7f4ed`): Page background, card surfaces, button surfaces. The foundation — warm, paper-like, human.
- **Charcoal** (`#1c1c1c`): Primary text, headings, dark button backgrounds. Not pure black — organic warmth.
- **Off-White** (`#fcfbf8`): Button text on dark backgrounds, subtle highlight. Barely distinguishable from pure white.

### Neutral Scale (Opacity-Based)
- **Charcoal 100%** (`#1c1c1c`): Primary text, headings, dark surfaces.
- **Charcoal 83%** (`rgba(28,28,28,0.83)`): Strong secondary text.
- **Charcoal 82%** (`rgba(28,28,28,0.82)`): Body copy.
- **Muted Gray** (`#5f5f5d`): Secondary text, descriptions, captions.
- **Charcoal 40%** (`rgba(28,28,28,0.4)`): Interactive borders, button outlines.
- **Charcoal 4%** (`rgba(28,28,28,0.04)`): Subtle hover backgrounds, micro-tints.
- **Charcoal 3%** (`rgba(28,28,28,0.03)`): Barely-visible overlays, background depth.

### Surface & Border
- **Light Cream** (`#eceae4`): Card borders, dividers, image outlines. The warm divider line.
- **Cream Surface** (`#f7f4ed`): Card backgrounds, section fills — same as page background for seamless integration.

### Interactive
- **Ring Blue** (`#3b82f6` at 50% opacity): `--tw-ring-color`, Tailwind focus ring.
- **Focus Shadow** (`rgba(0,0,0,0.1) 0px 4px 12px`): Focus and active state shadow — soft, warm, diffused.

### Dashboard accents
Severity is the only color-coded attribute in the dashboard and the HTML report. Each color appears as an 8px dot in the sidebar and index, and as one solid pill with `#fcfbf8` text in the detail header, always next to the severity name in text.
- **Plum** (`#ab307e`): Critical.
- **Burnt Orange** (`#9a4e12`): Serious.
- **Blue** (`#2f5bb7`): Moderate, and the focus ring.
- **Gray** (`#6b6b68`): Minor.

Do not introduce further accent colors, badges, tinted cards, or gradient dividers. WCAG level, issue category, component type, review disposition, comparison status, manual outcome, and counts are plain text metadata.

### Inset Shadows
- **Button Inset** (`rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px`): The signature multi-layer inset shadow on dark buttons.

## 3. Typography Rules

### Font Family
- **Primary**: `Camera Plain Variable`, with fallbacks: `ui-sans-serif, system-ui`
- **Weight range**: 400 (body/reading), 480 (special display), 600 (headings/emphasis)
- **Feature**: Variable font with continuous weight axis — allows fine-tuned intermediary weights like 480.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Camera Plain Variable | 60px (3.75rem) | 600 | 1.00–1.10 (tight) | -1.5px | Maximum impact, editorial |
| Display Alt | Camera Plain Variable | 60px (3.75rem) | 480 | 1.00 (tight) | normal | Lighter hero variant |
| Section Heading | Camera Plain Variable | 48px (3.00rem) | 600 | 1.00 (tight) | -1.2px | Feature section titles |
| Sub-heading | Camera Plain Variable | 36px (2.25rem) | 600 | 1.10 (tight) | -0.9px | Sub-sections |
| Card Title | Camera Plain Variable | 20px (1.25rem) | 400 | 1.25 (tight) | normal | Card headings |
| Body Large | Camera Plain Variable | 18px (1.13rem) | 400 | 1.38 | normal | Introductions |
| Body | Camera Plain Variable | 16px (1.00rem) | 400 | 1.50 | normal | Standard reading text |
| Button | Camera Plain Variable | 16px (1.00rem) | 400 | 1.50 | normal | Button labels |
| Button Small | Camera Plain Variable | 14px (0.88rem) | 400 | 1.50 | normal | Compact buttons |
| Link | Camera Plain Variable | 16px (1.00rem) | 400 | 1.50 | normal | Underline decoration |
| Link Small | Camera Plain Variable | 14px (0.88rem) | 400 | 1.50 | normal | Footer links |
| Caption | Camera Plain Variable | 14px (0.88rem) | 400 | 1.50 | normal | Metadata, small text |

### Principles
- **Warm humanist voice**: Camera Plain Variable gives Lovable its approachable personality. The slightly rounded terminals and organic curves contrast with the sharp geometric sans-serifs used by most developer tools.
- **Variable weight as design tool**: The font supports continuous weight values (e.g., 480), enabling nuanced hierarchy beyond standard weight stops. Weight 480 at 60px creates a display style that feels lighter than semibold but stronger than regular.
- **Compression at scale**: Headlines use negative letter-spacing (-0.9px to -1.5px) for editorial impact. Body text stays at normal tracking for comfortable reading.
- **Two weights, clear roles**: 400 (body/UI/links/buttons) and 600 (headings/emphasis). The narrow weight range creates hierarchy through size and spacing, not weight variation.

## 4. Component Stylings

### Buttons

**Primary Dark (Inset Shadow)**
- Background: `#1c1c1c`
- Text: `#fcfbf8`
- Padding: 8px 16px
- Radius: 6px
- Shadow: `rgba(0,0,0,0) 0px 0px 0px 0px, rgba(0,0,0,0) 0px 0px 0px 0px, rgba(255,255,255,0.2) 0px 0.5px 0px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px 0px`
- Active: opacity 0.8
- Focus: `rgba(0,0,0,0.1) 0px 4px 12px` shadow
- Use: Primary CTA ("Start Building", "Get Started")

**Ghost / Outline**
- Background: transparent
- Text: `#1c1c1c`
- Padding: 8px 16px
- Radius: 6px
- Border: `1px solid rgba(28,28,28,0.4)`
- Active: opacity 0.8
- Focus: `rgba(0,0,0,0.1) 0px 4px 12px` shadow
- Use: Secondary actions ("Log In", "Documentation")

**Cream Surface**
- Background: `#f7f4ed`
- Text: `#1c1c1c`
- Padding: 8px 16px
- Radius: 6px
- No border
- Active: opacity 0.8
- Use: Tertiary actions, toolbar buttons

**Pill / Icon Button**
- Background: `#f7f4ed`
- Text: `#1c1c1c`
- Radius: 9999px (full pill)
- Shadow: same inset pattern as primary dark
- Opacity: 0.5 (default), 0.8 (active)
- Use: Additional actions, plan mode toggle, voice recording

### Cards & Containers
- Background: `#f7f4ed` (matches page)
- Border: `1px solid #eceae4`
- Radius: 12px (standard), 16px (featured), 8px (compact)
- No box-shadow by default — borders define boundaries
- Image cards: `1px solid #eceae4` with 12px radius

### Inputs & Forms
- Background: `#f7f4ed`
- Text: `#1c1c1c`
- Border: `1px solid #eceae4`
- Radius: 6px
- Focus: ring blue (`rgba(59,130,246,0.5)`) outline
- Placeholder: `#5f5f5d`

### Navigation
- Clean horizontal nav on cream background, fixed
- Logo/wordmark left-aligned (128.75 x 22px)
- Links: Camera Plain 14–16px weight 400, `#1c1c1c` text
- CTA: dark button with inset shadow, 6px radius
- Mobile: hamburger menu with 6px radius button
- Subtle border or no border on scroll

### Links
- Color: `#1c1c1c`
- Decoration: underline (default)
- Hover: primary accent (via CSS variable `hsl(var(--primary))`)
- No color change on hover — decoration carries the interactive signal

### Image Treatment
- Showcase/portfolio images with `1px solid #eceae4` border
- Consistent 12px border radius on all image containers
- Soft gradient backgrounds behind hero content (warm multi-color wash)
- Gallery-style presentation for template/project showcases

### Distinctive Components

**AI Chat Input**
- Large prompt input area with soft borders
- Suggestion pills with `#eceae4` borders
- Voice recording / plan mode toggle buttons as pill shapes (9999px)
- Warm, inviting input area — not clinical

**Template Gallery**
- Card grid showing project templates
- Each card: image + title, `1px solid #eceae4` border, 12px radius
- Hover: subtle shadow or border darkening
- Category labels as text links

**Stats Bar**
- Large metrics: "0M+" pattern in 48px+ weight 600
- Descriptive text below in muted gray
- Horizontal layout with generous spacing

## 5. Layout Principles

### Application Workspace
- The audit dashboard uses the full browser viewport instead of a centered marketing-page container.
- A 48px application header holds the product name, the **Scan history** action, and the scan-controls toggle. Before the first scan, an empty state under the scan form says that everything runs on this computer.
- The scan toolbar is one row for the URL, WCAG target, and scan action, with the scan options on a second row. The storage-state path field appears only while **Use authenticated session** is checked. It collapses automatically after a successful scan and remains recoverable through the clearly labeled **Show scan controls** button.
- Results open with one results bar: target URL, WCAG target, totals, review actions, and exports. Totals are one line of text, not metric tiles; interactive-state and run-comparison counts join that line only when they apply. Severity, disposition, and manual-status counts belong to the sidebar filters. The automated-testing limitation sits at the foot of the sidebar, always visible without competing with findings.
- The application header includes a compact **Scan history** action. History opens in a bounded modal grouped by website origin, with explicit Open and Delete actions and a visible local storage path. Deletion text must explain that reports, screenshots, manual progress, and notes are removed together.
- The local dashboard is single-instance by default. Its runtime record identifies the exact server and carries a private shutdown token so `npm run ui:stop` can release the port without terminating unrelated processes. Controlled shutdown removes the runtime record, and any stale record left by an abrupt terminal termination is cleaned by the next start or stop command.
- When a scan finishes or a saved run opens, the scan form collapses and keyboard focus moves to the results. Anything the reviewer must know about the run, including a failure to save it to history, is shown with the results and never only in the collapsed scan form. The scan action reads **Scan site** while crawling is on and **Scan page** otherwise.
- There is no save button: dispositions and outcomes save when chosen, and notes save when their field loses focus. A status in the results bar reads **Unsaved changes**, **Saving…**, **Saved locally**, or the reason a save failed.
- A saved run adds a **Notes and comparison** disclosure to the results bar. The disclosure holds the earlier-run selector, the reviewer note, the saved scan profile, and the list of findings resolved since the compared run. It starts open only when the run already has a note. Do not make history controls compete with the finding workspace.
- Comparison status is plain text. The results bar gives the new, existing, and resolved totals; a sidebar row says **New** when it applies; the detail header names the status of the selected item. Resolved items are listed inside **Notes and comparison** and must never appear as current failures.
- Manual outcomes and reviewer notes belong to a specific saved run. Every task uses one of four explicit states: **Not tested**, **Pass**, **Needs attention**, or **Not applicable**, with optional task-specific evidence. Reopening a run restores them. The UI must expose unsaved and saved note states and must not imply that the data is synchronized to a cloud service.
- Review dispositions are a row of chips under the detail header, with reviewer notes in a disclosure that starts open only when a note exists. Changing a disposition keeps open sections, scroll position, and keyboard focus where they were.
- The downloadable HTML report uses the same style sheet and structure as the dashboard: totals line, filter chips with counts, an index of dot rows, components and issue patterns, one card per finding with the same visible and collapsed sections, and the manual review record. Collapsed sections open automatically for printing.
- Every modal dialog has an explicit accessible name and returns focus to its invoking control when closed. All scrollable code and AI-prompt regions participate in the keyboard tab order so keyboard users can inspect content hidden beyond their visible bounds.
- Pull-request CI audits the dashboard's empty, progress, results, expanded-finding, manual, history, error, responsive, and downloadable-report states with axe-core. Keyboard and reflow assertions supplement automated rules. Treat this as a regression gate, never as a claim of WCAG conformance.
- Report totals distinguish **Unique findings** from **Occurrences**. Consolidating repeated shared-component issues must never make their site-wide footprint disappear from the summary.
- A finding repeated with the same automated rule, selector, and detected markup on multiple tested URLs shows its page count in the metadata line and an **Affected pages** section linking every URL. Recurring describes only the tested page set and must not be presented as proof that the issue exists on every site page.
- When multiple distinct findings share a detected semantic owner, list one row under **Components**. For remaining findings, identify concrete remediation themes such as **Color contrast**, **ARIA relationships**, **Accessible names and labels**, **Heading structure**, and **Keyboard and focus**; list a theme under **Issue patterns** only when at least two findings share it. Do not create a generic catch-all group. Do not prefix finding titles with positional numbers. Grouping is navigational and must not reduce finding or occurrence totals.
- Components, issue patterns, and individual findings share the same scroll region; do not pin a section over finding content. A sidebar row is a severity marker, the title, and one line of grey text metadata: severity, WCAG level, issue category, comparison and review status when set, page count, revealed interaction state, and selector. Do not add badges to rows. Component and pattern rows use a square marker colored by their worst child severity, and that severity is named first in the metadata line so color never carries it alone.
- Selecting a component or pattern shows its header, the review control for all of its findings, corrections that apply to at least two findings, and then each **issue set** as a native disclosure. An issue set combines findings with the same rule, failed condition, and likely owner. It states the failed condition and the fix once, then lists each affected element as a compact, non-expanding row holding only what differs: screenshot thumbnail, selector, markup, page link, and that element's review disposition. A single issue set starts open.
- For `aria-required-parent`, capture the nearest rendered container that directly owns multiple failing menu items when it can be identified. Show its selector, opening tag, current role, and scanner-reported expected roles. Guidance must distinguish ordinary website navigation from an intentional application menu and must never imply that adding a role to an arbitrary broad wrapper is sufficient.
- Every standalone finding has one **AI remediation prompt** in a collapsed section and a **Copy AI prompt** button in the header. A component or pattern has one **Combined AI remediation prompt** covering every child; do not repeat prompts per element. Prompts must instruct the agent to identify the unknown framework/CMS/component source before editing it, appear in the downloadable HTML report, and never substitute for human review or retesting.
- The detail pane is fix-first. The location, **Failed condition**, **What to change**, contrast evidence, **Rendered HTML context**, and screenshot are always visible. Supporting material (what to inspect, why it was flagged, affected pages, verification, references, and the AI prompt) sits in collapsed native disclosure sections. State each fact once; do not repeat the failed condition in other sections. Rendered HTML context shows the affected element's captured parent HTML, or the element itself with an explicit truncation label, and says that it is browser output and not a generated replacement block. Do not present fabricated before/after replacement blocks.
- Incomplete-page notices identify the failed scan stage and attempt count so a reviewer can distinguish navigation failures from axe audit failures without reading console output. PDFs and obvious media/download URLs are intentionally excluded from the HTML crawl and appear in a separate collapsed **Skipped non-HTML assets** list; they are never presented as failed HTML pages.
- The remaining height belongs to a persistent two-pane review workspace: a 340px sidebar on the left and a flexible selected-finding detail pane on the right.
- The sidebar begins with a segmented control for **Automated findings** and **Manual review**. Each shows its count: total findings, and reviewed manual tasks out of all tasks. Filters are chips that carry their own counts. Omit values with no items, and hide a whole row (WCAG level, review disposition) when it offers fewer than two values. Re-rendering after a filter or row selection keeps keyboard focus on the same control. Manual task rows name their outcome in text and can be filtered by outcome.
- **Scan interactive states** is an opt-in setting because it activates target-page controls. It uses conservative disclosure, tab, dialog, and single-step carousel recipes with explicit ARIA relationships and a reversible state. A carousel is eligible only when it has one stable visible slide, explicit slide semantics, unique Next and Previous controls, and no detected automatic-rotation control; its exact starting slide state must be restored after the audit. The results bar shows states opened and states skipped; every newly exposed finding identifies the interaction type, human-readable state name, and technical trigger selector in a **Revealed interaction state** line under its location.
- Manual tasks remain visually and semantically separate from detected failures. Each task shows its category, target level, test procedure, W3C references, outcome controls, evidence notes, and status totals. Saved JSON and HTML reports include this review record.
- Automated contrast findings show foreground and background swatches with the measured ratio, required ratio, and font data. Suggested colors remain design-token placeholders until a reviewer approves actual values.
- The finding queue and selected-finding detail pane scroll independently. Changing the selected finding resets the detail pane to its beginning without losing the queue position.
- On pointer devices, every custom interactive control has a visible hover response: buttons and sidebar rows gain a neutral tint, filter chips darken their border, and text links thicken their underline. Hover supplements the keyboard focus ring and never moves the control. Transitions are disabled under `prefers-reduced-motion: reduce`.
- At 900px and below, the page returns to normal document scrolling and stacks the sidebar above the detail view. At 600px and below, the header, scan form, and results bar wrap onto additional rows, and metadata cards use a single-column or compact two-column layout.
- Use borders and section dividers for structure; do not add heavy shadows or decorative panels that reduce usable report space.
- Use the monospace stack for code blocks, selectors, rule IDs, and HTML-tag fragments embedded in otherwise editorial titles.

### Spacing System
- Base unit: 8px
- Scale: 8px, 10px, 12px, 16px, 24px, 32px, 40px, 56px, 80px, 96px, 128px, 176px, 192px, 208px
- The scale expands generously at the top end — sections use 80px–208px vertical spacing for editorial breathing room

### Grid & Container
- Max content width: approximately 1200px (centered)
- Hero: centered single-column with massive vertical padding (96px+)
- Feature sections: 2–3 column grids
- Full-width footer with multi-column link layout
- Showcase sections with centered card grids

### Whitespace Philosophy
- **Editorial generosity**: Lovable's spacing is lavish at section boundaries (80px–208px). The warm cream background makes these expanses feel cozy rather than empty.
- **Content-driven rhythm**: Tight internal spacing within cards (12–24px) contrasts with wide section gaps, creating a reading rhythm that alternates between focused content and visual rest.
- **Section separation**: Footer uses `1px solid #eceae4` border and 16px radius container. Sections defined by generous spacing rather than border lines.

### Border Radius Scale
- Micro (4px): Small buttons, interactive elements
- Standard (6px): Buttons, inputs, navigation menu
- Comfortable (8px): Compact cards, divs
- Card (12px): Standard cards, image containers, templates
- Container (16px): Large containers, footer sections
- Full Pill (9999px): Action pills, icon buttons, toggles

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (Level 0) | No shadow, cream background | Page surface, most content |
| Bordered (Level 1) | `1px solid #eceae4` | Cards, images, dividers |
| Inset (Level 2) | `rgba(255,255,255,0.2) 0px 0.5px 0px inset, rgba(0,0,0,0.2) 0px 0px 0px 0.5px inset, rgba(0,0,0,0.05) 0px 1px 2px` | Dark buttons, primary actions |
| Focus (Level 3) | `rgba(0,0,0,0.1) 0px 4px 12px` | Active/focus states |
| Ring (Accessibility) | `rgba(59,130,246,0.5)` 2px ring | Keyboard focus on inputs |

**Shadow Philosophy**: Lovable's depth system is intentionally shallow. Instead of floating cards with dramatic drop-shadows, the system relies on warm borders (`#eceae4`) against the cream surface to create gentle containment. The only notable shadow pattern is the inset shadow on dark buttons — a subtle multi-layer technique where a white highlight line sits at the top edge while a dark ring and soft drop handle the bottom. This creates a tactile, pressed-into-surface feeling rather than a hovering-above-surface feeling. The warm focus shadow (`rgba(0,0,0,0.1) 0px 4px 12px`) is deliberately diffused and large, creating a soft glow rather than a sharp outline.

### Decorative Depth
- Hero: soft, warm multi-color gradient wash (pinks, oranges, blues) behind hero — atmospheric, barely visible
- Footer: gradient background with warm tones transitioning to the bottom
- No harsh section dividers — spacing and background warmth handle transitions

## 7. Do's and Don'ts

### Do
- Use the warm cream background (`#f7f4ed`) as the page foundation — it's the brand's signature warmth
- Use Camera Plain Variable at display sizes with negative letter-spacing (-0.9px to -1.5px)
- Derive all grays from `#1c1c1c` at varying opacity levels for tonal unity
- Use the inset shadow technique on dark buttons for tactile depth
- Use `#eceae4` borders instead of shadows for card containment
- Keep the weight system narrow: 400 for body/UI, 600 for headings
- Use full-pill radius (9999px) only for action pills and icon buttons
- Apply opacity 0.8 on active states for responsive tactile feedback

### Don't
- Don't use pure white (`#ffffff`) as a page background — the cream is intentional
- Don't use heavy box-shadows for cards — borders are the containment mechanism
- Don't use accent colors as decoration. Severity is the only color-coded attribute; everything else is text.
- Don't use weight 700 (bold) — 600 is the maximum weight in the system
- Don't apply 9999px radius on rectangular buttons — pills are for icon/action toggles
- Don't use sharp focus outlines — the system uses soft shadow-based focus indicators
- Don't mix border styles — `#eceae4` for passive, `rgba(28,28,28,0.4)` for interactive
- Don't increase letter-spacing on headings — Camera Plain is designed to run tight at scale

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile Small | <600px | Tight single column, reduced padding |
| Mobile | 600–640px | Standard mobile layout |
| Tablet Small | 640–700px | 2-column grids begin |
| Tablet | 700–768px | Card grids expand |
| Desktop Small | 768–1024px | Multi-column layouts |
| Desktop | 1024–1280px | Full feature layout |
| Large Desktop | 1280–1536px | Maximum content width, generous margins |

### Touch Targets
- Buttons: 8px 16px padding (comfortable touch)
- Navigation: adequate spacing between items
- Pill buttons: 9999px radius creates large tap-friendly targets
- Menu toggle: 6px radius button with adequate sizing

### Collapsing Strategy
- Hero: 60px → 48px → 36px headline scaling with proportional letter-spacing
- Navigation: horizontal links → hamburger menu at 768px
- Feature cards: 3-column → 2-column → single column stacked
- Template gallery: grid → stacked vertical cards
- Stats bar: horizontal → stacked vertical
- Footer: multi-column → stacked single column
- Section spacing: 128px+ → 64px on mobile

### Image Behavior
- Template screenshots maintain `1px solid #eceae4` border at all sizes
- 12px border radius preserved across breakpoints
- Gallery images responsive with consistent aspect ratios
- Hero gradient softens/simplifies on mobile

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary CTA: Charcoal (`#1c1c1c`)
- Background: Cream (`#f7f4ed`)
- Heading text: Charcoal (`#1c1c1c`)
- Body text: Muted Gray (`#5f5f5d`)
- Border: `#eceae4` (passive), `rgba(28,28,28,0.4)` (interactive)
- Focus: `rgba(0,0,0,0.1) 0px 4px 12px`
- Button text on dark: `#fcfbf8`

### Example Component Prompts
- "Create a hero section on cream background (#f7f4ed). Headline at 60px Camera Plain Variable weight 600, line-height 1.10, letter-spacing -1.5px, color #1c1c1c. Subtitle at 18px weight 400, line-height 1.38, color #5f5f5d. Dark CTA button (#1c1c1c bg, #fcfbf8 text, 6px radius, 8px 16px padding, inset shadow) and ghost button (transparent bg, 1px solid rgba(28,28,28,0.4) border, 6px radius)."
- "Design a card on cream (#f7f4ed) background. Border: 1px solid #eceae4. Radius 12px. No box-shadow. Title at 20px Camera Plain Variable weight 400, line-height 1.25, color #1c1c1c. Body at 14px weight 400, color #5f5f5d."
- "Build a template gallery: grid of cards with 12px radius, 1px solid #eceae4 border, cream backgrounds. Each card: image with 12px top radius, title below. Hover: subtle border darkening."
- "Create navigation: sticky on cream (#f7f4ed). Camera Plain 16px weight 400 for links, #1c1c1c text. Dark CTA button right-aligned with inset shadow. Mobile: hamburger menu with 6px radius."
- "Design a stats section: large numbers at 48px Camera Plain weight 600, letter-spacing -1.2px, #1c1c1c. Labels below at 16px weight 400, #5f5f5d. Horizontal layout with 32px gap."

### Iteration Guide
1. Always use cream (`#f7f4ed`) as the base — never pure white
2. Derive grays from `#1c1c1c` at opacity levels rather than using distinct hex values
3. Use `#eceae4` borders for containment, not shadows
4. Letter-spacing scales with size: -1.5px at 60px, -1.2px at 48px, -0.9px at 36px, normal at 16px
5. Two weights: 400 (everything except headings) and 600 (headings)
6. The inset shadow on dark buttons is the signature detail — don't skip it
7. Camera Plain Variable at weight 480 is for special display moments only
