import { describe, expect, it } from "vitest";
import type { Repair } from "../../types";
import { readRepairContext, repairDate, repairListPath, sortedRepairs, stageTransitions } from "./repairPresentation";

describe("repair presentation contract", () => {
  it("retains supported local view context and rejects unknown status/sort values", () => {
    expect(readRepairContext(new URLSearchParams("q=charging&status=TESTING&sort=oldest"))).toEqual({ q: "charging", status: "TESTING", sort: "oldest" });
    expect(readRepairContext(new URLSearchParams("status=FAKE&sort=server-total"))).toEqual({ q: "", status: "", sort: "priority" });
  });
  it("constructs only the repair-list return destination", () => {
    expect(repairListPath("q=power&status=RECEIVED&sort=newest&redirect=https://evil.example")).toBe("/repairs?q=power&status=RECEIVED&sort=newest");
    expect(repairListPath({ pathname: "https://evil.example" })).toBe("/repairs");
  });
  it("sorts loaded copies without altering source data or inventing records", () => {
    const data = [{ id: "old", priority: "LOW", createdAt: "2026-10-01" }, { id: "urgent", priority: "URGENT", createdAt: "2026-10-02" }, { id: "new", priority: "NORMAL", createdAt: "2026-10-03" }] as Repair[];
    expect(sortedRepairs(data, "priority").map((repair) => repair.id)).toEqual(["urgent", "new", "old"]);
    expect(sortedRepairs(data, "newest").map((repair) => repair.id)).toEqual(["new", "urgent", "old"]);
    expect(sortedRepairs(data, "oldest").map((repair) => repair.id)).toEqual(["old", "urgent", "new"]);
    expect(data.map((repair) => repair.id)).toEqual(["old", "urgent", "new"]);
  });
  it("keeps terminal and skipped transitions unavailable", () => {
    expect(stageTransitions.RECEIVED).toEqual(["DIAGNOSING", "CANCELLED"]);
    expect(stageTransitions.COLLECTED).toEqual([]);
    expect(stageTransitions.CANCELLED).toEqual([]);
    expect(stageTransitions.TESTING).toEqual(["IN_PROGRESS", "COMPLETED"]);
  });
  it("handles missing or malformed dates without fabricating an ETA", () => {
    expect(repairDate()).toBe("Not set");
    expect(repairDate("not-a-date")).toBe("Not set");
  });
});
