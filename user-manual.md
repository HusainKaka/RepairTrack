# RepairTrack user manual

RepairTrack shows different navigation and actions based on the signed-in role. The server enforces the same rules even if a URL is entered manually.

## Accessing an account

- Customers can choose sign-up, enter the business ID from the repair business, verify email, then sign in.
- Existing users can use email/password or a configured Google account.
- Forgot password sends the same generic response whether or not an account exists. Use only the latest unexpired reset link.
- Android can enable biometric unlock after the first successful session. Biometrics unlock the encrypted local session; they do not replace server authentication.
- Sign out when using a shared device. Password reset, business suspension, technician disable, and account-deletion requests revoke sessions.

## Common navigation

- Dashboard summarizes role-relevant work.
- Repairs opens the permitted repair list and detail timeline.
- Notifications shows in-app events; select unread items to mark them read.
- Profile shows identity/security context and supports personal detail updates on web.
- QR scanner on Android opens a customer-safe tracking result.

## Status meanings

`RECEIVED` → `DIAGNOSING` → approval/parts/in-progress → `TESTING` → `COMPLETED` → `READY_FOR_COLLECTION` → `COLLECTED`. Cancelled work is terminal. Some branches can return from testing to in progress or from in progress to waiting for parts.

## Privacy

Do not put passwords, card data, or unnecessary personal information in notes. Internal notes are for staff; customer-visible messages can appear in tracking. Use Profile → Request account deletion to revoke sessions and queue a privacy review. Legally required invoice/audit records may be retained in minimized form.

See the role guides: [administrator](administrator-manual.md), [technician](technician-manual.md), and [customer](customer-manual.md).
