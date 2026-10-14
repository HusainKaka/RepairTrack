import WhatsApp from "@mui/icons-material/WhatsApp";
import { Button, Stack, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import { buildWhatsAppShare, normalizeWhatsAppPhone } from "../utils/whatsapp";
import type { WhatsAppShareDetails, WhatsAppShareInput } from "../utils/whatsapp";

interface Props extends WhatsAppShareInput {
  label?: string;
  disabled?: boolean;
  prepareShare?: () => Promise<WhatsAppShareDetails>;
}

export function WhatsAppShareButton({ label = "Send to WhatsApp", disabled = false, prepareShare, ...input }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const result = buildWhatsAppShare(input, window.location.origin);
  const validRecipient = Boolean(normalizeWhatsAppPhone(input.whatsappPhone?.trim() || input.phone?.trim() || ""));
  const canPrepare = Boolean(prepareShare && validRecipient && input.reference.trim());
  const unavailable = !result.ok && !canPrepare;
  const hint = error || (unavailable && !result.ok ? result.reason : `Opens a draft. Review the recipient and message, then press Send in WhatsApp.${prepareShare ? " Private invoice links expire in 7 days." : ""}`);

  async function prepareAndOpen() {
    if (!prepareShare || pending) return;
    setError("");
    // Reserve the new tab in the original click; an async window.open would be blocked.
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setError("Allow pop-ups for RepairTrack, then click Send to WhatsApp again.");
      return;
    }
    try {
      popup.opener = null;
      const policy = popup.document.createElement("meta");
      policy.name = "referrer";
      policy.content = "no-referrer";
      popup.document.head.appendChild(policy);
      popup.document.title = "Preparing WhatsApp draft";
      popup.document.body.textContent = "Preparing your private invoice link…";
      setPending(true);
      const details = await prepareShare();
      const prepared = buildWhatsAppShare({ ...input, ...details }, window.location.origin);
      if (!prepared.ok) throw new Error("Invalid sharing link");
      if (!popup.closed) popup.location.replace(prepared.href);
    } catch {
      if (!popup.closed) popup.close();
      setError("The sharing link could not be prepared. No message was sent. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <Stack spacing={0.5} alignItems="flex-start" sx={{ minWidth: 0, maxWidth: { xs: "100%", sm: 300 } }}>
    <Tooltip title={unavailable ? hint : ""}>
      <span>{prepareShare
        ? <Button variant="outlined" startIcon={<WhatsApp />} disabled={disabled || pending || unavailable} onClick={prepareAndOpen}>{pending ? "Preparing WhatsApp…" : label}</Button>
        : result.ok && !disabled
          ? <Button component="a" href={result.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" variant="outlined" startIcon={<WhatsApp />}>{label}</Button>
          : <Button variant="outlined" startIcon={<WhatsApp />} disabled>{label}</Button>}
      </span>
    </Tooltip>
    <Typography variant="caption" sx={{ overflowWrap: "anywhere" }} color={error ? "error" : "text.secondary"} role={error ? "alert" : undefined}>{hint}</Typography>
  </Stack>;
}
