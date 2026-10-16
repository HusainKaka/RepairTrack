import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RecordName } from "./RecordName";

it("keeps the full name available while the foreground CSS limits its visual lines", () => {
  const name = "Lenovo ThinkPad T14 Gen 3 with a deliberately long demonstration model name";
  render(<RecordName>{name}</RecordName>);
  expect(screen.getByTitle(name)).toHaveTextContent(name);
  expect(screen.getByTitle(name)).toHaveClass("product-record-name");
});
