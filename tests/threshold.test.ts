import { describe, expect, it } from "vitest";
import { scanRepository } from "../src/scanners/repository.js";
import { hasFindingsAtOrAbove } from "../src/utils.js";

describe("CI severity threshold", () => {
  it("fails at or above the configured severity and passes clean results", async () => {
    const inaccessible = await scanRepository("tests/fixtures/inaccessible");
    const accessible = await scanRepository("tests/fixtures/accessible");
    expect(hasFindingsAtOrAbove(inaccessible, "serious")).toBe(true);
    expect(hasFindingsAtOrAbove(accessible, "minor")).toBe(false);
  });
});
