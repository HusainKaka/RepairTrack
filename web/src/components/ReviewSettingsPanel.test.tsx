import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("../api/client", () => ({ api, apiMessage: () => "Save unavailable" }));
import { ReviewSettingsPanel } from "./ReviewSettingsPanel";
const url="https://g.page/r/Cbadgp9VKwYjEBI/review";
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{data:{googleReviewUrl:null}}});});
afterEach(cleanup);
function mount(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><ReviewSettingsPanel/></QueryClientProvider>);}
it("keeps failed changes and rejects an unrelated URL without saving",async()=>{
 api.put.mockRejectedValue(new Error());mount();
 const input=await screen.findByLabelText("Google review link");
 fireEvent.change(input,{target:{value:"https://evil.test"}});
 expect(screen.getByRole("button",{name:"Save review settings"})).toBeDisabled();
 fireEvent.change(input,{target:{value:url}});
 fireEvent.click(screen.getByRole("button",{name:"Save review settings"}));
 await screen.findByText(/Your entered link has been kept/);
 expect(input).toHaveValue(url);
 expect(api.put).toHaveBeenCalledWith("/settings/reviews",{googleReviewUrl:url});
});
it("allows review links to be disabled without sending old messages",async()=>{
 api.get.mockResolvedValue({data:{data:{googleReviewUrl:url}}});
 api.put.mockResolvedValue({data:{data:{googleReviewUrl:null}}});mount();
 const input=await screen.findByLabelText("Google review link");
 await waitFor(()=>expect(input).toHaveValue(url));
 fireEvent.change(input,{target:{value:""}});fireEvent.click(screen.getByRole("button",{name:"Save review settings"}));
 await screen.findByText(/Existing customer messages are not resent/);
 expect(api.put).toHaveBeenCalledWith("/settings/reviews",{googleReviewUrl:null});
});
