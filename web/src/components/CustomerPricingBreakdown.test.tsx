import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CustomerPricingBreakdown } from "./CustomerPricingBreakdown";

export const pricing = { status: "ISSUED", subtotal: "6000", discountAmount: "600", invoiceLevelDiscount: "300", taxAmount: "912", total: "6312", amountPaid: "2000", balance: "4312", items: [
  { description: "Replacement charging port", quantity: "2", unitPrice: "2000", discount: "200", taxRate: "16", lineTotal: "4408" },
  { description: "Labour and verification", quantity: "1", unitPrice: "2000", discount: "100", taxRate: "16", lineTotal: "2204" },
] };
afterEach(cleanup);
describe("customer pricing", () => {
  it("shows saved item prices and separates line discounts from the invoice discount without deducting them twice", () => {
    render(<CustomerPricingBreakdown invoice={pricing} currency="USD" />);
    const items = within(screen.getByRole("list", { name: "Invoice items" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("USD 200.00")).toBeInTheDocument();
    expect(within(items[0]).getByText("Line total USD 4,408.00")).toBeInTheDocument();
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("USD 6,312.00");
    expect(screen.getByText("Item discounts").nextElementSibling).toHaveTextContent("USD 300.00");
    expect(screen.getByText("Invoice discount").nextElementSibling).toHaveTextContent("USD 300.00");
    expect(screen.getByText("Balance due").nextElementSibling).toHaveTextContent("USD 4,312.00");
    expect(screen.getByText("Tax").nextElementSibling).toHaveTextContent("USD 912.00");
    expect(screen.getAllByText("Tax rate")).toHaveLength(2);
  });
  it("keeps zero amounts visible and labels drafts without inventing missing values", () => {
    render(<CustomerPricingBreakdown invoice={{ status: "DRAFT", balance: "0", total: "0" }} />);
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("KES 0.00");
    expect(screen.getByText("Subtotal before discounts").nextElementSibling).toHaveTextContent("—");
    expect(screen.getByText(/Item details are not available/)).toBeInTheDocument();
    expect(screen.getByText(/Draft estimate/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("NaN");
  });
  it.each(["0", "16"])("omits every tax label when the saved invoice has no tax charge (stored rate=%s)", taxRate => {
    render(<CustomerPricingBreakdown invoice={{ ...pricing, taxAmount: "0", total: "5400", balance: "3400", items: pricing.items.map(item => ({ ...item, taxRate })) }} />);
    expect(screen.queryByText("Tax")).not.toBeInTheDocument();
    expect(screen.queryByText("Tax rate")).not.toBeInTheDocument();
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("KES 5,400.00");
    expect(screen.getByText("Invoice discount")).toBeInTheDocument();
  });
});
