import axios from "axios";
import { describe, expect, it } from "vitest";
import { apiMessage } from "./client";

describe("apiMessage", () => {
  it("uses a safe server message", () => {
    const error = new axios.AxiosError("bad request", "400", undefined, undefined, { data: { message: "Customer is required." }, status: 400, statusText: "Bad Request", headers: {}, config: { headers: new axios.AxiosHeaders() } });
    expect(apiMessage(error)).toBe("Customer is required.");
  });

  it("falls back for non-error values", () => {
    expect(apiMessage(null)).toBe("An unexpected error occurred.");
  });
});
