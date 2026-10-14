# RepairTrack digital services upgrade

## Scope

Preserve existing repair operations, layout and light AURA branding. Add website, software and AI-agent service intake, tracking and workflow. Digital-service billing is explicitly manual. Replace remote logo URL entry with validated image uploads, show branding in billing PDFs and emails, make KRA display optional and disabled by default, remove Google sign-in, and extend consent-aware WhatsApp intake notices.

## Delivery plan

- Confirm existing data/API contracts and design additive, non-destructive migrations.
- Implement tenant-scoped digital tickets and public/customer tracking, assignment, workflow history and manual invoice association.
- Add corresponding digital-solutions views without rearranging existing repair pages.
- Implement bounded, validated logo storage and billing/email rendering; gate KRA content using administrator settings.
- Remove the Google sign-in flow and configuration notice, preserving real authentication error feedback.
- Queue/send intake notices for all service categories using the existing notification system and configured WhatsApp provider; never claim delivery when unconfigured.
- Track work in GitHub issues and a project board where connection permissions permit.
- Test authorization, tenant boundaries, upload handling, tracking privacy, manual invoicing and notification behavior; run type checks, lint, builds and dependency audit.
- Apply additive migrations through the existing deployment workflow, push the reviewed release, and verify both Vercel projects and public smoke checks.

## Acceptance gates

- Repair data and existing billing remain compatible.
- Digital tickets have distinct references, appropriate stages and customer-safe tracking.
- Logo uploads are authorized, bounded, validated and durable; no arbitrary URL fetching.
- KRA content stays hidden while disabled; enabling requires deliberate admin configuration.
- WhatsApp notifications honor customer consent and accurately record delivery failures.
- No Google sign-in widget or unconfigured Google notice remains.
- Deployment status and commit are verified; missing external setup is reported honestly.

## External prerequisites

WhatsApp live sending requires valid provider credentials, approved template and recipient opt-in. Production schema changes require a working migration path. GitHub project-board creation depends on the authenticated connection's permissions. None of these prerequisites justifies exposing secrets or bypassing access controls.
