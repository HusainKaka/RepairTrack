interface Contact { phone: string; whatsappPhone?: string | null; whatsappOptIn?: boolean }

/** Consent belongs to the recipient, not merely a customer's preferred channel. */
export function whatsappConsentUpdate(input: Partial<Contact>, existing?: Contact): { whatsappOptIn?: boolean; whatsappOptInAt?: Date | null } {
  const previous = existing?.whatsappPhone || existing?.phone;
  const next = input.whatsappPhone ?? existing?.whatsappPhone ?? input.phone ?? existing?.phone;
  if (input.whatsappOptIn === true) return { whatsappOptIn: true, whatsappOptInAt: new Date() };
  if (input.whatsappOptIn === false || !existing || previous !== next) return { whatsappOptIn: false, whatsappOptInAt: null };
  return {};
}
