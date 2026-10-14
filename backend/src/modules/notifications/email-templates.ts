const escapeHtml = (value: string | number | null | undefined): string => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

interface CustomerEmailInput {
  business: { name: string; email: string; phone: string; address: string; city: string };
  logoCid?: string;
  customerName: string;
  reference: string;
  title: string;
  statusLabel: string;
  message: string;
  details: Array<{ label: string; value: string }>;
  actionUrl?: string;
  actionLabel?: string;
}

/** Logos are trusted inline attachments, never arbitrary remote fetch URLs. All content is escaped. */
export function renderCustomerEmail(input: CustomerEmailInput): { html: string; text: string } {
  const logo = input.logoCid
    ? `<img src="cid:${escapeHtml(input.logoCid)}" width="150" alt="${escapeHtml(input.business.name)}" style="display:block;max-width:150px;max-height:120px;object-fit:contain">`
    : `<div style="font-size:22px;font-weight:800;color:#2563eb">${escapeHtml(input.business.name)}</div>`;
  const details = input.details.map(({ label, value }) => `<tr><td style="padding:8px 0;color:#475569">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:right;font-weight:700">${escapeHtml(value)}</td></tr>`).join("");
  const action = input.actionUrl ? `<p style="text-align:center;margin:28px 0"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:9px">${escapeHtml(input.actionLabel ?? "View ticket")}</a></p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="padding:24px 30px;background:#eff6ff">${logo}</td></tr><tr><td style="padding:30px"><div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:700">${escapeHtml(input.statusLabel)}</div><h1 style="font-size:26px;margin:18px 0 8px">${escapeHtml(input.title)} ${escapeHtml(input.reference)}</h1><p style="line-height:1.6;color:#334155">Hello ${escapeHtml(input.customerName)},</p><p style="line-height:1.6;color:#334155">${escapeHtml(input.message)}</p><table role="presentation" width="100%" style="margin:24px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${details}</table>${action}<p style="font-size:13px;line-height:1.5;color:#475569">For assistance, contact ${escapeHtml(input.business.phone)} or ${escapeHtml(input.business.email)}.<br>${escapeHtml(input.business.address)}, ${escapeHtml(input.business.city)}</p></td></tr><tr><td style="padding:18px 30px;background:#eff6ff;color:#334155;font-size:12px">This message contains customer-visible information only. Keep private tracking links confidential.</td></tr></table></td></tr></table></body></html>`;
  const text = `${input.statusLabel}\n\nHello ${input.customerName},\n\n${input.message}\n\n${input.title}: ${input.reference}\n${input.details.map(detail => `${detail.label}: ${detail.value}`).join("\n")}${input.actionUrl ? `\n${input.actionLabel ?? "View ticket"}: ${input.actionUrl}` : ""}\n\nContact ${input.business.name}: ${input.business.phone} / ${input.business.email}`;
  return { html, text };
}

interface RepairEmailInput {
  business: CustomerEmailInput["business"];
  logoCid?: string;
  customerName: string;
  reference: string;
  device: string;
  dateReceived: Date;
  trackingUrl: string;
  statusLabel: string;
  message: string;
  amountDue?: number;
  currency: string;
}

export function renderRepairEmail(input: RepairEmailInput): { html: string; text: string } {
  return renderCustomerEmail({ ...input, title: "Repair", details: [{ label: "Device", value: input.device }, { label: "Received", value: input.dateReceived.toLocaleDateString("en-KE") }, ...(input.amountDue === undefined ? [] : [{ label: "Amount due", value: `${input.currency} ${input.amountDue.toFixed(2)}` }])], actionUrl: input.trackingUrl, actionLabel: "Track / View Repair" });
}
