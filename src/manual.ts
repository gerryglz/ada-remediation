import type { ManualCheck, WcagLevel } from "./types.js";

const levelRank: Record<WcagLevel, number> = { A: 1, AA: 2, AAA: 3 };
const criterionLevels: Partial<Record<string, WcagLevel>> = {
  "1.2.4": "AA", "1.2.5": "AA", "1.3.4": "AA", "1.4.3": "AA", "1.4.10": "AA", "1.4.11": "AA", "1.4.12": "AA", "1.4.13": "AA",
  "2.4.7": "AA", "2.4.11": "AA", "2.5.7": "AA", "2.5.8": "AA", "3.3.3": "AA", "3.3.4": "AA", "4.1.3": "AA",
  "1.2.6": "AAA", "1.2.7": "AAA", "1.4.6": "AAA", "2.1.3": "AAA", "2.2.3": "AAA", "2.2.4": "AAA", "2.3.2": "AAA", "2.4.9": "AAA", "3.1.5": "AAA", "3.1.6": "AAA",
};

const checks: ManualCheck[] = [
  {
    id: "keyboard-focus",
    category: "Keyboard",
    title: "Complete keyboard navigation and focus review",
    description: "Confirm every control works without a mouse, focus follows a logical order, focus is visible, and no component traps the keyboard.",
    wcagLevel: "A",
    wcag: ["2.1.1", "2.1.2", "2.4.3", "2.4.7", "2.4.11"],
    steps: ["Use Tab and Shift+Tab through the entire page.", "Operate menus, dialogs, carousels, and custom widgets with expected keyboard commands.", "Confirm focus is always visible, logically ordered, and not hidden by sticky content.", "Verify there is no keyboard trap."],
    status: "todo",
  },
  {
    id: "screen-reader",
    category: "Screen reader",
    title: "Review structure, names, roles, and reading order",
    description: "Use a representative screen reader to confirm the page is announced in a meaningful order and interactive controls expose accurate names, roles, states, and values.",
    wcagLevel: "A",
    wcag: ["1.3.1", "1.3.2", "4.1.2"],
    steps: ["Navigate by headings, landmarks, links, controls, and form fields.", "Compare the spoken order with the visual and task order.", "Confirm custom controls announce their name, role, state, and value.", "Check that meaningful images and icons have useful alternatives."],
    status: "todo",
  },
  {
    id: "forms-errors",
    category: "Forms",
    title: "Complete forms, instructions, and error recovery",
    description: "Submit each form with missing and invalid data and confirm instructions, errors, suggestions, and confirmation behavior are understandable and programmatically associated.",
    wcagLevel: "A",
    wcag: ["3.3.1", "3.3.2", "3.3.3", "3.3.4"],
    steps: ["Complete the form using keyboard and screen reader input.", "Trigger every validation state.", "Confirm errors identify the field and explain how to correct it.", "Verify important submissions can be reviewed, corrected, or reversed when required."],
    status: "todo",
  },
  {
    id: "color-visual",
    category: "Color and visuals",
    title: "Verify color use, non-text contrast, and forced-colors behavior",
    description: "Automated text-contrast results are included when measurable. Manually verify information is not conveyed by color alone and that controls, focus indicators, graphics, and states remain perceivable.",
    wcagLevel: "A",
    wcag: ["1.4.1", "1.4.3", "1.4.11"],
    steps: ["Inspect default, hover, focus, active, disabled, error, and visited states.", "Confirm color is not the only way information or status is communicated.", "Measure boundaries, icons, charts, and focus indicators that automated tools cannot reliably isolate.", "Test Windows High Contrast or another forced-colors mode."],
    status: "todo",
  },
  {
    id: "media",
    category: "Media",
    title: "Review audio and video alternatives",
    description: "Confirm prerecorded and live media provide the captions, transcripts, audio description, and controls required for the selected content and conformance target.",
    wcagLevel: "A",
    wcag: ["1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5"],
    steps: ["Review captions for accuracy, speaker identification, and meaningful sound cues.", "Confirm transcripts or media alternatives convey equivalent information.", "Check audio description where important visual content is not otherwise available.", "Verify media controls are keyboard and screen-reader operable."],
    status: "todo",
  },
  {
    id: "motion-timing",
    category: "Motion and timing",
    title: "Test motion, animation, flashing, and time limits",
    description: "Exercise timed and moving content to confirm users can pause, stop, extend, or avoid it and that flashing content stays within safe thresholds.",
    wcagLevel: "A",
    wcag: ["2.2.1", "2.2.2", "2.3.1"],
    steps: ["Locate time limits, auto-updates, carousels, and animated content.", "Confirm users can pause, stop, hide, or extend them where required.", "Test prefers-reduced-motion behavior.", "Review any flashing content with an appropriate flash-analysis tool."],
    status: "todo",
  },
  {
    id: "zoom-reflow",
    category: "Responsive content",
    title: "Test zoom, reflow, orientation, and text spacing",
    description: "Confirm content remains readable and operable when enlarged, reflowed, rotated, and displayed with increased text spacing.",
    wcagLevel: "AA",
    wcag: ["1.3.4", "1.4.4", "1.4.10", "1.4.12", "1.4.13"],
    steps: ["Zoom text to 200% and the page to 400% at a 1280px-wide viewport.", "Check that content reflows without two-dimensional scrolling except where essential.", "Apply WCAG text-spacing overrides and check for clipping or overlap.", "Test portrait and landscape orientation plus hover/focus content dismissal."],
    status: "todo",
  },
  {
    id: "dynamic-status",
    category: "Dynamic updates",
    title: "Verify status messages and dynamic changes",
    description: "Confirm loading, success, error, cart, search, and other updates are announced without unexpectedly moving focus.",
    wcagLevel: "AA",
    wcag: ["4.1.3"],
    steps: ["Trigger asynchronous loading, filtering, validation, and success states.", "Confirm important updates are announced by a screen reader.", "Verify focus moves only when the user task requires it.", "Check repeated announcements are not noisy or misleading."],
    status: "todo",
  },
  {
    id: "pointer-touch",
    category: "Pointer and touch",
    title: "Test gestures, dragging, and target sizes",
    description: "Confirm pointer interactions have simple alternatives and controls are large and separated enough to operate reliably.",
    wcagLevel: "AA",
    wcag: ["2.5.1", "2.5.2", "2.5.7", "2.5.8"],
    steps: ["Test touch and mouse input at responsive breakpoints.", "Provide single-pointer alternatives for multipoint gestures and dragging.", "Confirm activation happens predictably and can be cancelled where required.", "Measure small targets and verify spacing or an allowed exception."],
    status: "todo",
  },
  {
    id: "aaa-enhanced",
    category: "Level AAA",
    title: "Complete enhanced Level AAA review",
    description: "Review the enhanced requirements that depend heavily on content decisions, user testing, and page-specific context.",
    wcagLevel: "AAA",
    wcag: ["1.2.6", "1.2.7", "1.4.6", "2.1.3", "2.2.3", "2.2.4", "2.3.2", "2.4.9", "3.1.5", "3.1.6"],
    steps: ["Confirm enhanced contrast and keyboard access across every state.", "Review media for sign language and extended alternatives where applicable.", "Check timing, interruptions, flashing, link purpose, reading level, and pronunciation requirements.", "Document any AAA criterion that is not applicable and why."],
    status: "todo",
  },
];

export function manualReviewChecklist(level: WcagLevel = "AA"): ManualCheck[] {
  return checks
    .filter((check) => levelRank[check.wcagLevel] <= levelRank[level])
    .map((check) => ({
      ...check,
      wcag: check.wcag.filter((criterion) => levelRank[criterionLevels[criterion] ?? "A"] <= levelRank[level]),
      steps: [...check.steps],
    }));
}
