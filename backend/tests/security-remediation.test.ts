import { describe, expect, it } from "vitest";
import { customerView } from "../src/lib/customer-view.js";
import { csvCell } from "../src/lib/csv.js";
import { isPublicAddress, loadPublicLogo } from "../src/lib/public-image.js";
import { dashboardView } from "../src/modules/reports/dashboard-view.js";

describe("security remediations", () => {
  it("does not expose business financial totals to technicians", () => {
    const data = { statuses: { IN_PROGRESS: 2 }, revenueToday: 100, revenueMonth: 200, outstanding: { amount: 50 }, monthlyRevenue: [] };
    expect(dashboardView(data, "TECHNICIAN")).toEqual({ statuses: { IN_PROGRESS: 2 } });
    expect(dashboardView(data, "BUSINESS_ADMIN")).toBe(data);
  });
  it("removes internal fields from nested customer records without mutating staff data", () => {
    const record = { reference: "RT-001", internalNotes: "private", diagnosis: "private", publicTrackingTokenEncrypted: "private", customer: { notes: "private" }, invoices: [{ notes: "private", items: [{ historicalUnitCost: 100, unitPrice: 150 }] }], notes: [{ visibility: "INTERNAL", body: "private" }, { visibility: "CUSTOMER", body: "Device ready" }] };
    const safe = customerView(record);
    expect(JSON.stringify(safe)).not.toContain("private");
    expect(JSON.stringify(safe)).not.toContain("historicalUnitCost");
    expect(JSON.stringify(safe)).toContain("Device ready");
    expect(record.internalNotes).toBe("private");
  });
  it.each(["=WEBSERVICE(\"https://example.test\")", "+SUM(1,2)", "-1+2", "@SUM(1,2)", "  =1+1", "\t=1+1"])("neutralizes spreadsheet formula %s", value => {
    expect(csvCell(value)).toMatch(/^"'/);
  });
  it("escapes normal CSV text without changing its contents", () => { expect(csvCell('Repair "A"')).toBe('"Repair ""A"""'); });
  it("preserves actual negative numeric values", () => { expect(csvCell(-25)).toBe('"-25"'); });
  it.each(["127.0.0.1", "0.0.0.0", "10.0.0.1", "100.64.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "224.0.0.1", "::1", "::ffff:127.0.0.1", "fe90::1", "fc00::1", "64:ff9b::a00:1", "2002:a00:1::"])("rejects private or special IP %s", address => { expect(isPublicAddress(address)).toBe(false); });
  it("accepts global unicast IPs", () => { expect(isPublicAddress("8.8.8.8")).toBe(true); expect(isPublicAddress("2606:4700:4700::1111")).toBe(true); });
  it("rejects unsafe logo schemes and private destinations without making requests", async () => {
    expect(await loadPublicLogo("http://example.test/logo.png")).toBeNull();
    expect(await loadPublicLogo("https://127.0.0.1/logo.png")).toBeNull();
    expect(await loadPublicLogo("https://[::ffff:127.0.0.1]/logo.png")).toBeNull();
    expect(await loadPublicLogo("https://example.test:8443/logo.png")).toBeNull();
  });
});
