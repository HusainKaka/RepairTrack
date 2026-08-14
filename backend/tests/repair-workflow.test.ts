import { RepairStatus } from "../src/generated/prisma/index.js";
import { describe, expect, it } from "vitest";
import { canTransition } from "../src/modules/repairs/repair.routes.js";

describe("repair workflow", () => {
  it("allows documented forward and exception transitions", () => {
    expect(canTransition(RepairStatus.RECEIVED, RepairStatus.DIAGNOSING)).toBe(true);
    expect(canTransition(RepairStatus.TESTING, RepairStatus.IN_PROGRESS)).toBe(true);
    expect(canTransition(RepairStatus.READY_FOR_COLLECTION, RepairStatus.COLLECTED)).toBe(true);
  });

  it("prevents terminal and skipped transitions", () => {
    expect(canTransition(RepairStatus.RECEIVED, RepairStatus.COLLECTED)).toBe(false);
    expect(canTransition(RepairStatus.COLLECTED, RepairStatus.IN_PROGRESS)).toBe(false);
    expect(canTransition(RepairStatus.CANCELLED, RepairStatus.RECEIVED)).toBe(false);
  });
});
