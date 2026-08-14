# M-Pesa/Daraja readiness

RepairTrack currently supports `MPESA` as an administrator-recorded payment method with a mandatory verified transaction reference. It does not call Daraja and does not claim live confirmation. The typed `MpesaGateway` boundary in `backend/src/modules/invoices/payment-provider.ts`, environment placeholders, enums, and database reference fields are ready for a future gateway.

## Required production design

1. Register a Safaricom Daraja application and obtain sandbox credentials from the official developer portal.
2. Keep consumer secret, passkey, and shortcode only in backend secrets: `MPESA_ENVIRONMENT`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`.
3. Add a `PaymentProvider` interface with `initiate`, `query`, and verified callback handling. Implement a Daraja adapter and a failing/unconfigured adapter; never return synthetic success.
4. Add a payment-intent table containing business/invoice/customer, amount, merchant request ID, checkout request ID, idempotency key, status, raw-provider reference, timestamps, and safely redacted response metadata.
5. Expose an authenticated STK initiation endpoint and an HTTPS callback endpoint. Bind initiation to the tenant invoice and reject amount/balance mismatches.
6. Authenticate/tokenize against the configured sandbox/production host with strict timeouts. Generate timestamp/password on the server.
7. On callback, find the unique checkout request, validate expected shortcode/amount/account reference, make processing idempotent, and create the RepairTrack `Payment` and `Receipt` in one transaction only after confirmed success.
8. Reconcile uncertain callbacks through Daraja query rather than assuming failure or success. Store provider errors without secrets or full phone data.
9. Use sandbox test numbers first, then complete Safaricom production approval and operational monitoring.

Manual recording remains available for cash/card/bank/verified M-Pesa transactions. Staff must independently verify the transaction reference before recording it. Never accept screenshots as cryptographic provider confirmation.
