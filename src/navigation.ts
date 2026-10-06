import type { Page, Response } from "playwright";

type NavigationPage = Pick<Page, "goto" | "waitForLoadState" | "waitForTimeout">;

export class PageNavigationError extends Error {
  readonly stage = "navigation" as const;
  readonly attempts: number;

  constructor(url: string, attempts: number, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Navigation failed after ${attempts} attempts: ${detail}`);
    this.name = "PageNavigationError";
    this.attempts = attempts;
    this.cause = cause;
  }
}

// Identity of a page for crawl de-duplication. "/" and "/index.html" are the same page on
// almost every host, and scanning both double-counts every finding on it.
export function crawlKey(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/index\.html?$/i, "/");
  return parsed.href;
}

function assertUsableResponse(response: Response | null, url: string): void {
  if (response && response.status() >= 400) throw new Error(`HTTP ${response.status()} returned for ${url}`);
}

export async function navigateForAccessibilityScan(
  page: NavigationPage,
  url: string,
  timeout: number,
  onAttempt?: (attempt: number, maximumAttempts: number) => void,
): Promise<number> {
  const maximumAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    onAttempt?.(attempt, maximumAttempts);
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      assertUsableResponse(response, url);
      await page.waitForLoadState("load", { timeout: Math.min(4_000, timeout) }).catch(() => undefined);
      await page.waitForTimeout(600);
      return attempt;
    } catch (error) {
      lastError = error;
    }
  }

  throw new PageNavigationError(url, maximumAttempts, lastError);
}
