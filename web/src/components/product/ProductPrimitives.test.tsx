import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuItem, TextField } from "@mui/material";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProductFormDialog } from "./ProductFormDialog";
import { ProductTable } from "./ProductTable";

describe("operational product primitives", () => {
  it("protects a MUI select-only edit on Cancel and keeps the selection", async () => {
    const close = vi.fn();
    function Draft() {
      const [method, setMethod] = useState("CASH");
      return <ProductFormDialog open title="Record payment" onClose={close} onSubmit={vi.fn()}><TextField select label="Method" value={method} onChange={(event) => setMethod(event.target.value)}><MenuItem value="CASH">Cash</MenuItem><MenuItem value="CARD">Card</MenuItem></TextField></ProductFormDialog>;
    }
    render(<Draft />);
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Method" }));
    fireEvent.click(screen.getByRole("option", { name: "Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Leave this form?" })).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(await screen.findByRole("combobox", { name: "Method" })).toHaveTextContent("Card");
  });
  it("pages only the supplied records and labels that boundary", async () => {
    render(<ProductTable columns={["Reference"]} rows={Array.from({ length: 18 }, (_, i) => [`REP-${i + 1}`])} caption="Latest loaded repairs" />);
    expect(screen.getByText("Latest loaded repairs")).toBeInTheDocument();
    expect(screen.getByText("1–15 of 18 loaded")).toBeInTheDocument();
    expect(screen.queryByText("REP-18")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(screen.getByText("REP-18")).toBeInTheDocument();
    expect(screen.getByText("16–18 of 18 loaded")).toBeInTheDocument();
  });

  it("is a semantic form with a named dialog and prevents pending duplicates", () => {
    const save = vi.fn();
    const { rerender } = render(<ProductFormDialog open title="Add work note" onClose={vi.fn()} onSubmit={save}><TextField label="Note" /></ProductFormDialog>);
    const form = screen.getByRole("dialog", { name: "Add work note" }).querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(save).toHaveBeenCalledOnce();
    rerender(<ProductFormDialog open busy title="Add work note" onClose={vi.fn()} onSubmit={save}><TextField label="Note" /></ProductFormDialog>);
    fireEvent.submit(form!);
    expect(save).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("protects a changed draft on Cancel and keeps it after a failed save", async () => {
    const close = vi.fn();
    const content = <TextField label="Work note" defaultValue="Connector replaced" />;
    const { rerender } = render(<ProductFormDialog open title="Add work note" onClose={close} onSubmit={vi.fn()}>{content}</ProductFormDialog>);
    await userEvent.type(screen.getByLabelText("Work note"), ". Test under load.");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "Leave this form?" })).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    rerender(<ProductFormDialog open title="Add work note" error="Connection unavailable. Try again." onClose={close} onSubmit={vi.fn()}>{content}</ProductFormDialog>);
    expect(screen.getByLabelText("Work note")).toHaveValue("Connector replaced. Test under load.");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  });

  it("can explicitly mark acknowledgement dialogs clean", async () => {
    const close = vi.fn();
    render(<ProductFormDialog open title="Intake complete" dirty={false} onClose={close} onSubmit={vi.fn()}><TextField label="Reference" defaultValue="REP-1" /></ProductFormDialog>);
    await userEvent.type(screen.getByLabelText("Reference"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Leave this form?" })).not.toBeInTheDocument();
  });

  it("retains legacy decimal-number input while enforcing explicit constraints", async () => {
    const save = vi.fn();
    const { rerender } = render(<ProductFormDialog open title="Record amount" onClose={vi.fn()} onSubmit={save}><TextField required type="number" label="Amount" defaultValue="12.50" /></ProductFormDialog>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledOnce();
    rerender(<ProductFormDialog open title="Record amount" onClose={vi.fn()} onSubmit={save}><TextField required type="number" label="Amount" defaultValue="12.50" slotProps={{ htmlInput: { min: 20, step: 0.01 } }} /></ProductFormDialog>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("Amount must be at least 20.");
    await userEvent.click(screen.getByRole("button", { name: "Amount must be at least 20." }));
    expect(screen.getByLabelText(/Amount/)).toHaveFocus();
  });
});
