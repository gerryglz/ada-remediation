import { describe, expect, it } from "vitest";
import { htmlReport, sarifReport, terminalReport } from "../src/reporters/index.js";
import { scanRepository } from "../src/scanners/repository.js";

describe("reporters", () => {
  it("renders terminal, HTML, and SARIF output", async () => {
    const result = await scanRepository("tests/fixtures/inaccessible");
    expect(terminalReport(result)).toContain("Automated results cannot certify");
    expect(htmlReport(result)).toContain("Filter findings");
    const sarif = JSON.parse(sarifReport(result)) as { version: string; runs: unknown[] };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
  });
});
