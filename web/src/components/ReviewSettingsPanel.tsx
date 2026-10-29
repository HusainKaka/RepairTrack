import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, apiMessage } from "../api/client";
import type { ApiEnvelope } from "../types";
import { ErrorBlock, LoadingBlock } from "./Feedback";
import { isGoogleReviewLink } from "../utils/whatsapp";

interface ReviewSettings { googleReviewUrl: string | null }

export function ReviewSettingsPanel() {
  const client = useQueryClient();
  const [url, setUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const query = useQuery({ queryKey: ["review-settings"], queryFn: async () => (await api.get<ApiEnvelope<ReviewSettings>>("/settings/reviews")).data.data });
  useEffect(() => { if (query.data && !dirty) setUrl(query.data.googleReviewUrl ?? ""); }, [query.data, dirty]);
  const save = useMutation({
    mutationFn: async () => (await api.put<ApiEnvelope<ReviewSettings>>("/settings/reviews", { googleReviewUrl: url.trim() || null })).data.data,
    onSuccess: async (value) => { client.setQueryData(["review-settings"], value); setUrl(value.googleReviewUrl ?? ""); setDirty(false); setSaved(true); await client.invalidateQueries({ queryKey: ["repair-tracking"] }); },
  });
  const valid = !url.trim() || isGoogleReviewLink(url.trim());
  return <Card sx={{ mb: 3 }} component="section" aria-labelledby="review-settings-heading"><CardContent>
    <Typography id="review-settings-heading" component="h2" variant="h6">Google review requests</Typography>
    <Typography variant="body2" color="text.secondary" mt={1} mb={2}>Completion emails include this link when the customer has chosen email updates. Completed repairs also offer a WhatsApp draft: you check it and press Send yourself. No review request is automatically sent through WhatsApp.</Typography>
    {query.isLoading ? <LoadingBlock /> : query.error ? <ErrorBlock message={apiMessage(query.error)} retry={() => void query.refetch()} /> : <Stack component="form" gap={2} onSubmit={(event) => { event.preventDefault(); if (valid && dirty && !save.isPending) save.mutate(); }}>
      <TextField label="Google review link" type="url" value={url} disabled={save.isPending} onChange={event => { setUrl(event.target.value); setDirty(true); setSaved(false); }} error={!valid} helperText={valid ? "Paste the Ask for reviews link from your Google Business Profile. Leave blank and save to disable review links." : "Use a Google review link: g.page/r/…/review, Google writereview, or maps.app.goo.gl."} slotProps={{ htmlInput: { maxLength: 2048 } }} fullWidth />
      {save.error && <Alert severity="error">{apiMessage(save.error)} Your entered link has been kept.</Alert>}
      {saved && <Alert severity="success" role="status">Review settings saved. Existing customer messages are not resent.</Alert>}
      <Button type="submit" variant="contained" disabled={!valid || !dirty || save.isPending} sx={{ alignSelf: "flex-start" }}>{save.isPending ? "Saving…" : "Save review settings"}</Button>
    </Stack>}
  </CardContent></Card>;
}
