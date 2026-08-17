const escapeHtml = (value: string | number | null | undefined): string => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

interface RepairEmailInput {
  business: { name: string; logoUrl: string | null; email: string; phone: string; address: string; city: string };
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
  const logo = input.business.logoUrl
    ? `<img src="${escapeHtml(input.business.logoUrl)}" width="150" alt="${escapeHtml(input.business.name)}" style="display:block;max-width:150px;max-height:72px;object-fit:contain">`
    : `<div style="font-size:22px;font-weight:800;color:#2563eb">${escapeHtml(input.business.name)}</div>`;
  const due = input.amountDue === undefined ? "" : `<tr><td style="padding:6px 0;color:#64748b">Amount due</td><td style="padding:6px 0;text-align:right;font-weight:700">${escapeHtml(input.currency)} ${input.amountDue.toFixed(2)}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="padding:24px 30px;background:#eff6ff">${logo}</td></tr><tr><td style="padding:30px"><div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:700">${escapeHtml(input.statusLabel)}</div><h1 style="font-size:26px;margin:18px 0 8px">Repair ${escapeHtml(input.reference)}</h1><p style="line-height:1.6;color:#475569">Hello ${escapeHtml(input.customerName)},</p><p style="line-height:1.6;color:#475569">${escapeHtml(input.message)}</p><table role="presentation" width="100%" style="margin:24px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0"><tr><td style="padding:14px 0;color:#64748b">Device</td><td style="padding:14px 0;text-align:right;font-weight:700">${escapeHtml(input.device)}</td></tr><tr><td style="padding:6px 0 14px;color:#64748b">Received</td><td style="padding:6px 0 14px;text-align:right;font-weight:700">${escapeHtml(input.dateReceived.toLocaleDateString("en-KE"))}</td></tr>${due}</table><p style="text-align:center;margin:28px 0"><a href="${escapeHtml(input.trackingUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:9px">Track / View Repair</a></p><p style="font-size:13px;line-height:1.5;color:#64748b">For assistance, contact ${escapeHtml(input.business.phone)} or ${escapeHtml(input.business.email)}.<br>${escapeHtml(input.business.address)}, ${escapeHtml(input.business.city)}</p></td></tr><tr><td style="padding:18px 30px;background:#0f172a;color:#cbd5e1;font-size:12px">This message contains customer-visible repair information only. Keep the tracking link private.</td></tr></table></td></tr></table></body></html>`;
  const text = `${input.statusLabel}\n\nHello ${input.customerName},\n\n${input.message}\n\nRepair: ${input.reference}\nDevice: ${input.device}\nTrack: ${input.trackingUrl}\n\nContact ${input.business.name}: ${input.business.phone} / ${input.business.email}`;
  return { html, text };
}
