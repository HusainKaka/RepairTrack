import axios from "axios";
import { describe, expect, it } from "vitest";
import { apiBaseURL, apiMessage } from "./client";

describe("apiMessage", () => {
  it("uses a safe server message", () => {
    const error = new axios.AxiosError("bad request", "400", undefined, undefined, { data: { message: "Customer is required." }, status: 400, statusText: "Bad Request", headers: {}, config: { headers: new axios.AxiosHeaders() } });
    expect(apiMessage(error)).toBe("Customer is required.");
  });

  it("falls back for non-error values", () => {
    expect(apiMessage(null)).toBe("An unexpected error occurred.");
  });
  it("uses a first-party API path in production regardless of an old cross-site setting", () => {
    expect(apiBaseURL(true, "https://api.example.test/api/v1")).toBe("/api/v1");
  });
  it("preserves the configured development API", () => {
    expect(apiBaseURL(false, "http://localhost:4400/api/v1")).toBe("http://localhost:4400/api/v1");
    expect(apiBaseURL(false)).toBe("http://localhost:4000/api/v1");
  });
});
